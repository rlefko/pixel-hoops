import type { RosterPlayer } from '@/types/roster';
import type { PlayerClass } from './ratings';

/**
 * The player COLLECTION model. Owning a non-legend is no longer binary: each player
 * accrues COPIES toward a class-scaled threshold, and crossing it UNLOCKS the player
 * (moves it into the draftable owned collection). Copies past the threshold convert to
 * a coin bounty, never power, so a duplicate is always progress or currency, never a
 * dead drop.
 *
 * Rarer classes need MORE copies, tuned for pool size: the common C/B pools own on the
 * first copy so they never grind, while an S-tier star is a multi-copy chase, so the weight
 * lives at the top where the "one more run" pull matters. Legends stay single-copy (a rare
 * on-loan reveal you win a run with, or the 10k scout).
 *
 * Pure and data-only (no RNG, no storage). home-roster.ts owns the persisted state and
 * player-gacha.ts owns the pull selection; this module is the single source of truth for
 * the numbers so a card badge, a scout reveal, and a merge all agree.
 */

/** Copies required to OWN (unlock) a player of each class. Rarer = more, tuned for pool
 * size: the small S pool (35) completes fast at equal encounter rates, so S carries the
 * biggest copy count; the huge B pool (243) already makes a specific B rare, so B owns on
 * the first copy (a second would only orphan them). See docs/game-concept.md. */
export const COPIES_TO_OWN: Record<PlayerClass, number> = {
  D: 1, // the rookie/streetball floor is always instantly owned
  C: 1,
  B: 1, // the 243-deep B pool already makes a specific B rare; a 2nd copy only orphans them
  A: 3,
  S: 6, // the tiny 35-player pool completes fast, so the chase lives in the copy count
  'S+': 1, // legends: a rare on-loan reveal you win with, or the 10k scout, so one copy owns
  'S++': 1, // emergent-only; never actually collected, kept for totality
};

/** Copies required to own (unlock) a player of `cls`. */
export function copiesToOwn(cls: PlayerClass): number {
  return COPIES_TO_OWN[cls] ?? 1;
}

/** Whether `copies` collected is enough to own (unlock) a player of `cls`. */
export function isCollected(copies: number, cls: PlayerClass): boolean {
  return copies >= copiesToOwn(cls);
}

/**
 * Coins granted for one OVERFLOW copy (a copy of a player whose whole tier you already
 * own): half the class's scout price, mirroring the old dupe half-refund. Classes with
 * no scout machine (D, S++) grant nothing. Keeps duplicates rewarding without stacking a
 * second power axis onto the permanent-upgrade ledger.
 */
export const OVERFLOW_BOUNTY: Record<PlayerClass, number> = {
  D: 0,
  C: 125,
  B: 250,
  A: 500,
  S: 1250,
  'S+': 5000,
  'S++': 0,
};

/** Coins for one overflow copy of a player of `cls`. */
export function overflowBounty(cls: PlayerClass): number {
  return OVERFLOW_BOUNTY[cls] ?? 0;
}

/**
 * An IN-PROGRESS player: a full card object plus how many copies are collected so far
 * (always below copiesToOwn(originalClass); it graduates into the owned collection the
 * instant the count reaches the threshold). Not draftable while collecting.
 */
export interface CollectingPlayer {
  player: RosterPlayer;
  copies: number;
}
