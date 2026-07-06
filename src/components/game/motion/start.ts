import { attackFrac } from '../courtGeometry';
import { spriteKey, type Frac, type SpriteKey } from '../courtMath';
import { POSITIONS, type Position } from '@/types/roster';
import { isMadeShot, type SimEvent, type SimTeamSide } from '@/types/sim';
import type { OffRole } from './types';

/**
 * Possession-start machine + cross-possession continuity. How a possession begins is
 * one of three real basketball situations, and consecutive possessions that flow on a
 * LIVE ball (a steal/turnover the other way) must connect without a reset. Pure and
 * Node-safe; a function of the events only, so both sides of a boundary agree.
 */

export type StartType = 'inbound' | 'outlet' | 'live';

/** True when the ball flips LIVE to the other team (a steal/turnover -> a break). */
export function isLiveFlip(prev: SimEvent | undefined, event: SimEvent): boolean {
  return !!prev && prev.team !== event.team && (prev.result === 'steal' || prev.result === 'turnover');
}

/** How this possession starts, from the previous event. */
export function startType(prev: SimEvent | undefined, event: SimEvent): StartType {
  if (!prev) return 'inbound';
  if (prev.team === event.team) return 'live'; // offensive-rebound putback continuation
  if (isMadeShot(prev)) return 'inbound'; // scored on -> inbound from the baseline
  if (prev.result === 'steal' || prev.result === 'turnover') return 'live';
  return 'outlet'; // a defensive rebound the other way
}

/**
 * The player positions at the boundary between possession A (`a`) and B (`b`), used as
 * A's RESET target AND B's SPAWN. A live-ball steal/turnover flip returns a fast-break
 * snapshot (B pushing hard, A trailing behind the ball); a defensive-rebound OUTLET
 * returns a gentler mid-transition snapshot (B filling the lanes from deeper, A already
 * mid-retreat ahead of the ball) so the possession flows instead of snapping to the deep
 * base and charging back up. A made-basket inbound (or any same-team continuation) stays
 * `{}` — a dead ball spawns/resets from base normally. Because A's reset and B's spawn
 * call this with the SAME two events, they match exactly -> zero boundary jump.
 */
export function boundaryState(a: SimEvent | undefined, b: SimEvent | undefined): Partial<Record<SpriteKey, Frac>> {
  if (!a || !b) return {};
  const live = isLiveFlip(a, b);
  const outlet = !live && startType(a, b) === 'outlet';
  if (!live && !outlet) return {}; // made-basket inbound / same-team: normal base spawn
  const off: SimTeamSide = b.team; // the team going the other way
  const def: SimTeamSide = off === 'home' ? 'away' : 'home';
  const out: Partial<Record<SpriteKey, Frac>> = {};

  // Offense (B). A steal breaks with the ball already pushed up; an outlet fills the
  // lanes from deeper (it starts near B's own glass). depth 1 = B's attacking rim.
  const offSpot: Record<string, [number, number]> = live
    ? { PG: [0.5, 0.42], SG: [0.16, 0.56], SF: [0.84, 0.56], PF: [0.42, 0.3], C: [0.58, 0.28] }
    : { PG: [0.5, 0.3], SG: [0.2, 0.4], SF: [0.8, 0.4], PF: [0.44, 0.2], C: [0.56, 0.16] };
  // Defense (A). On a steal it is beaten and trailing BEHIND the ball; on an outlet it is
  // mid-retreat, already ahead of the ball, sinking back to protect B's rim.
  const defSpot: Record<string, [number, number]> = live
    ? { PG: [0.5, 0.34], SG: [0.3, 0.22], SF: [0.7, 0.22], PF: [0.45, 0.12], C: [0.55, 0.1] }
    : { PG: [0.5, 0.5], SG: [0.3, 0.44], SF: [0.7, 0.44], PF: [0.46, 0.56], C: [0.54, 0.6] };

  for (const pos of POSITIONS) {
    out[spriteKey(off, pos)] = attackFrac(off, offSpot[pos][0], offSpot[pos][1]);
    out[spriteKey(def, pos)] = attackFrac(off, defSpot[pos][0], defSpot[pos][1]);
  }
  return out;
}

/** The role that inbounds the ball after a made basket (a trailing big, else a wing). */
export function inbounderRole(offRoles: Record<Position, OffRole>): OffRole | undefined {
  if (POSITIONS.some((p) => offRoles[p] === 'big')) return 'big';
  if (POSITIONS.some((p) => offRoles[p] === 'corner')) return 'corner';
  return undefined;
}

/** The position that inbounds the ball after a made basket (then trails the play). */
export function inbounderPos(offRoles: Record<Position, OffRole>): Position | undefined {
  const role = inbounderRole(offRoles);
  return role ? POSITIONS.find((p) => offRoles[p] === role) : undefined;
}

/** The inbounder starts out of bounds at the offense's own baseline (deep backcourt)
 *  and becomes the trailer. Returns a spawn override for just that sprite. */
export function inboundSpawn(offSide: SimTeamSide, offRoles: Record<Position, OffRole>): Partial<Record<SpriteKey, Frac>> {
  const pos = inbounderPos(offRoles);
  if (!pos) return {};
  return { [spriteKey(offSide, pos)]: attackFrac(offSide, 0.5, 0.03) };
}
