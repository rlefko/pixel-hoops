import { useCallback } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { DUR } from './timings';
import { useFeelSettings } from './FeelSettingsContext';

/**
 * Scale-punch for score changes and callouts: quick overshoot, then a snappy
 * spring back to 1. Spread `popStyle` onto an Animated.View and call `pop()` on
 * the moment to emphasize. No-op when reduced motion is on.
 */
export function usePop() {
  const scale = useSharedValue(1);
  const { reducedMotion } = useFeelSettings();

  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const pop = useCallback(
    (opts?: { scale?: number; duration?: number }) => {
      if (reducedMotion) return;
      const peak = opts?.scale ?? 1.18;
      const duration = opts?.duration ?? DUR.fast;
      scale.value = withSequence(
        withTiming(peak, { duration: duration * 0.4, easing: Easing.out(Easing.cubic) }),
        withSpring(1, { damping: 11, stiffness: 220, mass: 0.5 })
      );
    },
    [reducedMotion, scale]
  );

  return { popStyle, pop };
}
