import { useEffect, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { palette } from '@/theme';
import { useFeelSettings } from '@/feel';

/**
 * A short pixel particle burst: a handful of tiny squares flung outward with a
 * little gravity and a fade. Drives the "feel" on makes, threes, dunks, and
 * blocks. Reuses the reanimated timing pattern from the other feel primitives,
 * caps the particle count for performance, self-terminates (no timers), and is
 * skipped entirely under reduced motion. Re-fires whenever `trigger` changes.
 */

export type BurstVariant = 'confetti' | 'spark' | 'debris' | 'cool';

interface ParticleBurstProps {
  /** Pixel origin within the parent layer. Null hides the burst. */
  origin: { x: number; y: number } | null;
  variant: BurstVariant;
  /** Tints every particle when set (e.g. the scoring team's color on makes). */
  color?: string;
  /** Re-fires the burst whenever this value changes. */
  trigger: unknown;
}

const PARTICLE_COUNT = 12;
const DURATION = 460;
const GRAVITY = 46;

const VARIANT_COLORS: Record<BurstVariant, string[]> = {
  confetti: [palette.gold, palette.ink, palette.makeGreenLt],
  spark: [palette.ink, palette.gold],
  debris: [palette.courtLine, palette.inkDim, palette.orange],
  cool: [palette.steelBlue, palette.ink],
};

function Particle({
  index,
  trigger,
  color,
}: {
  index: number;
  trigger: unknown;
  color: string;
}) {
  const progress = useSharedValue(0);

  // Frozen kinematics: vary by index + trigger so each burst looks different but
  // a given particle stays stable across renders within one burst.
  const kin = useMemo(() => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 26 + Math.random() * 42;
    return {
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 18, // bias slightly up before gravity
      spin: (Math.random() - 0.5) * 220,
      size: 3 + Math.round(Math.random()),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, trigger]);

  // Replay on mount (the parent remounts particles by keying on `trigger`).
  useEffect(() => {
    progress.value = withTiming(1, {
      duration: DURATION,
      easing: Easing.out(Easing.quad),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => {
    const t = progress.value;
    return {
      opacity: 1 - t,
      transform: [
        { translateX: kin.vx * t },
        { translateY: kin.vy * t + GRAVITY * t * t },
        { rotate: `${kin.spin * t}deg` },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.particle,
        { width: kin.size, height: kin.size, backgroundColor: color },
        style,
      ]}
    />
  );
}

export function ParticleBurst({
  origin,
  variant,
  color,
  trigger,
}: ParticleBurstProps) {
  const { reducedMotion } = useFeelSettings();
  if (reducedMotion || !origin) return null;

  const colors = VARIANT_COLORS[variant];

  return (
    <View
      key={String(trigger)}
      pointerEvents="none"
      style={[styles.host, { left: origin.x, top: origin.y }]}
    >
      {Array.from({ length: PARTICLE_COUNT }, (_, i) => (
        <Particle
          key={i}
          index={i}
          trigger={trigger}
          color={color ?? colors[i % colors.length]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  particle: {
    position: 'absolute',
  },
});
