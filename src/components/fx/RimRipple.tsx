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
import { isMadeShot, type SimEvent } from '@/types/sim';

/**
 * A made-basket flourish at the rim: a quick flash ring plus a short net swish.
 * Driven by the current event and the measured court size; fires only on makes,
 * at the rim the scoring side attacks. Tinted with the court accent color so it
 * matches the themed arena. Skipped under reduced motion.
 */

interface RimRippleProps {
  event: SimEvent | null;
  width: number;
  height: number;
  /** Court accent color (matches the rim). */
  color: string;
}

const RING = 26;

export function RimRipple({ event, width, height, color }: RimRippleProps) {
  const { reducedMotion } = useFeelSettings();
  const pulse = useSharedValue(0);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const lastSeq = useRef<number | null>(null);

  useEffect(() => {
    if (!event || width === 0 || height === 0) return;
    if (event.seq === lastSeq.current) return;
    lastSeq.current = event.seq;
    if (!isMadeShot(event)) return;
    setPos(rimCenterPx(event.team, width, height));
    pulse.value = 0;
    pulse.value = withSequence(
      withTiming(1, { duration: 110, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 200 })
    );
  }, [event, width, height, pulse]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ scale: 1 + pulse.value * 0.7 }],
  }));

  const netStyle = useAnimatedStyle(() => ({
    opacity: pulse.value * 0.9,
    transform: [{ translateY: pulse.value * 6 }],
  }));

  if (reducedMotion || !pos) return null;

  return (
    <View pointerEvents="none" style={[styles.host, { left: pos.x, top: pos.y }]}>
      <Animated.View style={[styles.ring, { borderColor: color }, ringStyle]} />
      <Animated.View style={[styles.net, netStyle]}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.netLine, { backgroundColor: color }]} />
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
    left: -9,
    top: 2,
    flexDirection: 'row',
    gap: 3,
  },
  netLine: {
    width: 2,
    height: 8,
    opacity: 0.8,
  },
});
