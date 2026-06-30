import { useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { DUR } from './timings';
import { useFeelSettings } from './FeelSettingsContext';

interface StaggerInOptions {
  /** Delay added per index so a list reveals as a cascade. Default 45ms. */
  stepMs?: number;
  /** Clamp the cascade so a long or virtualized list's later rows aren't seconds late. Default 8. */
  maxIndex?: number;
  /** Slide-up travel in px (snapped to a whole pixel). Default 6. */
  distancePx?: number;
  /** Fade/slide duration. Default DUR.snap. */
  durationMs?: number;
}

/**
 * One-shot entrance: a card fades in (0 -> 1) and slides up (`distancePx` -> 0),
 * delayed by its `index` so a list reveals as a quick cascade. Plays once on mount,
 * then the View is static, so there is NO ambient loop to pause for battery. Snaps
 * straight to shown under reduced motion. Spread the returned style onto an
 * Animated.View, or use the <StaggerIn> wrapper. Clamp `index` to the initial window
 * in a virtualized list so recycled rows don't re-animate on scroll.
 */
export function useStaggerIn(index: number, options: StaggerInOptions = {}) {
  const { stepMs = 45, maxIndex = 8, distancePx = 6, durationMs = DUR.snap } = options;
  const { reducedMotion } = useFeelSettings();
  const v = useSharedValue(0); // 0 hidden -> 1 shown

  useEffect(() => {
    if (reducedMotion) {
      v.value = 1; // no entrance under reduced motion
      return;
    }
    const delay = Math.max(0, Math.min(index, maxIndex)) * stepMs;
    v.value = withDelay(
      delay,
      withTiming(1, { duration: durationMs, easing: Easing.out(Easing.quad) })
    );
  }, [reducedMotion, index, stepMs, maxIndex, durationMs, v]);

  return useAnimatedStyle(() => ({
    opacity: v.value,
    transform: [{ translateY: Math.round((1 - v.value) * distancePx) }],
  }));
}
