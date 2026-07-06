import { useCallback } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { useFeelSettings, SIM_SPEED_FACTOR } from './FeelSettingsContext';
import { scaled } from './timings';
import {
  arcPeakFor,
  arcPoint,
  flightDurationFor,
  resolveDurationFor,
  resolvePeakFor,
  type Pt,
  type ShotShape,
} from './ballPath';

/**
 * Animates the live ball through a possession: an ordered list of pre-shot legs
 * (dribble carry, hand-offs, swing/kick passes, a lob) that fire at explicit
 * times, then the shot arc to the rim and its resolution. Spread `ballStyle` onto
 * an Animated.View and call `fire(...)` when a possession plays. The shot leg
 * fires `onArrival` exactly once, the instant the ball reaches the rim, so the
 * make/miss flourish lands with it. No-op under reduced motion (the held ball on
 * the active sprite is the read), but `onArrival` still fires so beats resolve.
 *
 * With a single carry leg this is the old behavior; the multi-pass ball movement
 * rides in front of an unchanged shot.
 */

/** Max pre-shot legs — small and bounded. Six lets a full ball reversal stay
 *  contiguous (carry / pass / carry / pass / carry / pass) with no held-ball gap. */
export const MAX_BALL_LEGS = 8;

/** A pre-shot leg renders for at least this long (scaled ms) so a pass reads as
 *  ball movement rather than a 1-2 frame flicker at the faster default speed. */
const MIN_LEG_MS = 90;

/** Taps toward the floor across a dribble carry (the ball's bounce cadence). */
const DRIBBLES = 3;

/** One pre-shot leg in court pixels: a polyline the ball rides, with an arc peak,
 *  a dribble bounce, and easing. A dense `xs`/`ys` (a carry) hugs the handler; a
 *  two-point leg (pass/hand-off/lob) is a straight arc. */
export interface BallLegPx {
  /** Polyline points in court px (>= 1). Two points = a straight arc. */
  xs: number[];
  ys: number[];
  /** When the leg starts (unscaled, cumulative from possession start). */
  startMs: number;
  /** Unscaled duration. */
  ms: number;
  /** Arc peak (px) for a two-point leg; ~0 for a dense carry that hugs the handler. */
  peak: number;
  /** Dribble bounce amplitude (px) for a carry; 0 otherwise. */
  bounce: number;
  ease: (t: number) => number;
}

interface FireConfig {
  /** Ordered pre-shot legs (0..MAX_BALL_LEGS). The last ends at `origin`. */
  legs: BallLegPx[];
  /** When the shot leaves the shooter (== preShotMs), unscaled. */
  shotStartMs: number;
  origin: Pt;
  /** Leg endpoint: rim center (shot/miss) or the contest point (block/loose). */
  target: Pt;
  resolve: Pt;
  shape: ShotShape;
  /** Stretches every leg (slow motion for the game-winner). */
  timeScale?: number;
  /** Fired the instant the ball reaches `target` (the shot lands), on the JS thread. */
  onArrival?: () => void;
}

interface LegGeom {
  xs: number[];
  ys: number[];
  peak: number;
  bounce: number;
}

/**
 * Sample a pre-shot leg's polyline at progress `prog` (0..1): piecewise-linear along
 * the points, plus a two-point arc lift and/or a dribble bounce. A UI-thread worklet
 * so the ball rides the dribbler's exact baked path rather than chording across it.
 */
function polyPoint(g: LegGeom, prog: number): { x: number; y: number } {
  'worklet';
  const { xs, ys, peak, bounce } = g;
  const n = xs.length;
  const p = prog < 0 ? 0 : prog > 1 ? 1 : prog;
  let x: number;
  let y: number;
  if (n <= 1) {
    x = xs[0];
    y = ys[0];
  } else {
    const seg = p * (n - 1);
    let i = Math.floor(seg);
    if (i > n - 2) i = n - 2;
    const f = seg - i;
    x = xs[i] + (xs[i + 1] - xs[i]) * f;
    y = ys[i] + (ys[i + 1] - ys[i]) * f;
  }
  // A straight two-point leg arcs; a dense carry hugs the floor (peak ~0).
  if (n === 2 && peak > 0) y -= peak * Math.sin(p * Math.PI);
  // Dribble bounce: the carried ball taps toward the floor a few times.
  if (bounce > 0) y += bounce * Math.abs(Math.sin(p * DRIBBLES * Math.PI));
  return { x, y };
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
  const p1 = useSharedValue(0); // shot leg progress
  const p2 = useSharedValue(0); // resolution leg progress
  const opacity = useSharedValue(0);
  const sx0 = useSharedValue(0);
  const sy0 = useSharedValue(0);
  // Pre-shot legs: geometry in one shared value, a progress per leg.
  const legGeom = useSharedValue<LegGeom[]>([]);
  const l0 = useSharedValue(0);
  const l1 = useSharedValue(0);
  const l2 = useSharedValue(0);
  const l3 = useSharedValue(0);
  const l4 = useSharedValue(0);
  const l5 = useSharedValue(0);
  const l6 = useSharedValue(0);
  const l7 = useSharedValue(0);
  const { reducedMotion, simSpeed } = useFeelSettings();

  const ballStyle = useAnimatedStyle(() => {
    const o = opacity.value;
    // Latest leg with progress wins (legs fire in order): resolve -> shot -> pre-shot legs.
    if (p2.value > 0) {
      const pt = arcPoint(tx.value, rx.value, ty.value, ry.value, peak2.value, p2.value);
      return { opacity: o * (1 - p2.value), transform: [{ translateX: pt.x }, { translateY: pt.y }] };
    }
    if (p1.value > 0) {
      const pt = arcPoint(ox.value, tx.value, oy.value, ty.value, peak1.value, p1.value);
      return { opacity: o, transform: [{ translateX: pt.x }, { translateY: pt.y }] };
    }
    const g = legGeom.value;
    const progs = [l0.value, l1.value, l2.value, l3.value, l4.value, l5.value, l6.value, l7.value];
    for (let i = MAX_BALL_LEGS - 1; i >= 0; i--) {
      if (progs[i] > 0 && g[i]) {
        const pt = polyPoint(g[i], progs[i]);
        return { opacity: o, transform: [{ translateX: pt.x }, { translateY: pt.y }] };
      }
    }
    // Pre-start frame: park at the first leg's start.
    return { opacity: o, transform: [{ translateX: sx0.value }, { translateY: sy0.value }] };
  });

  // A short motion trail on the shot leg only (a dribble/pass leaves no comet).
  const ghost = (lag: number, fade: number) => {
    'worklet';
    const t = Math.max(0, p1.value - lag);
    const pt = arcPoint(ox.value, tx.value, oy.value, ty.value, peak1.value, t);
    const visible = p2.value > 0 || p1.value <= lag ? 0 : 1;
    return { opacity: opacity.value * fade * visible, transform: [{ translateX: pt.x }, { translateY: pt.y }] };
  };
  const trail1 = useAnimatedStyle(() => ghost(0.05, 0.34));
  const trail2 = useAnimatedStyle(() => ghost(0.1, 0.22));
  const trail3 = useAnimatedStyle(() => ghost(0.15, 0.12));
  const trailStyles = [trail1, trail2, trail3];

  const progRefs = [l0, l1, l2, l3, l4, l5, l6, l7];

  const fire = useCallback(
    (cfg: FireConfig) => {
      const cb = cfg.onArrival;
      if (reducedMotion) {
        cb?.();
        return;
      }
      const { legs, shotStartMs, origin, target, resolve, shape, timeScale = 1 } = cfg;
      const speed = SIM_SPEED_FACTOR[simSpeed];
      const dist = Math.hypot(target.x - origin.x, target.y - origin.y);
      const dur = scaled(flightDurationFor(dist, shape) * timeScale, speed);
      const resolveDur = scaled(resolveDurationFor(shape) * timeScale, speed);
      const shotEase = shape === 'dunk' ? Easing.in(Easing.cubic) : Easing.out(Easing.quad);
      const resolveEase = shape === 'dunk' ? Easing.in(Easing.cubic) : Easing.in(Easing.quad);

      ox.value = origin.x;
      oy.value = origin.y;
      tx.value = target.x;
      ty.value = target.y;
      rx.value = resolve.x;
      ry.value = resolve.y;
      peak1.value = arcPeakFor(dist, shape);
      peak2.value = resolvePeakFor(shape);

      const geom: LegGeom[] = [];
      const n = Math.min(legs.length, MAX_BALL_LEGS);
      for (let i = 0; i < MAX_BALL_LEGS; i++) {
        if (i < n) {
          geom.push({ xs: legs[i].xs, ys: legs[i].ys, peak: legs[i].peak, bounce: legs[i].bounce });
        } else {
          geom.push({ xs: [0], ys: [0], peak: 0, bounce: 0 });
        }
      }
      legGeom.value = geom;

      const start = { x: legs[0]?.xs[0] ?? origin.x, y: legs[0]?.ys[0] ?? origin.y };
      sx0.value = start.x;
      sy0.value = start.y;
      opacity.value = 1;

      // Shot fires at shotStartMs (== preShotMs), so the slam/camera stay in sync.
      const shotDelay = scaled(shotStartMs * timeScale, speed);

      // Reset all leg progresses, then schedule each leg as a FRACTION of the shot
      // delay, so the last pre-shot leg lands exactly when the shot fires (no
      // per-leg rounding/floor skew between the ball and the slam). A pre-shot leg
      // gets at least MIN_LEG_MS so a pass reads as ball movement, not a flicker,
      // even at the faster default speed, but never past the next leg's start (the
      // last leg is pinned to the shot).
      const delayAt = (ms: number) => Math.round((shotDelay * ms) / (shotStartMs || 1));
      for (let i = 0; i < MAX_BALL_LEGS; i++) progRefs[i].value = 0;
      for (let i = 0; i < n; i++) {
        const leg = legs[i];
        const s = delayAt(leg.startMs);
        const next = i < n - 1 ? delayAt(legs[i + 1].startMs) : shotDelay;
        const e = Math.min(next, Math.max(delayAt(leg.startMs + leg.ms), s + MIN_LEG_MS));
        progRefs[i].value = withDelay(s, withTiming(1, { duration: Math.max(1, e - s), easing: leg.ease }));
      }
      p1.value = 0;
      p2.value = 0;
      p1.value = withDelay(
        shotDelay,
        withTiming(1, { duration: dur, easing: shotEase }, (finished) => {
          'worklet';
          if (finished && cb) runOnJS(cb)();
        })
      );
      p2.value = withDelay(
        shotDelay + dur,
        withTiming(1, { duration: resolveDur, easing: resolveEase }, (done) => {
          'worklet';
          if (done) opacity.value = 0;
        })
      );
    },
    [
      reducedMotion, simSpeed,
      ox, oy, tx, ty, rx, ry, peak1, peak2, p1, p2, opacity, sx0, sy0,
      legGeom, l0, l1, l2, l3, l4, l5, l6, l7,
    ]
  );

  return { ballStyle, trailStyles, fire };
}
