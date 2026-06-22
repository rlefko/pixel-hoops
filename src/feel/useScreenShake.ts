import { useCallback } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SHAKE_PX, type ShakeIntensity } from './timings';
import { useFeelSettings } from './FeelSettingsContext';

/**
 * Rattles a container on big plays. Spread `shakeStyle` onto an Animated.View
 * (see components/fx/ShakeView) and call `shake()` from a JS event handler.
 * Transforms snap to whole pixels so the shake stutters like a CRT. No-op when
 * reduced motion is on.
 */
export function useScreenShake() {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const { reducedMotion } = useFeelSettings();

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: Math.round(tx.value) },
      { translateY: Math.round(ty.value) },
    ],
  }));

  const shake = useCallback(
    (intensity: ShakeIntensity = 'medium') => {
      if (reducedMotion) return;
      const amp = SHAKE_PX[intensity];
      tx.value = withSequence(
        withTiming(amp, { duration: 40 }),
        withTiming(-amp * 0.7, { duration: 40 }),
        withTiming(amp * 0.4, { duration: 40 }),
        withTiming(0, { duration: 40 })
      );
      ty.value = withSequence(
        withTiming(-amp * 0.6, { duration: 40 }),
        withTiming(amp * 0.5, { duration: 40 }),
        withTiming(-amp * 0.3, { duration: 40 }),
        withTiming(0, { duration: 40 })
      );
    },
    [reducedMotion, tx, ty]
  );

  return { shakeStyle, shake };
}
