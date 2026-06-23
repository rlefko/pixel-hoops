import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useFeelSettings } from '@/feel';
import { rimCenterPx } from '@/components/game/courtGeometry';
import { palette } from '@/theme';
import { isMadeShot, type SimEvent } from '@/types/sim';

/**
 * A made-basket flourish at the rim: the permanent net (drawn in SvgCourt)
 * snaps down and settles as the ball drops through, plus a faint accent ring.
 * Driven by the landed event and the measured court size; fires only on makes,
 * at the rim the scoring side attacks, draping the correct direction per hoop.
 * Kept calm (the net swish is the read, the ring is a quiet accent). Skipped
 * under reduced motion.
 */

interface RimRippleProps {
  event: SimEvent | null;
  width: number;
  height: number;
  /** Court accent color (matches the rim) for the ring. */
  color: string;
}

const RING = 22;
const NET_W = 22;

export function RimRipple({ event, width, height, color }: RimRippleProps) {
  const { reducedMotion } = useFeelSettings();
  const pulse = useSharedValue(0); // ring
  const swish = useSharedValue(0); // net stretch
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  // +1 for the top hoop (net drapes down), -1 for the bottom hoop (drapes up).
  const [down, setDown] = useState(1);
  const lastSeq = useRef<number | null>(null);

  useEffect(() => {
    if (!event || width === 0 || height === 0) return;
    if (event.seq === lastSeq.current) return;
    lastSeq.current = event.seq;
    if (!isMadeShot(event)) return;
    setPos(rimCenterPx(event.team, width, height));
    setDown(event.team === 'home' ? 1 : -1);
    pulse.value = 0;
    pulse.value = withSequence(
      withTiming(1, { duration: 80, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 160 })
    );
    swish.value = 0;
    swish.value = withSequence(
      withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 260, easing: Easing.elastic(1.1) })
    );
  }, [event, width, height, pulse, swish]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: pulse.value * 0.6,
    transform: [{ scale: 1 + pulse.value * 0.35 }],
  }));

  const netStyle = useAnimatedStyle(() => ({
    opacity: swish.value * 0.9,
    transform: [
      { translateY: swish.value * 7 * down },
      { scaleY: 1 + swish.value * 0.45 },
    ],
  }));

  if (reducedMotion || !pos) return null;

  return (
    <View pointerEvents="none" style={[styles.host, { left: pos.x, top: pos.y }]}>
      <Animated.View style={[styles.ring, { borderColor: color }, ringStyle]} />
      <Animated.View
        style={[styles.net, down === 1 ? styles.netDown : styles.netUp, netStyle]}
      >
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.netLine} />
        ))}
      </Animated.View>
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
  ring: {
    position: 'absolute',
    width: RING,
    height: RING,
    marginLeft: -RING / 2,
    marginTop: -RING / 2,
    borderWidth: 2,
    borderRadius: 3,
  },
  net: {
    position: 'absolute',
    width: NET_W,
    marginLeft: -NET_W / 2,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 3,
  },
  // Drape from just below the rim (top hoop) or just above it (bottom hoop).
  netDown: { top: 3, alignItems: 'flex-start' },
  netUp: { bottom: 3, alignItems: 'flex-end' },
  netLine: {
    width: 2,
    height: 10,
    backgroundColor: palette.inkDim,
  },
});
