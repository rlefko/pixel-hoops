import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { palette } from '@/theme';
import { useFeelSettings } from '@/feel';
import { CoinIcon } from '@/components/run/PixelIcons';

/**
 * Postgame coin flight: 3-5 tiny gold coins arc from the score area down to
 * the earned-coins tally after a win. Pure decoration timed to land with the
 * tally's tick: silent (the tally's ticks and coin settle already voice the
 * landing; a launch cue would stack a second voice on the beat) and skipped
 * entirely under effective reduced motion (the BallFlight precedent; the
 * host's timer and TickCounter carry the semantic beat).
 *
 * Timing contract: sprites launch 60ms apart and fly 340ms each, staggered so
 * the LAST coin always lands 580ms after trigger (4 * 60 + 340) regardless of
 * count; fewer coins just start later. The host's existing 700ms showEarned
 * timer stays the single source of truth for the tally reveal: launch this
 * ~120ms after the win beat so the last coin lands exactly as the TickCounter
 * starts counting (120 + 580 = 700).
 *
 * The host measures, this component animates: `from` and `to` are in the
 * host's relative-container coordinates, and the overlay absolutely fills
 * that container. One-shot per trigger change; no loops, no timers.
 */

interface CoinFlyProps {
  /** Launch origin, in the host's relative-container coordinates. */
  from: { x: number; y: number };
  /** Landing target (the earned-coins tally), same coordinate space. */
  to: { x: number; y: number };
  /** Coins earned; sprite count derives as clamp(3 + floor(coins / 40), 3, 5). */
  coins: number;
  /** Fires once when this changes to a truthy value (the Pop/StaggerIn convention). */
  trigger?: unknown;
}

const MAX_COINS = 5;
const MIN_COINS = 3;
const STAGGER_MS = 60;
const FLIGHT_MS = 340;
const ARC_PEAK = 24; // px above the chord at mid-flight
const FAN_X = 10; // alternate +/- sideways bow so the stream fans
const COIN_SIZE = 11;
const FADE_AT = 0.85; // opacity fades to 0 over the last 15% of flight

function CoinSprite({
  index,
  count,
  from,
  to,
}: {
  index: number;
  count: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    // Anchor the stagger to the END so the last coin lands at 580ms for any
    // count (the tally-sync contract); a 3-coin flight just starts 120ms in.
    const delay = (MAX_COINS - count + index) * STAGGER_MS;
    progress.value = withDelay(delay, withTiming(1, { duration: FLIGHT_MS }));
    // Launch once on mount; the parent remounts sprites by keying on `trigger`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Alternate the bow direction so coins fan mid-flight yet converge on the tally.
  const fan = index % 2 === 0 ? FAN_X : -FAN_X;

  const style = useAnimatedStyle(() => {
    const t = progress.value;
    // arcPoint math from useBallFlight: 4t(1-t) peaks at 1.0 (t = 0.5), bowing
    // the y path screen-up over the chord; the same bow bends x sideways.
    const bow = 4 * t * (1 - t);
    const fade = t < FADE_AT ? 1 : (1 - t) / (1 - FADE_AT);
    return {
      // Hidden while the stagger delay holds it at t = 0, gone once landed.
      opacity: t <= 0 ? 0 : fade,
      transform: [
        { translateX: from.x + (to.x - from.x) * t + fan * bow },
        { translateY: from.y + (to.y - from.y) * t - ARC_PEAK * bow },
      ],
    };
  });

  return (
    <Animated.View style={[styles.coin, style]}>
      <CoinIcon size={COIN_SIZE} color={palette.gold} />
    </Animated.View>
  );
}

export function CoinFly({ from, to, coins, trigger }: CoinFlyProps) {
  const { reducedMotion } = useFeelSettings();
  // Reduced motion skips the flight entirely; the host's 700ms timer and the
  // TickCounter still land the semantic beat (degradation preserves semantics).
  if (reducedMotion || !trigger) return null;

  const count = Math.max(MIN_COINS, Math.min(MAX_COINS, MIN_COINS + Math.floor(coins / 40)));

  return (
    <View key={String(trigger)} pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: count }, (_, i) => (
        <CoinSprite key={i} index={i} count={count} from={from} to={to} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  coin: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
