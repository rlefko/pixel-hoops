import { POSITIONS, type Position } from '@/types/roster';
import { isMadeShot, type SimEvent, type SimTeamSide } from '@/types/sim';
import { type ShotShape, DUNK_FLIGHT_MS } from '@/feel/ballPath';

/**
 * Pure, deterministic derivations shared by the watch: how a shot reads in the
 * air, the dunk beat timing, the idle-bob staggering, and the game-winner
 * slow-mo constant. The per-possession choreography (who runs where, and for how
 * long) lives in choreography.ts, which builds on these tokens. No React, no
 * randomness, no court size baked in.
 */

// --- How a shot reads ---

export function shotShapeFor(e: SimEvent): ShotShape {
  if (e.result === 'block') return 'block';
  if (e.result === 'steal' || e.result === 'turnover') return 'loose';
  if (!isMadeShot(e)) return 'miss';
  if (e.action === 'dunk') return 'dunk';
  return 'jumper';
}

/** A scoring play or a big defensive stop: kept in the condensed highlights watch. */
export function isNoteworthy(e: SimEvent): boolean {
  return isMadeShot(e) || e.isBigPlay;
}

/**
 * The game-winner cinema: the deciding ball hangs in the air. Every leg stretches
 * by this factor, and the scheduler stretches its gap by the same one so the
 * scheduler and the ball stay in sync ("pace scales, sync holds"). Spent on at
 * most one event per game, in close finishes only.
 */
export const WINNER_TIME_SCALE = 1.5;

// --- Dunk choreography ---

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
