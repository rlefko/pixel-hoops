import { spotFraction, rimCenterFraction } from '../courtGeometry';
import { lerpFrac, strictlyIncreasingByMs, type Frac, type SpriteKey } from '../courtMath';
import { POSITIONS, type Position } from '@/types/roster';
import type { Waypoint, BallLeg, BallLegKind } from '../choreography';
import { buildFormation } from './formation';
import type { MotionBudget, MotionInput, MotionMovement, OffRole, PossessionScript } from './types';

/**
 * Highlights cut-to-set: instead of drifting one or two players across the court,
 * snap the whole set formation into place (a 1ms cut the camera opens on) and show
 * only the action beat + the shot. All ten start at their set/coverage spots, the
 * finisher runs into the shot, the ball delivers. Pure and Node-safe. Much tighter
 * than full mode (the fast, skippable default path).
 */

const CONTEST_TIGHT = 0.13;
const HELP_TIGHT = 0.2;

/** [base -> (snap to set) -> ...action... -> base]; a 1ms snap reads as an instant cut. */
function cutPath(base: Frac, setSpot: Frac, action: Waypoint[], totalMs: number): Waypoint[] {
  const wps: Waypoint[] = [{ atMs: 0, frac: base }, { atMs: 1, frac: setSpot }, ...action, { atMs: totalMs, frac: base }];
  return strictlyIncreasingByMs(wps);
}

export function bakeHighlights(input: MotionInput, script: PossessionScript, budget: MotionBudget): MotionMovement {
  const { ctx, shotSpot, event } = input;
  const { offSide, defSide } = ctx;
  const { preShotMs, totalMs, holdUntil } = budget;
  const finisher = event.scorerPosition;
  const initiator = POSITIONS.find((p) => script.offRoles[p] === 'initiator');
  const formation = buildFormation(script.offRoles, finisher, initiator, shotSpot, offSide, script.action, event.action);
  const rim = rimCenterFraction(offSide);
  const holdAt = Math.min(holdUntil, totalMs - 1);

  const movers: Partial<Record<SpriteKey, Waypoint[]>> = {};
  const moverBursts: Partial<Record<SpriteKey, { startMs: number; endMs: number }>> = {};

  for (const pos of POSITIONS) {
    const key = `${offSide}-${pos}` as SpriteKey;
    const base = spotFraction(offSide, pos, null);
    const spots = formation.spots[pos];
    const role = script.offRoles[pos];
    let action: Waypoint[];
    if (pos === finisher) {
      action = [
        { atMs: preShotMs, frac: shotSpot },
        { atMs: holdAt, frac: shotSpot },
      ];
      moverBursts[key] = { startMs: 2, endMs: preShotMs };
    } else if (movesInAction(role)) {
      action = [
        { atMs: preShotMs, frac: spots.actionSpot },
        { atMs: holdAt, frac: spots.actionSpot },
      ];
    } else {
      action = [{ atMs: holdAt, frac: spots.setSpot }];
    }
    movers[key] = cutPath(base, spots.setSpot, action, totalMs);
  }

  // Defenders snap to a coverage-ready spot (goal-side of their man's set spot).
  for (const pos of POSITIONS) {
    const key = `${defSide}-${pos}` as SpriteKey;
    const base = spotFraction(defSide, pos, null);
    const manPos = script.matchup[pos];
    const manSet = formation.spots[manPos]?.setSpot ?? spotFraction(offSide, manPos, null);
    const tight = manPos === finisher ? CONTEST_TIGHT : HELP_TIGHT;
    const guardSpot = lerpFrac(manPos === finisher ? shotSpot : manSet, rim, tight);
    movers[key] = cutPath(base, guardSpot, [{ atMs: holdAt, frac: guardSpot }], totalMs);
  }

  return { movers, moverBursts, ball: buildHighlightBall(script, movers, offSide, finisher, shotSpot, preShotMs), handler: {} };
}

function movesInAction(role: OffRole): boolean {
  return role === 'initiator' || role === 'screener';
}

/** A trimmed ball for highlights: the credited pass (assist) or a solo carry to the shot. */
function buildHighlightBall(
  script: PossessionScript,
  movers: Partial<Record<SpriteKey, Waypoint[]>>,
  offSide: 'home' | 'away',
  finisher: Position,
  shotSpot: Frac,
  preShotMs: number
): BallLeg[] {
  const last = script.touches[script.touches.length - 1];
  const roleKey = (role: OffRole): SpriteKey => {
    const pos = POSITIONS.find((p) => script.offRoles[p] === role) ?? finisher;
    return `${offSide}-${pos}` as SpriteKey;
  };
  const spotOf = (key: SpriteKey, fallback: Frac): Frac => {
    const wp = movers[key];
    return wp ? wp[Math.max(0, wp.length - 2)].frac : fallback;
  };
  const kind: BallLegKind = last && last.fromRole !== last.toRole ? last.kind : 'carry';
  if (kind === 'carry') {
    // Solo carry from the finisher's set spot into the shot.
    const fkey = `${offSide}-${finisher}` as SpriteKey;
    const wp = movers[fkey];
    const from = wp ? wp[1].frac : shotSpot;
    return [{ kind: 'carry', from, to: shotSpot, startMs: 0, ms: preShotMs, path: buildCarry(wp, shotSpot, preShotMs) }];
  }
  const from = spotOf(roleKey(last.fromRole), shotSpot);
  const startMs = 0.55 * preShotMs;
  return [{ kind, from, to: shotSpot, startMs, ms: preShotMs - startMs }];
}

function buildCarry(wp: Waypoint[] | undefined, shotSpot: Frac, preShotMs: number): Frac[] | undefined {
  if (!wp) return undefined;
  const N = 6;
  const path: Frac[] = [];
  for (let s = 0; s < N; s++) {
    const atMs = (preShotMs * s) / (N - 1);
    path.push(sampleAtLocal(wp, atMs));
  }
  path[path.length - 1] = shotSpot;
  return path;
}

function sampleAtLocal(wps: Waypoint[], atMs: number): Frac {
  if (atMs <= wps[0].atMs) return wps[0].frac;
  const lastWp = wps[wps.length - 1];
  if (atMs >= lastWp.atMs) return lastWp.frac;
  for (let i = 1; i < wps.length; i++) {
    if (atMs <= wps[i].atMs) {
      const a = wps[i - 1];
      const b = wps[i];
      const t = (atMs - a.atMs) / (b.atMs - a.atMs || 1);
      return lerpFrac(a.frac, b.frac, t);
    }
  }
  return lastWp.frac;
}
