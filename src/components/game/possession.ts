import { spotPx, rimCenterPx } from './courtGeometry';
import { scaled } from '@/feel/timings';
import { POSITIONS, type Position } from '@/types/roster';
import { isMadeShot, type SimEvent, type SimTeamSide } from '@/types/sim';
import {
  type ShotShape,
  FLIGHT_DURATION_MAX,
  resolveDurationFor,
  DUNK_FLIGHT_MS,
} from '@/feel/useBallFlight';

/**
 * Pure, deterministic derivations that turn one SimEvent into a readable
 * "possession beat": how the ball reads in the air, how long the beat lasts, and
 * which players move (and where). No React, no randomness, no court size baked
 * in beyond what is passed. Shared by the ball flight, the sprite motion, and
 * the replay scheduler so a single source defines the choreography.
 */

// --- How a shot reads ---

export function shotShapeFor(e: SimEvent): ShotShape {
  if (e.result === 'block') return 'block';
  if (e.result === 'steal' || e.result === 'turnover') return 'loose';
  if (!isMadeShot(e)) return 'miss';
  if (e.action === 'dunk') return 'dunk';
  return 'jumper';
}

// --- Replay cadence ---
// One deliberate beat per event: the ball arcs, resolves at the rim, then a
// short linger before the next event. The gap derives from the same flight and
// resolve tokens the ball uses (distance is unknown here, so the flight upper
// bound is used) so the cursor never advances before the ball has landed.

// Routine plays fly by; only the peaks linger. (Compressed so the watch stays
// short, per the addictive-blueprint pacing principles.)
const LINGER = { winner: 420, big: 120, make: 30, other: 16 };

function lingerFor(e: SimEvent): number {
  if (e.callout === 'BUZZER BEATER!') return LINGER.winner;
  if (e.isBigPlay) return LINGER.big;
  if (isMadeShot(e)) return LINGER.make;
  return LINGER.other;
}

const HIT_STOP_MS = 100;
const WINNER_HIT_STOP_MS = 140;

/**
 * The game-winner cinema: the deciding ball hangs in the air. Both flight legs
 * stretch by this factor, and eventGapMs stretches by the same one so the
 * scheduler and the ball stay in sync ("pace scales, sync holds"). Spent on at
 * most one event per game, in close finishes only.
 */
export const WINNER_TIME_SCALE = 1.5;

/**
 * A freeze-frame hold (ms) on the biggest plays for weight: a made slam, a
 * rejection, the buzzer-beater. Folded into the gap so the screen sits on the
 * impact before the next event. Zero under reduced motion (see eventGapMs).
 */
function hitStopFor(e: SimEvent, cinema: boolean): number {
  if (cinema) return WINNER_HIT_STOP_MS;
  const madeDunk = e.action === 'dunk' && isMadeShot(e);
  if (madeDunk || e.result === 'block' || e.callout === 'BUZZER BEATER!') return HIT_STOP_MS;
  return 0;
}

/** A scoring play or a big defensive stop: kept in the condensed highlights watch. */
export function isNoteworthy(e: SimEvent): boolean {
  return isMadeShot(e) || e.isBigPlay;
}

/**
 * Delay before the next event. `speed` divides everything (the ball flight scales
 * by the same factor, so arrival stays in sync). In highlights mode, routine
 * non-scoring plays collapse to a tiny gap so they whip by while the score still
 * processes. `cinema` marks the game-deciding shot (the buzzer-beater, or the
 * clincher the feed derives from momentum): its flight legs run at
 * WINNER_TIME_SCALE, so the gap stretches by the same factor.
 */
export function eventGapMs(
  e: SimEvent,
  reducedMotion = false,
  speed = 1,
  highlightsOnly = false,
  cinema?: boolean
): number {
  const slowMo = cinema ?? e.callout === 'BUZZER BEATER!';
  if (highlightsOnly && !isNoteworthy(e)) {
    return scaled(60, speed); // a routine miss or turnover: blow past it
  }
  if (reducedMotion) {
    // No ball arcs, so there is nothing to wait for: keep the ticker snappy.
    if (e.isBigPlay) return scaled(220, speed);
    if (isMadeShot(e)) return scaled(150, speed);
    return scaled(90, speed);
  }
  const flightScale = slowMo ? WINNER_TIME_SCALE : 1;
  return scaled(
    (FLIGHT_DURATION_MAX + resolveDurationFor(shotShapeFor(e))) * flightScale +
      lingerFor(e) +
      hitStopFor(e, slowMo),
    speed
  );
}

// --- Sprite roles & motion ---

type SpriteRole = 'shooter' | 'driver' | 'dunker' | 'defender' | 'idle';

/** Move timing for the active players (out toward the action, hold, recover). */
export const MOVE = { out: 160, hold: 220, back: 200 } as const;

const DUNK_GATHER = 110;
const DUNK_LEAP = 80;

/**
 * Dunk choreography: the dunker gathers, leaps, slams (the ball arrives), hangs
 * for weight, then recovers. `gather + leap + slam` equals the dunk ball flight
 * (DUNK_FLIGHT_MS) so the slam squash and the ball through the net coincide.
 */
export const DUNK = {
  gather: DUNK_GATHER,
  leap: DUNK_LEAP,
  slam: DUNK_FLIGHT_MS - DUNK_GATHER - DUNK_LEAP,
  hang: 100,
  recover: 160,
  lift: 10, // extra px up at the top of the leap
} as const;

/** A contact finish drives to the rim; a jumper just rises in place. */
function isDrive(e: SimEvent): boolean {
  return e.action === 'dunk' || e.action === 'layup' || e.action === 'drive';
}

export function roleFor(
  e: SimEvent | null,
  side: SimTeamSide,
  position: Position
): SpriteRole {
  if (!e) return 'idle';
  const onOffense = e.team === side;
  if (onOffense && position === e.scorerPosition) {
    if (e.action === 'dunk' && isMadeShot(e)) return 'dunker';
    return isDrive(e) ? 'driver' : 'shooter';
  }
  // The mirrored same position on the other side contests a blocked shot.
  if (!onOffense && e.result === 'block' && position === e.scorerPosition) {
    return 'defender';
  }
  return 'idle';
}

/** A vector from `from` toward `to`, capped at `max` px so a move reads as a step. */
function cappedStep(
  from: { x: number; y: number },
  to: { x: number; y: number },
  max: number
): { dx: number; dy: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const step = Math.min(len, max);
  return { dx: (dx / len) * step, dy: (dy / len) * step };
}

/**
 * Pixel translate offset for a moving sprite this possession: a driver steps
 * toward the rim, a defender leans into the contest, a jumper shooter rises a
 * touch. Idle players don't move.
 */
export function moveOffsetFor(
  e: SimEvent | null,
  side: SimTeamSide,
  position: Position,
  width: number,
  height: number
): { dx: number; dy: number } {
  const role = roleFor(e, side, position);
  if (!e || role === 'idle' || width === 0 || height === 0) {
    return { dx: 0, dy: 0 };
  }
  if (role === 'driver' || role === 'dunker') {
    // Drive toward the rim from the stable base: the dunker attacks most of the
    // way (so the slam meets the ball), a driver a strong step. Anchored to the
    // same null base the sprite is drawn at, so the ball still leaves the shooter.
    const from = spotPx(e.team, e.scorerPosition, width, height, null);
    const to = rimCenterPx(e.team, width, height);
    const frac = role === 'dunker' ? 0.7 : 0.45;
    return { dx: (to.x - from.x) * frac, dy: (to.y - from.y) * frac };
  }
  if (role === 'defender') {
    return cappedStep(
      spotPx(side, position, width, height, null),
      rimCenterPx(e.team, width, height),
      24
    );
  }
  // shooter: a small rise into the jumper.
  return { dx: 0, dy: -4 };
}

// --- Idle bob staggering (deterministic, no Math.random) ---

const IDLE_BOB_AMPLITUDE = 1.2;

/** A unique 0..9 index per sprite, for detuning the idle bob out of lockstep. */
function phaseIndexFor(side: SimTeamSide, position: Position): number {
  const posIndex = POSITIONS.indexOf(position);
  return posIndex + (side === 'home' ? 0 : POSITIONS.length);
}

/** Idle-breathe params so the ten-player floor undulates instead of marching. */
export function idleBobFor(
  side: SimTeamSide,
  position: Position
): { durationMs: number; delayMs: number; bobAmplitude: number } {
  const phase = phaseIndexFor(side, position);
  return {
    durationMs: 1500 + 70 * phase,
    delayMs: 110 * phase,
    bobAmplitude: IDLE_BOB_AMPLITUDE,
  };
}
