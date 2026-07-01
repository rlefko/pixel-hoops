import type { RosterPlayer } from '@/types/roster';
import type { PlayerClass } from './ratings';

/**
 * The player COLLECTION model. Owning a non-legend is no longer binary: each player
 * accrues COPIES toward a class-scaled threshold, and crossing it UNLOCKS the player
 * (moves it into the draftable owned collection). Copies past the threshold convert to
 * a coin bounty, never power, so a duplicate is always progress or currency, never a
 * dead drop.
 *
 * Rarer classes need MORE copies: the C-tier floor stays a one-copy impulse buy while an
 * S-tier star is a multi-pull chase, so the weight lives at the top where the "one more
 * run" pull matters and commons never grind. Legends stay single-copy (they are already
 * 10k-gated and pity-protected).
 *
 * Pure and data-only (no RNG, no storage). home-roster.ts owns the persisted state and
 * player-gacha.ts owns the pull selection; this module is the single source of truth for
 * the numbers so a card badge, a scout reveal, and a merge all agree.
 */

/** Copies required to OWN (unlock) a player of each class. Rarer = more. */
export const COPIES_TO_OWN: Record<PlayerClass, number> = {
  D: 1, // the rookie/streetball floor is always instantly owned
  C: 1,
  B: 2,
  A: 3,
  S: 4,
  'S+': 1, // legends: already 10k-gated + pity-protected, so a single copy owns
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
