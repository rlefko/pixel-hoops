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
 * A's RESET target AND B's SPAWN. For a live-ball steal/turnover flip it returns a
 * transition snapshot (B pushing a break toward its rim; A strung out sprinting back to
 * defend); otherwise it returns `{}` (both possessions use their defensive base, so a
 * made-basket inbound or a half-court set spawns/resets normally). Because A's reset and
 * B's spawn call this with the SAME two events, they match exactly -> zero boundary jump.
 */
export function boundaryState(a: SimEvent | undefined, b: SimEvent | undefined): Partial<Record<SpriteKey, Frac>> {
  if (!a || !b || !isLiveFlip(a, b)) return {};
  const off: SimTeamSide = b.team; // the team on the break (stole the ball)
  const def: SimTeamSide = off === 'home' ? 'away' : 'home';
  const out: Partial<Record<SpriteKey, Frac>> = {};

  // Offense (B) pushing a three-lane break: handler in the middle, wings ahead in the
  // outside lanes, bigs trailing. depth 1 = B's attacking rim.
  const offSpot: Record<string, [number, number]> = {
    PG: [0.5, 0.42],
    SG: [0.16, 0.56],
    SF: [0.84, 0.56],
    PF: [0.42, 0.3],
    C: [0.58, 0.28],
  };
  // Defense (A) strung out behind the ball, sprinting back to protect B's rim (the bigs
  // furthest back). Same attacking frame, so they read as trailing the break.
  const defSpot: Record<string, [number, number]> = {
    PG: [0.5, 0.34],
    SG: [0.3, 0.22],
    SF: [0.7, 0.22],
    PF: [0.45, 0.12],
    C: [0.55, 0.1],
  };

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

/** The inbounder starts out of bounds at the offense's own baseline (deep backcourt)
 *  and becomes the trailer. Returns a spawn override for just that sprite. */
export function inboundSpawn(offSide: SimTeamSide, offRoles: Record<Position, OffRole>): Partial<Record<SpriteKey, Frac>> {
  const role = inbounderRole(offRoles);
  const pos = role ? POSITIONS.find((p) => offRoles[p] === role) : undefined;
  if (!pos) return {};
  return { [spriteKey(offSide, pos)]: attackFrac(offSide, 0.5, 0.03) };
}
