import { useCallback } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useFeelSettings } from './FeelSettingsContext';

/**
 * Animates a single ball view along a parabolic arc from a shooter to a rim.
 * Spread `ballStyle` onto an Animated.View and call `fire(origin, target)` when
 * a shot goes up. The ball hides itself when it lands. No-op under reduced
 * motion (the static held ball on the sprite stays as the read).
 */

export const BALL_FLIGHT_MS = 220;
const ARC = 26; // peak rise of the shot arc, in px

export function useBallFlight() {
  const ox = useSharedValue(0);
  const oy = useSharedValue(0);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const progress = useSharedValue(0);
  const opacity = useSharedValue(0);
  const { reducedMotion } = useFeelSettings();

  const ballStyle = useAnimatedStyle(() => {
    const t = progress.value;
    const x = ox.value + (tx.value - ox.value) * t;
    // 4 * t * (1 - t) peaks at 1.0 (when t = 0.5), so ARC is the true peak rise.
    const y = oy.value + (ty.value - oy.value) * t - ARC * 4 * t * (1 - t);
    return {
      opacity: opacity.value,
      transform: [{ translateX: x }, { translateY: y }],
    };
  });

  const fire = useCallback(
    (
      origin: { x: number; y: number },
      target: { x: number; y: number },
      duration = BALL_FLIGHT_MS
    ) => {
      if (reducedMotion) return;
      ox.value = origin.x;
      oy.value = origin.y;
      tx.value = target.x;
      ty.value = target.y;
      opacity.value = 1;
      progress.value = 0;
      progress.value = withTiming(
        1,
        { duration, easing: Easing.out(Easing.quad) },
        (finished) => {
          if (finished) opacity.value = 0;
        }
      );
    },
    [reducedMotion, ox, oy, tx, ty, progress, opacity]
  );

  return { ballStyle, fire };
}
