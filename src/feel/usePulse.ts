import { useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  cancelAnimation,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { useFeelSettings } from './FeelSettingsContext';

interface PulseOptions {
  /** Stagger the loop start so a group of pulses doesn't move in lockstep. */
  delayMs?: number;
  /** Bob travel in px (the breathe rise). Defaults to 2. Bob only. */
  bobAmplitude?: number;
  /** Skip the loop and hold a steady lit state (e.g. an idle button that isn't pulsing). */
  paused?: boolean;
}

/**
 * Shared driver for the slow "breathe" that draws the eye to reachable map nodes,
 * the position marker, legendary cards, and the idle players on the court. Returns
 * a 0..1 shared value that loops gently (pixel feel, not floaty). Holds a steady lit
 * state under reduced motion or when `paused`, so the affordance stays clear without
 * animating. Internal: the three style hooks below each read this value through a
 * single `useAnimatedStyle`, so a caller only pays for the one style it uses (rather
 * than always allocating glow + scale + bob worklets). Pass `delayMs` to stagger a
 * group out of lockstep.
 */
function usePulseValue(durationMs: number, delayMs: number, paused: boolean): SharedValue<number> {
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

  return v;
}

/** Looping opacity breathe (0.45 -> 1) for a glow/halo. One worklet. */
export function useGlowPulse(durationMs = 900, options: PulseOptions = {}) {
  const { delayMs = 0, paused = false } = options;
  const v = usePulseValue(durationMs, delayMs, paused);
  return useAnimatedStyle(() => ({ opacity: 0.45 + 0.55 * v.value }));
}

/** Looping vertical bob (a gentle breathe rise of `bobAmplitude` px). One worklet. */
export function useBobPulse(durationMs = 900, options: PulseOptions = {}) {
  const { delayMs = 0, bobAmplitude = 2, paused = false } = options;
  const v = usePulseValue(durationMs, delayMs, paused);
  return useAnimatedStyle(() => ({ transform: [{ translateY: -bobAmplitude * v.value }] }));
}

/** Looping scale breathe (1 -> 1.04). One worklet. */
export function useScalePulse(durationMs = 900, options: PulseOptions = {}) {
  const { delayMs = 0, paused = false } = options;
  const v = usePulseValue(durationMs, delayMs, paused);
  return useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.04 * v.value }] }));
}
