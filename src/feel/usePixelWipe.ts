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

/** Which flavor of the pixel wipe to play. `run` is the bigger power-up boot. */
export type WipeVariant = 'menu' | 'run';

/**
 * Cover/reveal durations per variant. The run variant runs longer for a bigger
 * "boot up" read; reduced motion overrides both with a single quick fade.
 */
const TIMING: Record<WipeVariant, { cover: number; reveal: number }> = {
  menu: { cover: DUR.snap, reveal: DUR.snap }, // 180 / 180
  run: { cover: DUR.count, reveal: DUR.count }, // 260 / 260
};

/**
 * A one-frame settle so the freshly navigated screen commits behind the cover
 * before the reveal starts, which avoids a flash of the old screen.
 */
const HOLD_MS = DUR.instant / 2; // ~40

export interface PixelWipe {
  /** 0 = fully clear, 1 = fully covered. Drives the cell grid opacity. */
  progress: SharedValue<number>;
  /** True while a wipe is mounted and blocking input. */
  active: boolean;
  /** The variant of the in-flight (or most recent) wipe. */
  variant: WipeVariant;
  /** Fill the screen with the mosaic. Resolves once fully covered. */
  cover: (variant?: WipeVariant) => Promise<void>;
  /** Clear the mosaic to reveal the new screen. Resolves once done. */
  reveal: (variant?: WipeVariant) => Promise<void>;
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
  const [variant, setVariant] = useState<WipeVariant>('menu');
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
    (v: WipeVariant = 'menu'): Promise<void> => {
      cancelAnimation(progress);
      setVariant(v);
      setActive(true);
      if (v === 'run' && !reducedMotion) haptics.bigPlay();
      const duration = reducedMotion ? DUR.fast : TIMING[v].cover;
      return animate(1, duration);
    },
    [animate, progress, reducedMotion]
  );

  const reveal = useCallback(
    (v: WipeVariant = 'menu'): Promise<void> => {
      const duration = reducedMotion ? DUR.fast : TIMING[v].reveal;
      return animate(0, duration, HOLD_MS).then(() => setActive(false));
    },
    [animate, reducedMotion]
  );

  return { progress, active, variant, cover, reveal };
}
