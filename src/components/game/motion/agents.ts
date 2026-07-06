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
  /** Where the agent STARTS this possession (base, or a carried-over transition spot). */
  spawn: Frac;
  /** Where the agent RESETS to at the end (base, or the boundary into the next break). */
  resetTo: Frac;
  role?: OffRole;
  setSpot?: Frac;
  actionSpot?: Frac;
  /** Fraction of preShotMs when this agent leaves its spawn (stagger). */
  startMoveFrac: number;
  /** Defense: the offensive position this defender guards (post-switch). */
  guards?: Position;
  maxSpeed: number;
  maxAccel: number;
  pos: Vec;
  vel: Vec;
  /** True once the agent has arrived and planted at its target; it holds dead-still
   *  (no steering) until its target drifts away. This is the explicit IDLE state that
   *  gives real basketball stillness instead of perpetual micro-drift. */
  planted: boolean;
  /** The finisher on a rim attack (drive/layup/dunk): in the action beat it seeks the
   *  rim with a burst (no arrive-decelerate) so the drive reads as an attacking blow-by. */
  attackBurst?: boolean;
  frames: { atMs: number; frac: Frac }[];
}

/** Actions that finish AT the rim off an attacking move (the finisher bursts). */
export function isRimAttack(action: string): boolean {
  return action === 'drive' || action === 'layup' || action === 'dunk';
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

export function buildAgents(
  input: MotionInput,
  script: PossessionScript,
  startPositions: Partial<Record<SpriteKey, Frac>>,
  resetPositions: Partial<Record<SpriteKey, Frac>>
): BuiltAgents {
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
    const key = spriteKey(offSide, pos);
    const base = spotFraction(offSide, pos, null);
    const spawn = startPositions[key] ?? base;
    const resetTo = resetPositions[key] ?? base;
    const spots = formation.spots[pos];
    const hint = offense.five[pos].hint;
    const agent: SimAgent = {
      key,
      side: offSide,
      position: pos,
      team: 'off',
      base,
      spawn,
      resetTo,
      role,
      setSpot: spots.setSpot,
      actionSpot: spots.actionSpot,
      // A carried-over break spawn is already up the floor, so it moves immediately.
      startMoveFrac: startPositions[key] ? 0 : offStartFrac(role),
      maxSpeed: BASE_SPEED * hint.speed,
      maxAccel: BASE_ACCEL * hint.accel,
      pos: toMetric(spawn),
      vel: { x: 0, y: 0 },
      planted: false,
      attackBurst: pos === event.scorerPosition && isRimAttack(event.action),
      frames: [],
    };
    agents.push(agent);
    byKey.set(agent.key, agent);
  }

  // Defense: each defender guards its matchup (post-switch) offensive position.
  for (const pos of POSITIONS) {
    const key = spriteKey(defSide, pos);
    const base = spotFraction(defSide, pos, null);
    const spawn = startPositions[key] ?? base;
    const resetTo = resetPositions[key] ?? base;
    const hint = defense.five[pos].hint;
    const agent: SimAgent = {
      key,
      side: defSide,
      position: pos,
      team: 'def',
      base,
      spawn,
      resetTo,
      startMoveFrac: 0,
      guards: script.matchup[pos],
      maxSpeed: BASE_SPEED * hint.closeoutSpeed,
      maxAccel: BASE_ACCEL * hint.accel,
      pos: toMetric(spawn),
      vel: { x: 0, y: 0 },
      planted: false,
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

/** The LOOSE set box used during bring-up (and the reset break-out): the offense
 *  legally lives in its own backcourt while it advances the ball, so only a true
 *  wanderer gets pushed back. Home attacks the top (small y); away the bottom. */
export function frontCourtBox(offSide: SimTeamSide): { min: Vec; max: Vec } {
  return offSide === 'home'
    ? { min: toMetric({ x: 0.02, y: 0.02 }), max: toMetric({ x: 0.98, y: 0.78 }) }
    : { min: toMetric({ x: 0.02, y: 0.22 }), max: toMetric({ x: 0.98, y: 0.98 }) };
}

/** The TIGHT set box used once the ball is up (the action/set phase): a real
 *  half-court set keeps all five in the front court (the backcourt-violation rule
 *  bars returning the ball), so a spacer or a slow big can't drift past mid-court.
 *  Home's front court is small y (max ~0.58, just past the mid-court line); mirror. */
export function frontCourtBoxTight(offSide: SimTeamSide): { min: Vec; max: Vec } {
  return offSide === 'home'
    ? { min: toMetric({ x: 0.02, y: 0.02 }), max: toMetric({ x: 0.98, y: 0.58 }) }
    : { min: toMetric({ x: 0.02, y: 0.42 }), max: toMetric({ x: 0.98, y: 0.98 }) };
}

/**
 * The "get-back" box a DEFENDER stays inside: he protects his own basket and never
 * chases a man into the offense's backcourt (only a full-court press would, which is
 * rare). Home attacks the top, so the away defense holds the top ~62% of the floor;
 * mirror for away. Defender targets are clamped to this so a lagging offensive player
 * can't drag his man to the far baseline.
 */
export function defenderBox(offSide: SimTeamSide): { min: Vec; max: Vec } {
  return offSide === 'home'
    ? { min: toMetric({ x: 0.02, y: 0.02 }), max: toMetric({ x: 0.98, y: 0.62 }) }
    : { min: toMetric({ x: 0.02, y: 0.38 }), max: toMetric({ x: 0.98, y: 0.98 }) };
}
