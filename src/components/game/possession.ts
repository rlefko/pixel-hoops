import { spotPx, rimCenterPx } from './courtGeometry';
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

const LINGER = { winner: 480, big: 150, make: 80, other: 50 };

function lingerFor(e: SimEvent): number {
  if (e.callout === 'BUZZER BEATER!') return LINGER.winner;
  if (e.isBigPlay) return LINGER.big;
  if (isMadeShot(e)) return LINGER.make;
  return LINGER.other;
}

const HIT_STOP_MS = 100;

/**
 * A freeze-frame hold (ms) on the biggest plays for weight: a made slam, a
 * rejection, the buzzer-beater. Folded into the gap so the screen sits on the
 * impact before the next event. Zero under reduced motion (see eventGapMs).
 */
function hitStopFor(e: SimEvent): number {
  const madeDunk = e.action === 'dunk' && isMadeShot(e);
  const buzzerBeater = e.callout === 'BUZZER BEATER!';
  if (madeDunk || e.result === 'block' || buzzerBeater) return HIT_STOP_MS;
  return 0;
}

export function eventGapMs(e: SimEvent, reducedMotion = false): number {
  if (reducedMotion) {
    // No ball arcs, so there is nothing to wait for: keep the ticker snappy.
    if (e.isBigPlay) return 320;
    if (isMadeShot(e)) return 240;
    return 140;
  }
  return (
    FLIGHT_DURATION_MAX +
    resolveDurationFor(shotShapeFor(e)) +
    lingerFor(e) +
    hitStopFor(e)
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
  reach: 96, // how far the dunker travels toward the rim
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
    // The dunker reaches all the way to the rim; a driver takes a shorter step.
    return cappedStep(
      spotPx(e.team, e.scorerPosition, width, height, e.team),
      rimCenterPx(e.team, width, height),
      role === 'dunker' ? DUNK.reach : 52
    );
  }
  if (role === 'defender') {
    return cappedStep(
      spotPx(side, position, width, height, e.team),
      rimCenterPx(e.team, width, height),
      22
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
