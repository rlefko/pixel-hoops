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
const FLIGHT_MIN_MS = 160;
const FLIGHT_MAX_MS = 260;
const FLIGHT_PX_PER_MS = 1.15;

/** Dunk shot-leg time; the sprite's slam beat is timed to land with it. */
export const DUNK_FLIGHT_MS = 250;
const DUNK_PEAK = 56; // rides up high, then punches down
const LOOSE_PEAK = 12;
const LOOSE_MS = 180;

const RESOLVE_MS: Record<ShotShape, number> = {
  jumper: 120, // drop straight through the net
  dunk: 110, // a hard, quick punch down
  miss: 150, // carom off the iron
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
  if (shape === 'dunk') return DUNK_FLIGHT_MS;
  if (shape === 'loose') return LOOSE_MS;
  const base = clamp(dist / FLIGHT_PX_PER_MS, FLIGHT_MIN_MS, FLIGHT_MAX_MS);
  return shape === 'block' ? base * 0.9 : base;
}

/** Resolution time (ms) for the second leg (drop / carom / deflect). */
export function resolveDurationFor(shape: ShotShape): number {
  return RESOLVE_MS[shape];
}

/**
 * A point on the parabolic shot path at progress t (0..1) for a given arc peak.
 * `4 * t * (1 - t)` peaks at 1.0 (t = 0.5); the bow is always toward screen-up,
 * which is mid-court for both the top and bottom hoops.
 */
function arcPoint(
  ox: number,
  tx: number,
  oy: number,
  ty: number,
  peak: number,
  t: number
): { x: number; y: number } {
  'worklet';
  return {
    x: ox + (tx - ox) * t,
    y: oy + (ty - oy) * t - peak * 4 * t * (1 - t),
  };
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
    if (p2.value <= 0) {
      const pt = arcPoint(ox.value, tx.value, oy.value, ty.value, peak1.value, p1.value);
      return {
        opacity: opacity.value,
        transform: [{ translateX: pt.x }, { translateY: pt.y }],
      };
    }
    const pt = arcPoint(tx.value, rx.value, ty.value, ry.value, peak2.value, p2.value);
    return {
      opacity: opacity.value * (1 - p2.value),
      transform: [{ translateX: pt.x }, { translateY: pt.y }],
    };
  });

  // A short motion trail: ghost dots that lag the ball (by `lag` along the path)
  // and fade with depth. They live only during the shot leg.
  const ghost = (lag: number, fade: number) => {
    'worklet';
    const t = Math.max(0, p1.value - lag);
    const pt = arcPoint(ox.value, tx.value, oy.value, ty.value, peak1.value, t);
    const visible = p2.value > 0 || p1.value <= lag ? 0 : 1;
    return {
      opacity: opacity.value * fade * visible,
      transform: [{ translateX: pt.x }, { translateY: pt.y }],
    };
  };
  // (lag along path, opacity fade): the oldest ghost trails farthest and faintest.
  const trail1 = useAnimatedStyle(() => ghost(0.05, 0.34));
  const trail2 = useAnimatedStyle(() => ghost(0.1, 0.22));
  const trail3 = useAnimatedStyle(() => ghost(0.15, 0.12));
  const trailStyles = [trail1, trail2, trail3];

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
      // A dunk punches down harder than a jumper's tidy drop.
      const resolveEase =
        shape === 'dunk' ? Easing.in(Easing.cubic) : Easing.in(Easing.quad);

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

  return { ballStyle, trailStyles, fire };
}
