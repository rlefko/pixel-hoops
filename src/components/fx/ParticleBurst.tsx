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
import { createRNG } from '@/game/rng';

/**
 * A short pixel particle burst: a handful of tiny squares flung outward with a
 * little gravity and a fade. Drives the "feel" on makes, threes, dunks, and
 * defensive stops. Counts default per variant (kept small so routine plays stay
 * calm; confetti is the one place to spend particles) and can be overridden.
 * Kinematics are seeded deterministically from the trigger so a burst is stable
 * and repeatable. Self-terminates (no timers), skipped under reduced motion, and
 * re-fires whenever `trigger` changes.
 */

export type BurstVariant = 'confetti' | 'spark' | 'debris' | 'cool';

interface ParticleBurstProps {
  /** Pixel origin within the parent layer. Null hides the burst. */
  origin: { x: number; y: number } | null;
  variant: BurstVariant;
  /** Particle count. Defaults to a per-variant amount; capped for performance. */
  count?: number;
  /** Tints every particle when set (e.g. the scoring team's color on makes). */
  color?: string;
  /** Re-fires the burst whenever this value changes. */
  trigger: unknown;
}

const DURATION = 460;
const GRAVITY = 46;
const MAX_PARTICLES = 24;

const VARIANT_COLORS: Record<BurstVariant, string[]> = {
  confetti: [palette.gold, palette.ink, palette.makeGreenLt],
  spark: [palette.ink, palette.gold],
  debris: [palette.courtLine, palette.inkDim, palette.orange],
  cool: [palette.steelBlue, palette.ink],
};

/** Calm defaults: a flick for routine sparks, density only for confetti. */
const VARIANT_COUNT: Record<BurstVariant, number> = {
  confetti: 14,
  spark: 5,
  debris: 8,
  cool: 6,
};

function Particle({
  index,
  seed,
  color,
}: {
  index: number;
  seed: number;
  color: string;
}) {
  const progress = useSharedValue(0);

  // Frozen kinematics: a seeded RNG (one stream per particle) keeps each burst
  // varied but stable across renders, with no global Math.random.
  const kin = useMemo(() => {
    const rng = createRNG(`${seed}:${index}`);
    const angle = rng.next() * Math.PI * 2;
    const speed = 26 + rng.next() * 42;
    return {
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 18, // bias slightly up before gravity
      spin: (rng.next() - 0.5) * 220,
      size: 3 + Math.round(rng.next()),
    };
  }, [seed, index]);

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
  count,
  color,
  trigger,
}: ParticleBurstProps) {
  const { reducedMotion } = useFeelSettings();
  if (reducedMotion || !origin) return null;

  const colors = VARIANT_COLORS[variant];
  const n = Math.min(count ?? VARIANT_COUNT[variant], MAX_PARTICLES);
  const seed = (Number(trigger) || 0) + 1;

  return (
    <View
      key={String(trigger)}
      pointerEvents="none"
      style={[styles.host, { left: origin.x, top: origin.y }]}
    >
      {Array.from({ length: n }, (_, i) => (
        <Particle
          key={i}
          index={i}
          seed={seed}
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
