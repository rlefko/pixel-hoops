import { POSITIONS, type Position } from '@/types/roster';
import { isMadeShot, type SimEvent } from '@/types/sim';
import type { OffRole, PlayAction } from './types';

/**
 * Assign the five on-court positions to offensive roles and set the defensive
 * matchups. The recorded scorer is ALWAYS the finisher and the recorded assister
 * ALWAYS the initiator (preserving the honesty invariant); the rest fill
 * screen/spacing roles by archetype and action. Deterministic. Pure and Node-safe.
 */

/** Is a position a big (screens, rolls, posts)? */
function isBig(pos: Position): boolean {
  return pos === 'PF' || pos === 'C';
}

/** Does this action want a real screener (a big up in the action)? */
function needsScreener(action: PlayAction): boolean {
  return action === 'pnr' || action === 'pnp' || action === 'horns' || action === 'pindown' || action === 'floppy' || action === 'flare' || action === 'dho';
}

export interface OffenseAssignment {
  offRoles: Record<Position, OffRole>;
  finisher: Position;
  initiator?: Position;
}

/** Assign offensive roles from the outcome + action. */
export function assignOffRoles(action: PlayAction, event: SimEvent): OffenseAssignment {
  const offRoles = {} as Record<Position, OffRole>;
  const finisher = event.scorerPosition;
  const assisted = !!event.assist && isMadeShot(event);
  const initiator = assisted && event.assist && event.assist.position !== finisher ? event.assist.position : undefined;

  offRoles[finisher] = 'finisher';
  if (initiator) offRoles[initiator] = 'initiator';

  const rest = POSITIONS.filter((p) => p !== finisher && p !== initiator);

  // Pick a screener (a big, else the biggest remaining) when the action wants one.
  let screener: Position | undefined;
  if (needsScreener(action)) {
    screener = rest.find(isBig) ?? rest[rest.length - 1];
    if (screener) offRoles[screener] = 'screener';
  }

  // Everyone else spaces: bigs to the dunker/short-corner, guards/wings to the arc.
  const spacers = rest.filter((p) => p !== screener);
  // Deterministic spot assignment: first big -> 'big' (block spacing), rest alternate corner/wing.
  let cornerNext = true;
  for (const p of spacers) {
    if (isBig(p) && !Object.values(offRoles).includes('big')) offRoles[p] = 'big';
    else {
      offRoles[p] = cornerNext ? 'corner' : 'wing';
      cornerNext = !cornerNext;
    }
  }
  // Safety: any unassigned position (shouldn't happen) spaces to a wing.
  for (const p of POSITIONS) if (!offRoles[p]) offRoles[p] = 'wing';

  return { offRoles, finisher, initiator };
}

/** Default man matchups: each defender guards the same position (mutated by a switch later). */
export function defaultMatchup(): Record<Position, Position> {
  const m = {} as Record<Position, Position>;
  for (const p of POSITIONS) m[p] = p;
  return m;
}
