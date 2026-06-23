import { useCallback, useState } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { DUR } from './timings';
import { palette } from '@/theme';
import { useFeelSettings } from './FeelSettingsContext';

/**
 * A hard color flash for hit confirmation. Drives the opacity of a full-bleed
 * overlay (see components/fx/FlashOverlay); `color` is the backing color to
 * render under the animated opacity. Fast on/off so it reads as a flash, not a
 * fade. No-op when reduced motion is on.
 */
export function useFlash() {
  const opacity = useSharedValue(0);
  const [color, setColor] = useState<string>(palette.makeGreen);
  const { reducedMotion } = useFeelSettings();

  const flashStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const flash = useCallback(
    (next?: string, opts?: { peak?: number }) => {
      if (reducedMotion) return;
      if (next) setColor(next);
      const peak = opts?.peak ?? 0.22;
      opacity.value = withSequence(
        withTiming(peak, { duration: DUR.instant }),
        withTiming(0, { duration: DUR.instant * 1.5 })
      );
    },
    [reducedMotion, opacity]
  );

  return { flashStyle, color, flash };
}
