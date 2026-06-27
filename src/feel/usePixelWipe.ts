import { useCallback, useState } from 'react';
import {
  useSharedValue,
  withTiming,
  withDelay,
  cancelAnimation,
  runOnJS,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { DUR } from './timings';
import { useFeelSettings } from './FeelSettingsContext';
import { haptics } from './haptics';
import { palette } from '@/theme';

/** Which flavor of the pixel wipe to play. `run` is the bigger power-up boot. */
export type WipeVariant = 'menu' | 'run';

/**
 * Everything the overlay needs to paint one transition. The provider builds it
 * per navigation, so each destination gets its own accent color, label, and
 * sweep direction (forward navigations and returns home mirror each other).
 */
export interface WipeConfig {
  variant: WipeVariant;
  /** Accent color: the traveling cell band, the cover flash, and the label. */
  color: string;
  /** Destination label punch-in; forward navigation only. */
  label?: string;
  direction: 'forward' | 'backward';
}

/**
 * The slice of config the overlay reads from React (label text, accent color,
 * and whether this is the run boot). The persistent cell grid reads the rest from
 * shared values, so starting a transition never re-renders or remounts the grid.
 */
export interface WipeMeta {
  color: string;
  label?: string;
  isRun: boolean;
}

/**
 * Per-variant timing. `progress` runs 0 -> 1 (cover) -> 2 (reveal) as one
 * continuous sweep, so cover and reveal share a speed for a single clean pass;
 * `hold` is the brief full-cover dwell that lets the label read. Reduced motion
 * overrides both with a quick fade.
 */
const TIMING: Record<WipeVariant, { cover: number; reveal: number; hold: number }> = {
  menu: { cover: DUR.snap, reveal: DUR.snap, hold: DUR.instant }, // 180 / 180, 80ms dwell
  run: { cover: DUR.count, reveal: DUR.count, hold: DUR.instant / 2 }, // 260 / 260, ~40ms settle
};

const DEFAULT_CONFIG: WipeConfig = {
  variant: 'menu',
  color: palette.gold,
  direction: 'backward',
};

export interface PixelWipe {
  /** Sweep position: 0 = clear, 1 = fully covered, 2 = cleared again. */
  progress: SharedValue<number>;
  /** Accent color for the traveling band (hex string). */
  accent: SharedValue<string>;
  /** Base block color: bgDeep for menu, bgPanel for run. */
  base: SharedValue<string>;
  /** 1 = run (flat fill), 0 = menu (directional color band). */
  runFlag: SharedValue<number>;
  /** 1 = forward sweep, 0 = backward (mirrored). */
  dir: SharedValue<number>;
  /** True while a wipe is in flight; gates pointer events only. */
  active: boolean;
  /** The React-visible slice of the current config (label, flash, fade tint). */
  meta: WipeMeta;
  /** Fill the screen with the mosaic. Resolves once fully covered. */
  cover: (config?: WipeConfig) => Promise<void>;
  /** Clear the mosaic to reveal the new screen. Resolves once done. */
  reveal: (config?: WipeConfig) => Promise<void>;
}

/**
 * Drives the pixel-dissolve transition. The grid's whole appearance lives in
 * shared values (`progress`, `accent`, `base`, `runFlag`, `dir`) so the overlay
 * can keep its cells mounted permanently and a transition is just a few shared
 * value writes plus a tween: no per-transition mount, so the wipe starts on the
 * next frame. Mirrors useBallFlight, which animates a fixed set of views the same
 * way. `cover`/`reveal` resolve from the worklet completion via runOnJS.
 */
export function usePixelWipe(): PixelWipe {
  const progress = useSharedValue(0);
  const accent = useSharedValue<string>(palette.gold);
  const base = useSharedValue<string>(palette.bgDeep);
  const runFlag = useSharedValue(0);
  const dir = useSharedValue(0);
  const [active, setActive] = useState(false);
  const [meta, setMeta] = useState<WipeMeta>({ color: palette.gold, isRun: false });
  const { reducedMotion } = useFeelSettings();

  // Tween `progress` to a target and resolve on the JS thread once it lands, the
  // same worklet-completion handoff useBallFlight uses. Linear keeps the
  // dissolve wavefront sweeping at a constant rate.
  const animate = useCallback(
    (to: number, duration: number, delay = 0): Promise<void> =>
      new Promise((resolve) => {
        const onDone = (finished?: boolean) => {
          'worklet';
          if (finished) runOnJS(resolve)();
        };
        const tween = withTiming(to, { duration, easing: Easing.linear }, onDone);
        progress.value = delay ? withDelay(delay, tween) : tween;
      }),
    [progress]
  );

  const cover = useCallback(
    (next: WipeConfig = DEFAULT_CONFIG): Promise<void> => {
      cancelAnimation(progress);
      progress.value = 0; // restart the single sweep from the leading edge
      const isRun = next.variant === 'run';
      // Drive the persistent grid's look through shared values: these writes, not
      // a React mount, change the appearance, so there is nothing to commit and
      // the cover animates from the next frame.
      accent.value = next.color;
      base.value = isRun ? palette.bgPanel : palette.bgDeep;
      runFlag.value = isRun ? 1 : 0;
      dir.value = next.direction === 'forward' ? 1 : 0;
      // React-visible bits for the label, flash, and reduced-motion fade.
      setMeta({ color: next.color, label: next.label, isRun });
      setActive(true);
      // Haptics are not visual motion, so they fire regardless of reducedMotion;
      // the haptics wrapper already no-ops when haptics are off or on web.
      if (isRun) haptics.bigPlay();
      else haptics.selection();
      const duration = reducedMotion ? DUR.fast : TIMING[next.variant].cover;
      return animate(1, duration);
    },
    [accent, animate, base, dir, progress, reducedMotion, runFlag]
  );

  const reveal = useCallback(
    (next: WipeConfig = DEFAULT_CONFIG): Promise<void> => {
      const duration = reducedMotion ? DUR.fast : TIMING[next.variant].reveal;
      const hold = reducedMotion ? DUR.instant / 2 : TIMING[next.variant].hold;
      // Continue the sweep off-screen (1 -> 2) instead of reversing, so the wipe
      // reads as one pass, not a back-and-forth.
      return animate(2, duration, hold).then(() => setActive(false));
    },
    [animate, reducedMotion]
  );

  return { progress, accent, base, runFlag, dir, active, meta, cover, reveal };
}
