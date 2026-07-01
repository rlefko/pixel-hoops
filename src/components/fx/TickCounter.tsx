import { useEffect, useRef } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { useCountUp, usePop, haptics, sfx } from '@/feel';

/**
 * The audible "numbers go up": a Counter that plays a rising tick per increment
 * while it climbs and lands a settle beat sized by `tier`. Celebration scales by
 * LAYERS, not duration: small is ticks only, medium adds the coin settle and a
 * scale pop, large adds a success haptic (callers stack a reward burst on top).
 * Under reduced motion the value snaps and only the settle beat plays. Pass
 * `from` to make a freshly mounted tally visibly climb (e.g. 0 -> coins earned).
 */
interface TickCounterProps {
  value: number;
  /** Settle-beat size. Defaults to 'small' (ticks only). */
  tier?: 'small' | 'medium' | 'large';
  /** Initial displayed value, so a mount can count up from a baseline. */
  from?: number;
  /** Rendered before the number, e.g. "+" for an earned delta. */
  prefix?: string;
  style?: StyleProp<TextStyle>;
}

// The mid-climb tick walks upward from BASE by STEP per increment (capped), and
// the small tier's settle tick lands a clear notch above the climb.
const TICK_RATE_BASE = 0.92;
const TICK_RATE_STEP = 0.04;
const TICK_RATE_MAX_RISE = 0.3;
const TICK_RATE_SETTLE = 1.25;

export function TickCounter({ value, tier = 'small', from, prefix, style }: TickCounterProps) {
  const display = useCountUp(value, { from });
  const { popStyle, pop } = usePop();
  const shown = useRef(display);
  const valueRef = useRef(value);
  valueRef.current = value;
  // Walks the tick pitch upward per step so a climb sings; resets per tally.
  const stepRef = useRef(0);

  useEffect(() => {
    if (display === shown.current) return;
    shown.current = display;
    if (display !== valueRef.current) {
      // Mid-climb: a tiny tick, pitched a step higher each time (the sfx layer
      // rate-limits these, so a fast tally streams instead of machine-gunning).
      sfx.tick(TICK_RATE_BASE + Math.min(TICK_RATE_MAX_RISE, stepRef.current * TICK_RATE_STEP));
      stepRef.current += 1;
      return;
    }
    // Settled: land the beat, sized by tier.
    stepRef.current = 0;
    if (tier === 'small') {
      sfx.tick(TICK_RATE_SETTLE);
      return;
    }
    sfx.coin();
    pop({ scale: 1.12 });
    if (tier === 'large') haptics.success();
  }, [display, tier, pop]);

  return (
    <Animated.View style={popStyle}>
      <Text style={style}>
        {prefix}
        {display}
      </Text>
    </Animated.View>
  );
}
