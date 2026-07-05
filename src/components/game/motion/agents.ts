import { spotFraction } from '../courtGeometry';
import { type Frac, type SpriteKey, spriteKey } from '../courtMath';
import { POSITIONS, type Position } from '@/types/roster';
import type { SimTeamSide } from '@/types/sim';
import { toMetric, type Vec } from './vec';
import { buildFormation, type Formation } from './formation';
import type { MotionInput, OffRole, PossessionScript } from './types';

/**
 * Builds the ten point-mass agents for one possession from the script + formation.
 * Offensive agents carry set/action spots and a stagger; defensive agents carry
 * the offensive position they guard. Live state (pos/vel) is integrated in metric
 * (aspect-corrected) space. Pure and Node-safe.
 */

/** Base movement speed (metric fraction / sec); ratings scale it per agent. */
export const BASE_SPEED = 0.64;
export const BASE_ACCEL = 3.0;

export interface SimAgent {
  key: SpriteKey;
  side: SimTeamSide;
  position: Position;
  team: 'off' | 'def';
  base: Frac;
  role?: OffRole;
  setSpot?: Frac;
  actionSpot?: Frac;
  /** Fraction of preShotMs when this agent leaves its base (stagger). */
  startMoveFrac: number;
  /** Defense: the offensive position this defender guards (post-switch). */
  guards?: Position;
  maxSpeed: number;
  maxAccel: number;
  pos: Vec;
  vel: Vec;
  frames: { atMs: number; frac: Frac }[];
}

/** When each offensive role leaves its base (screener sets late, at the action). */
function offStartFrac(role: OffRole): number {
  switch (role) {
    case 'initiator':
    case 'finisher':
      return 0.02;
    case 'screener':
      return 0.4;
    default:
      return 0.05;
  }
}

export interface BuiltAgents {
  agents: SimAgent[];
  byKey: Map<SpriteKey, SimAgent>;
  formation: Formation;
  offSide: SimTeamSide;
  defSide: SimTeamSide;
}

export function buildAgents(input: MotionInput, script: PossessionScript): BuiltAgents {
  const { ctx, shotSpot, event } = input;
  const { offense, defense, offSide, defSide } = ctx;
  const formation = buildFormation(
    script.offRoles,
    event.scorerPosition,
    findRole(script.offRoles, 'initiator'),
    shotSpot,
    offSide,
    script.action,
    event.action
  );

  const agents: SimAgent[] = [];
  const byKey = new Map<SpriteKey, SimAgent>();

  // Offense.
  for (const pos of POSITIONS) {
    const role = script.offRoles[pos];
    const base = spotFraction(offSide, pos, null);
    const spots = formation.spots[pos];
    const hint = offense.five[pos].hint;
    const agent: SimAgent = {
      key: spriteKey(offSide, pos),
      side: offSide,
      position: pos,
      team: 'off',
      base,
      role,
      setSpot: spots.setSpot,
      actionSpot: spots.actionSpot,
      startMoveFrac: offStartFrac(role),
      maxSpeed: BASE_SPEED * hint.speed,
      maxAccel: BASE_ACCEL * hint.accel,
      pos: toMetric(base),
      vel: { x: 0, y: 0 },
      frames: [],
    };
    agents.push(agent);
    byKey.set(agent.key, agent);
  }

  // Defense: each defender guards its matchup (post-switch) offensive position.
  for (const pos of POSITIONS) {
    const base = spotFraction(defSide, pos, null);
    const hint = defense.five[pos].hint;
    const agent: SimAgent = {
      key: spriteKey(defSide, pos),
      side: defSide,
      position: pos,
      team: 'def',
      base,
      startMoveFrac: 0,
      guards: script.matchup[pos],
      maxSpeed: BASE_SPEED * hint.closeoutSpeed,
      maxAccel: BASE_ACCEL * hint.accel,
      pos: toMetric(base),
      vel: { x: 0, y: 0 },
      frames: [],
    };
    agents.push(agent);
    byKey.set(agent.key, agent);
  }

  return { agents, byKey, formation, offSide, defSide };
}

function findRole(offRoles: Record<Position, OffRole>, role: OffRole): Position | undefined {
  return POSITIONS.find((p) => offRoles[p] === role);
}

/** The metric-space set box that keeps agents in the front court (containment). */
export function frontCourtBox(offSide: SimTeamSide): { min: Vec; max: Vec } {
  // Home attacks the top (small y); away the bottom. Keep a generous margin so
  // only true wanderers get pushed back.
  return offSide === 'home'
    ? { min: toMetric({ x: 0.02, y: 0.02 }), max: toMetric({ x: 0.98, y: 0.78 }) }
    : { min: toMetric({ x: 0.02, y: 0.22 }), max: toMetric({ x: 0.98, y: 0.98 }) };
}
