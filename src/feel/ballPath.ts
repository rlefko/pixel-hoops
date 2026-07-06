/**
 * The pure math and timing of a ball's flight: arc peaks, leg durations, and the
 * parabolic path point. No React, no reanimated, no state, so the scheduler and
 * the choreography planner (which run in Node tests) can import these tokens
 * without pulling in the animation runtime. The `useBallFlight` hook drives the
 * actual Animated views off these.
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
export function arcPeakFor(dist: number, shape: ShotShape = 'jumper'): number {
  if (shape === 'dunk') return DUNK_PEAK;
  if (shape === 'loose') return LOOSE_PEAK;
  const base = clamp(dist * ARC_K, ARC_MIN, ARC_MAX);
  if (shape === 'miss') return base * 0.85;
  if (shape === 'block') return base * 0.8;
  return base;
}

/** Flight time (ms) for a shot of the given distance and shape. */
export function flightDurationFor(dist: number, shape: ShotShape = 'jumper'): number {
  if (shape === 'dunk') return DUNK_FLIGHT_MS;
  if (shape === 'loose') return LOOSE_MS;
  const base = clamp(dist / FLIGHT_PX_PER_MS, FLIGHT_MIN_MS, FLIGHT_MAX_MS);
  return shape === 'block' ? base * 0.9 : base;
}

/** Resolution time (ms) for the second leg (drop / carom / deflect). */
export function resolveDurationFor(shape: ShotShape): number {
  return RESOLVE_MS[shape];
}

/** The peak of the resolution leg (the bounce out on a miss/block/loose). */
export function resolvePeakFor(shape: ShotShape): number {
  return RESOLVE_PEAK[shape];
}

const LOOSE_LEAD = 0.3; // a steal pokes the ball this far toward the stealing team's rim
const BLOCK_AWAY = 34; // a block spikes it this far back off the rim (px)
const DEFLECT_SIDE = 26; // sideways kick on a knocked-away ball (px)

/**
 * Where a knocked-away ball resolves, keyed to the outcome so the deflection reads:
 * a steal ('loose') is poked FORWARD toward the stealing team's basket (`otherRim`),
 * seeding the break; a block is swatted AWAY from the rim, back toward the shooter.
 * `caromSide` (+/-1) varies the sideways kick. Pure (px in, px out), Node-testable.
 */
export function deflectResolve(shape: ShotShape, target: Pt, rim: Pt, otherRim: Pt, caromSide: number): Pt {
  if (shape === 'loose') {
    return {
      x: target.x + (otherRim.x - target.x) * LOOSE_LEAD + caromSide * DEFLECT_SIDE,
      y: target.y + (otherRim.y - target.y) * LOOSE_LEAD,
    };
  }
  // block: swat it away from the rim (the reverse of the incoming shot direction).
  const dx = target.x - rim.x;
  const dy = target.y - rim.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: target.x + (dx / len) * BLOCK_AWAY + caromSide * DEFLECT_SIDE,
    y: target.y + (dy / len) * BLOCK_AWAY,
  };
}

/**
 * A point on the parabolic shot path at progress t (0..1) for a given arc peak.
 * `4 * t * (1 - t)` peaks at 1.0 (t = 0.5); the bow is always toward screen-up,
 * which is mid-court for both the top and bottom hoops.
 */
export function arcPoint(
  ox: number,
  tx: number,
  oy: number,
  ty: number,
  peak: number,
  t: number
): Pt {
  'worklet';
  return {
    x: ox + (tx - ox) * t,
    y: oy + (ty - oy) * t - peak * 4 * t * (1 - t),
  };
}
