import { useCallback } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { useFeelSettings } from './FeelSettingsContext';

/**
 * Animates a single ball view along a parabolic arc from a shooter to a rim, then
 * resolves it (drops through the net, clanks off the iron, or gets swatted away).
 * Spread `ballStyle` onto an Animated.View and call `fire(...)` when a shot goes
 * up. The arc peak and flight time scale with distance so a deep three lofts high
 * and a layup is a quick scoop. The ball hides itself when it lands. No-op under
 * reduced motion (the static held ball on the active sprite stays as the read),
 * but `onArrival` still fires so anything synced to the landing still resolves.
 */

/** How a shot reads in the air and at the rim. */
export type ShotShape = 'jumper' | 'dunk' | 'miss' | 'block' | 'loose';

/** A point in the court layer. */
export interface Pt {
  x: number;
  y: number;
}

const ARC_K = 0.34; // peak as a fraction of straight-line shot distance
const ARC_MIN = 22;
const ARC_MAX = 130;
const FLIGHT_MIN_MS = 190;
const FLIGHT_MAX_MS = 320;
const FLIGHT_PX_PER_MS = 1.15;

const DUNK_PEAK = 30;
const DUNK_MS = 170;
const LOOSE_PEAK = 12;
const LOOSE_MS = 180;

const RESOLVE_MS: Record<ShotShape, number> = {
  jumper: 120, // drop straight through the net
  dunk: 120,
  miss: 190, // carom off the iron
  block: 170, // deflect away
  loose: 160,
};
const RESOLVE_PEAK: Record<ShotShape, number> = {
  jumper: 0,
  dunk: 0,
  miss: 18,
  block: 16,
  loose: 10,
};

/** Conservative upper bound on the shot leg, for scheduling the replay cadence. */
export const FLIGHT_DURATION_MAX = FLIGHT_MAX_MS;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Arc peak (px) for a shot of the given straight-line distance and shape. */
function arcPeakFor(dist: number, shape: ShotShape = 'jumper'): number {
  if (shape === 'dunk') return DUNK_PEAK;
  if (shape === 'loose') return LOOSE_PEAK;
  const base = clamp(dist * ARC_K, ARC_MIN, ARC_MAX);
  if (shape === 'miss') return base * 0.85;
  if (shape === 'block') return base * 0.8;
  return base;
}

/** Flight time (ms) for a shot of the given distance and shape. */
function flightDurationFor(dist: number, shape: ShotShape = 'jumper'): number {
  if (shape === 'dunk') return DUNK_MS;
  if (shape === 'loose') return LOOSE_MS;
  const base = clamp(dist / FLIGHT_PX_PER_MS, FLIGHT_MIN_MS, FLIGHT_MAX_MS);
  return shape === 'block' ? base * 0.9 : base;
}

/** Resolution time (ms) for the second leg (drop / carom / deflect). */
export function resolveDurationFor(shape: ShotShape): number {
  return RESOLVE_MS[shape];
}

interface FireConfig {
  /** Where the ball leaves the shooter. */
  origin: Pt;
  /** Leg-1 endpoint: the rim center (shot/miss) or the contest point (block/loose). */
  target: Pt;
  /** Leg-2 endpoint: drop-through, carom-out, or deflection. */
  resolve: Pt;
  shape: ShotShape;
  /** Fired the instant the ball reaches `target`, on the JS thread. */
  onArrival?: () => void;
}

export function useBallFlight() {
  const ox = useSharedValue(0);
  const oy = useSharedValue(0);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const rx = useSharedValue(0);
  const ry = useSharedValue(0);
  const peak1 = useSharedValue(0);
  const peak2 = useSharedValue(0);
  const p1 = useSharedValue(0); // shot leg progress 0..1
  const p2 = useSharedValue(0); // resolution leg progress 0..1
  const opacity = useSharedValue(0);
  const { reducedMotion } = useFeelSettings();

  const ballStyle = useAnimatedStyle(() => {
    let x: number;
    let y: number;
    let op: number;
    if (p2.value <= 0) {
      const t = p1.value;
      x = ox.value + (tx.value - ox.value) * t;
      // 4 * t * (1 - t) peaks at 1.0 (t = 0.5); the bow is always toward
      // screen-up, which is mid-court for both the top and bottom hoops.
      y = oy.value + (ty.value - oy.value) * t - peak1.value * 4 * t * (1 - t);
      op = opacity.value;
    } else {
      const t = p2.value;
      x = tx.value + (rx.value - tx.value) * t;
      y = ty.value + (ry.value - ty.value) * t - peak2.value * 4 * t * (1 - t);
      op = opacity.value * (1 - t);
    }
    return {
      opacity: op,
      transform: [{ translateX: x }, { translateY: y }],
    };
  });

  const fire = useCallback(
    (cfg: FireConfig) => {
      const cb = cfg.onArrival;
      if (reducedMotion) {
        cb?.();
        return;
      }
      const { origin, target, resolve, shape } = cfg;
      const dist = Math.hypot(target.x - origin.x, target.y - origin.y);
      const peak = arcPeakFor(dist, shape);
      const dur = flightDurationFor(dist, shape);
      const resolveDur = RESOLVE_MS[shape];
      const shotEase =
        shape === 'dunk' ? Easing.in(Easing.cubic) : Easing.out(Easing.quad);
      const resolveEase = Easing.in(Easing.quad);

      ox.value = origin.x;
      oy.value = origin.y;
      tx.value = target.x;
      ty.value = target.y;
      rx.value = resolve.x;
      ry.value = resolve.y;
      peak1.value = peak;
      peak2.value = RESOLVE_PEAK[shape];
      opacity.value = 1;
      p2.value = 0;
      p1.value = 0;
      // The shot leg fires onArrival the instant it lands; the resolution leg is
      // scheduled to start exactly then (withDelay), so the two never fight.
      p1.value = withTiming(1, { duration: dur, easing: shotEase }, (finished) => {
        'worklet';
        if (finished && cb) runOnJS(cb)();
      });
      p2.value = withDelay(
        dur,
        withTiming(1, { duration: resolveDur, easing: resolveEase }, (done) => {
          'worklet';
          if (done) opacity.value = 0;
        })
      );
    },
    [reducedMotion, ox, oy, tx, ty, rx, ry, peak1, peak2, p1, p2, opacity]
  );

  return { ballStyle, fire };
}
