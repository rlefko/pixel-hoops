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
 * Cover/reveal durations and the full-cover hold per variant. The menu cover runs
 * a touch longer than its reveal so the destination label is readable; the run
 * variant keeps its punchy boot. Reduced motion overrides both with a quick fade.
 */
const TIMING: Record<WipeVariant, { cover: number; reveal: number; hold: number }> = {
  menu: { cover: DUR.count, reveal: DUR.snap, hold: 120 }, // 260 / 180, 120ms dwell to read the label
  run: { cover: DUR.count, reveal: DUR.count, hold: DUR.instant / 2 }, // 260 / 260, ~40ms settle
};

const DEFAULT_CONFIG: WipeConfig = {
  variant: 'menu',
  color: palette.gold,
  direction: 'backward',
};

export interface PixelWipe {
  /** 0 = fully clear, 1 = fully covered. Drives the cell grid opacity. */
  progress: SharedValue<number>;
  /** True while a wipe is mounted and blocking input. */
  active: boolean;
  /** The in-flight (or most recent) wipe config. */
  config: WipeConfig;
  /** Fill the screen with the mosaic. Resolves once fully covered. */
  cover: (config?: WipeConfig) => Promise<void>;
  /** Clear the mosaic to reveal the new screen. Resolves once done. */
  reveal: (config?: WipeConfig) => Promise<void>;
}

/**
 * Drives the pixel-dissolve transition: a single `progress` shared value that the
 * overlay's cell grid reads, plus awaitable `cover`/`reveal` steps so a navigator
 * can flip the route while the screen is fully obscured. Mirrors useFlash: the
 * hook owns the motion, the component (PixelWipeOverlay) owns the pixels.
 */
export function usePixelWipe(): PixelWipe {
  const progress = useSharedValue(0);
  const [active, setActive] = useState(false);
  const [config, setConfig] = useState<WipeConfig>(DEFAULT_CONFIG);
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
      // Commit config + active before the tween so any one-frame stale paint
      // happens while the cells are still at opacity 0 (invisible).
      setConfig(next);
      setActive(true);
      // Haptics are not visual motion, so they fire regardless of reducedMotion;
      // the haptics wrapper already no-ops when haptics are off or on web.
      if (next.variant === 'run') haptics.bigPlay();
      else haptics.selection();
      const duration = reducedMotion ? DUR.fast : TIMING[next.variant].cover;
      return animate(1, duration);
    },
    [animate, progress, reducedMotion]
  );

  const reveal = useCallback(
    (next: WipeConfig = DEFAULT_CONFIG): Promise<void> => {
      const duration = reducedMotion ? DUR.fast : TIMING[next.variant].reveal;
      const hold = reducedMotion ? DUR.instant / 2 : TIMING[next.variant].hold;
      return animate(0, duration, hold).then(() => setActive(false));
    },
    [animate, reducedMotion]
  );

  return { progress, active, config, cover, reveal };
}
