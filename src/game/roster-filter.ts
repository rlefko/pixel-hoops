import { ovr, type PlayerClass } from './ratings';
import { applyTrainingDelta } from './effects';
import type { Position, RosterPlayer } from '@/types/roster';

/**
 * Shared sort + chip-availability helpers for the "universal" roster search bar
 * (the pre-run draft, the roster browser, and the locker room all reuse it). Kept
 * dependency-light (only ratings + effects) so any search screen can import it
 * without pulling in draft/ladder logic; the draft-specific "selectable" rule is
 * passed in by the caller instead.
 */

/** A player's overall with run-scoped training folded in, exactly as the draft
 * slot and PlayerCard display it, so search ordering matches the on-screen read. */
export function effectiveOvr(rp: RosterPlayer): number {
  return ovr(applyTrainingDelta(rp.player.stats, rp.trainingDelta), rp.position);
}

/**
 * Search ordering: highest effective rating first, breaking ties by who has had
 * more permanent upgrades applied (when an `upgradesOf` lookup is supplied), then
 * by name so the order is stable across re-renders. `upgradesOf` is optional
 * because the welcome reveal has no upgrade ledger to consult.
 */
export function compareByRatingDesc(
  upgradesOf?: (rp: RosterPlayer) => number
): (a: RosterPlayer, b: RosterPlayer) => number {
  return (a, b) => {
    const byRating = effectiveOvr(b) - effectiveOvr(a);
    if (byRating !== 0) return byRating;
    if (upgradesOf) {
      const byUpgrades = upgradesOf(b) - upgradesOf(a);
      if (byUpgrades !== 0) return byUpgrades;
    }
    return a.player.name.localeCompare(b.player.name);
  };
}

/**
 * Which class chips have at least one matching player in `pool`, so the rest can
 * be greyed out as "not yet received". When `selectable` is given (the draft's
 * isDraftable), a class counts only if a *selectable* player has it, so classes
 * that are illegal for the current ladder grey out too; a draftable legendary
 * keeps its class enabled. Matches the chip filter, which keys off originalClass.
 */
export function availableClasses(
  pool: readonly RosterPlayer[],
  selectable?: (rp: RosterPlayer) => boolean
): Set<PlayerClass> {
  const set = new Set<PlayerClass>();
  for (const rp of pool) {
    if (selectable && !selectable(rp)) continue;
    if (rp.originalClass) set.add(rp.originalClass);
  }
  return set;
}

/** The positions with at least one matching player in `pool` (see availableClasses). */
export function availablePositions(
  pool: readonly RosterPlayer[],
  selectable?: (rp: RosterPlayer) => boolean
): Set<Position> {
  const set = new Set<Position>();
  for (const rp of pool) {
    if (selectable && !selectable(rp)) continue;
    set.add(rp.position);
  }
  return set;
}
