import { useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { useFeelSettings } from './FeelSettingsContext';

/**
 * A slow, looping "breathe" for drawing the eye to reachable map nodes and the
 * position marker. Spread one of the returned styles onto an Animated.View. The
 * loop is gentle (pixel feel, not floaty) and holds a steady lit state under
 * reduced motion so the affordance stays clear without animating.
 */
export function usePulse(durationMs = 900) {
  const v = useSharedValue(0); // 0..1
  const { reducedMotion } = useFeelSettings();

  useEffect(() => {
    if (reducedMotion) {
      v.value = 1; // steady lit
      return;
    }
    v.value = withRepeat(
      withTiming(1, { duration: durationMs, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
    return () => cancelAnimation(v);
  }, [reducedMotion, durationMs, v]);

  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.45 + 0.55 * v.value }));
  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.04 * v.value }],
  }));
  const bobStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -2 * v.value }],
  }));

  return { glowStyle, scaleStyle, bobStyle };
}
