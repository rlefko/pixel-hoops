import { useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { useFeelSettings } from './FeelSettingsContext';

interface PulseOptions {
  /** Stagger the loop start so a group of pulses doesn't move in lockstep. */
  delayMs?: number;
  /** Bob travel in px (the breathe rise). Defaults to 2. */
  bobAmplitude?: number;
  /** Skip the loop and hold a steady lit state (e.g. an idle button that isn't pulsing). */
  paused?: boolean;
}

/**
 * A slow, looping "breathe" for drawing the eye to reachable map nodes, the
 * position marker, and the idle players on the court. Spread one of the returned
 * styles onto an Animated.View. The loop is gentle (pixel feel, not floaty) and
 * holds a steady lit state under reduced motion so the affordance stays clear
 * without animating. Pass `delayMs` to stagger a group out of lockstep and
 * `bobAmplitude` to soften the bob (e.g. a barely-there idle on the floor).
 */
export function usePulse(durationMs = 900, options: PulseOptions = {}) {
  const { delayMs = 0, bobAmplitude = 2, paused = false } = options;
  const v = useSharedValue(0); // 0..1
  const { reducedMotion } = useFeelSettings();

  useEffect(() => {
    if (reducedMotion || paused) {
      v.value = 1; // steady lit, no loop
      return;
    }
    const loop = withRepeat(
      withTiming(1, { duration: durationMs, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
    v.value = delayMs > 0 ? withDelay(delayMs, loop) : loop;
    return () => cancelAnimation(v);
  }, [reducedMotion, paused, durationMs, delayMs, v]);

  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.45 + 0.55 * v.value }));
  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.04 * v.value }],
  }));
  const bobStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -bobAmplitude * v.value }],
  }));

  return { glowStyle, scaleStyle, bobStyle };
}
