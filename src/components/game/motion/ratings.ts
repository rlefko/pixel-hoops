import { POSITIONS, type Position, type RosterPlayer } from '@/types/roster';
import type { PlayerStats } from '@/types/player';
import { deriveSeed } from '@/game/rng';
import { derivePlaystyle, tendencyFor } from '@/game/playstyle';
import { spriteKey } from '../courtMath';
import type { SimEvent, SimTeamSide } from '@/types/sim';
import {
  type CoachIdentity,
  type MotionCtx,
  type MotionPlayer,
  type MotionTeam,
  type SteeringHint,
  NEUTRAL_HINT,
  NEUTRAL_COACH,
  NEUTRAL_STATS,
  NEUTRAL_TENDENCY,
} from './types';
import type { TeamArchetype } from '@/game/team-archetype';

/**
 * Turns roster ratings into per-player movement hints and resolves both on-court
 * fives into a `MotionCtx` for one possession. Movement reads ratings + archetype
 * so a 99-athlete actually runs faster and a floor general passes crisper, without
 * ever touching the recorded outcome. Pure and Node-safe.
 */

/** Normalize a 6..20 stat to 0..1 (elite ~1); values above 20 saturate. */
function n(v: number): number {
  return Math.max(0, Math.min(1, (v - 6) / 14));
}

/** Effective stat with the run-scoped training delta folded in. */
function stat(rp: RosterPlayer, key: keyof PlayerStats): number {
  return rp.player.stats[key] + (rp.trainingDelta?.[key] ?? 0);
}

/** All effective ratings (training folded in). */
function effectiveStats(rp: RosterPlayer): PlayerStats {
  if (!rp.trainingDelta) return rp.player.stats;
  const out = { ...rp.player.stats };
  for (const k of Object.keys(out) as (keyof PlayerStats)[]) out[k] += rp.trainingDelta[k] ?? 0;
  return out;
}

/** Derive the movement hint for a player from their ratings. */
export function hintFor(rp: RosterPlayer): SteeringHint {
  const athl = n(stat(rp, 'athleticism'));
  const perimD = n(stat(rp, 'perimeterD'));
  const interiorD = n(stat(rp, 'interiorD'));
  const pm = n(stat(rp, 'playmaking'));
  const iq = n(stat(rp, 'iq'));
  const strength = n(stat(rp, 'strength'));
  const inside = n(stat(rp, 'inside'));
  return {
    speed: 0.85 + 0.4 * athl,
    accel: 0.8 + 0.5 * athl,
    closeoutSpeed: 0.85 + 0.4 * Math.max(perimD, interiorD),
    passCrispness: 0.75 + 0.5 * pm,
    readQuality: iq,
    screenQuality: strength,
    finishBurst: 0.9 + 0.4 * ((athl + inside) / 2),
    reactMs: Math.round(140 - 40 * iq),
  };
}

/** A rough on-court "who's the star" composite (drives star-usage offense). */
function starScore(rp: RosterPlayer): number {
  return (
    stat(rp, 'inside') + stat(rp, 'outside') + stat(rp, 'playmaking') + stat(rp, 'athleticism')
  );
}

/** The per-game data the feed assembles once, then resolves per possession. */
export interface SideMotionData {
  rosterByName: Map<string, RosterPlayer>;
  starters: RosterPlayer[]; // index === POSITIONS index; the pre-tipoff fallback
  coach: CoachIdentity;
  archetype: TeamArchetype;
}

export interface GameMotionData {
  home: SideMotionData;
  away: SideMotionData;
  gameSeed: number | string;
}

function resolvePlayer(
  data: SideMotionData,
  side: SimTeamSide,
  position: Position,
  event: SimEvent
): { player: MotionPlayer; rp: RosterPlayer | undefined } {
  const starter = data.starters[POSITIONS.indexOf(position)];
  const name = event.onCourt[side]?.[position];
  const rp = (name ? data.rosterByName.get(name) : undefined) ?? starter;
  const stats = rp ? effectiveStats(rp) : NEUTRAL_STATS;
  const player: MotionPlayer = {
    key: spriteKey(side, position),
    side,
    position,
    hint: rp ? hintFor(rp) : NEUTRAL_HINT,
    stats,
    tendency: rp ? tendencyFor(rp) : NEUTRAL_TENDENCY,
    style: derivePlaystyle(stats, position).id,
  };
  return { player, rp };
}

function resolveTeam(data: SideMotionData, side: SimTeamSide, event: SimEvent): MotionTeam {
  const five = {} as Record<Position, MotionPlayer>;
  let starPos: Position = 'PG';
  let best = -Infinity;
  for (const pos of POSITIONS) {
    const { player, rp } = resolvePlayer(data, side, pos, event);
    five[pos] = player;
    const s = rp ? starScore(rp) : 0;
    if (s > best) {
      best = s;
      starPos = pos;
    }
  }
  return { five, coach: data.coach, archetype: data.archetype, starPos };
}

/** Resolve the offense/defense teams + a per-possession seed for one event. */
export function resolveMotionCtx(
  data: GameMotionData,
  event: SimEvent
): { ctx: MotionCtx; seed: number } {
  const offSide = event.team;
  const defSide: SimTeamSide = offSide === 'home' ? 'away' : 'home';
  const offData = offSide === 'home' ? data.home : data.away;
  const defData = defSide === 'home' ? data.home : data.away;
  return {
    ctx: {
      offense: resolveTeam(offData, offSide, event),
      defense: resolveTeam(defData, defSide, event),
      offSide,
      defSide,
    },
    seed: deriveSeed(data.gameSeed, `poss-${event.seq}`),
  };
}

/** A neutral MotionCtx (no roster threaded, e.g. Node tests): all-average hints. */
export function neutralCtx(event: SimEvent): MotionCtx {
  const offSide = event.team;
  const defSide: SimTeamSide = offSide === 'home' ? 'away' : 'home';
  const team = (side: SimTeamSide): MotionTeam => {
    const five = {} as Record<Position, MotionPlayer>;
    for (const pos of POSITIONS) {
      five[pos] = {
        key: spriteKey(side, pos),
        side,
        position: pos,
        hint: NEUTRAL_HINT,
        stats: NEUTRAL_STATS,
        tendency: NEUTRAL_TENDENCY,
        style: derivePlaystyle(NEUTRAL_STATS, pos).id,
      };
    }
    return { five, coach: NEUTRAL_COACH, archetype: 'balanced', starPos: 'PG' };
  };
  return { offense: team(offSide), defense: team(defSide), offSide, defSide };
}
