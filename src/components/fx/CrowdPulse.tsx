import { forwardRef, useImperativeHandle, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SIM_SPEED_FACTOR, scaled, useFeelSettings } from '@/feel';
import { palette, RADIUS } from '@/theme';
import type { CrowdPulseTier } from '@/game/crowd-pulse';

/**
 * The crowd-roar read: a one-shot glow on the court's EDGES (a 10px border, so
 * it frames the play instead of washing over it like FlashOverlay, and stays
 * visually distinct from CrunchVignette's 5px strips). Trigger through the ref
 * with a tier from the precomputed crowd plan (src/game/crowd-pulse.ts), which
 * caps beats per game; peak is reserved for the home walk-off.
 *
 * One-shot and opacity-only, so there is no loop to gate — it no-ops entirely
 * under reduced motion or with Arcade Extras off (pure atmosphere; the play's
 * own flash/haptics carry the semantics), the FlashOverlay/CrtVignette rules.
 */

export interface CrowdPulseHandle {
  pulse: (tier: CrowdPulseTier, color?: string) => void;
}

const PEAK: Record<CrowdPulseTier, number> = { small: 0.12, big: 0.2, peak: 0.32 };

export const CrowdPulse = forwardRef<CrowdPulseHandle>((_props, ref) => {
  const { reducedMotion, arcadeExtras, simSpeed } = useFeelSettings();
  const speed = SIM_SPEED_FACTOR[simSpeed];
  const opacity = useSharedValue(0);
  const [color, setColor] = useState<string>(palette.gold);

  useImperativeHandle(
    ref,
    () => ({
      pulse: (tier, next) => {
        if (reducedMotion || !arcadeExtras) return;
        if (next) setColor(next);
        opacity.value = withSequence(
          withTiming(PEAK[tier], { duration: scaled(80, speed), easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: scaled(180, speed), easing: Easing.in(Easing.quad) })
        );
      },
    }),
    [reducedMotion, arcadeExtras, speed, opacity]
  );

  const pulseStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.edge, { borderColor: color }, pulseStyle]}
    />
  );
});

CrowdPulse.displayName = 'CrowdPulse';

const styles = StyleSheet.create({
  edge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 10,
    borderRadius: RADIUS.chip,
  },
});
