import { useEffect, useMemo } from 'react';
import { View, StyleSheet, type DimensionValue } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { palette } from '@/theme';
import { useFeelSettings } from '@/feel';
import { createRNG } from '@/game/rng';

/**
 * A faint field of slowly drifting pixel "motes" behind a hub screen: court-colored
 * 3-4px squares that breathe up and down, evoking dust in an arena's lights. Pure
 * atmosphere, so it renders only when Arcade Extras is on and reduced motion is off,
 * and it freezes in place (does not unmount) when `paused`. Mounted full-bleed behind
 * a screen's content. Positions are seeded per mote (stable, no global Math.random),
 * matching ParticleBurst, and the count is capped low so it never competes with the
 * live court's sprite budget (do not mount it on the sim).
 */

const MOTE_COUNT = 8;
const MOTE_COLORS = [palette.courtLine, palette.steelBlue];

function Mote({ index, paused }: { index: number; paused: boolean }) {
  const v = useSharedValue(0);

  // Frozen, seeded look + motion per mote so the field is varied but stable.
  const kin = useMemo(() => {
    const rng = createRNG(`mote:${index}`);
    return {
      left: `${4 + rng.next() * 92}%` as DimensionValue,
      top: `${rng.next() * 100}%` as DimensionValue,
      size: 3 + Math.round(rng.next()),
      color: MOTE_COLORS[index % MOTE_COLORS.length],
      opacity: 0.08 + rng.next() * 0.04,
      amp: 24 + rng.next() * 36,
      durationMs: 9000 + Math.round(rng.next() * 6000),
      delayMs: Math.round(rng.next() * 4000),
    };
  }, [index]);

  useEffect(() => {
    if (paused) {
      cancelAnimation(v); // hold in place; resumes on the next touch
      return;
    }
    v.value = withDelay(
      kin.delayMs,
      withRepeat(
        withTiming(1, { duration: kin.durationMs, easing: Easing.inOut(Easing.quad) }),
        -1,
        true
      )
    );
    return () => cancelAnimation(v);
  }, [paused, kin.delayMs, kin.durationMs, v]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -kin.amp * v.value }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.mote,
        {
          left: kin.left,
          top: kin.top,
          width: kin.size,
          height: kin.size,
          backgroundColor: kin.color,
          opacity: kin.opacity,
        },
        style,
      ]}
    />
  );
}

interface ArcadeBackdropProps {
  /** Freeze the drift when the screen is idle. */
  paused?: boolean;
}

export function ArcadeBackdrop({ paused = false }: ArcadeBackdropProps) {
  const { arcadeExtras, reducedMotion } = useFeelSettings();
  if (!arcadeExtras || reducedMotion) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: MOTE_COUNT }, (_, i) => (
        <Mote key={i} index={i} paused={paused} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  mote: { position: 'absolute', borderRadius: 1 },
});
