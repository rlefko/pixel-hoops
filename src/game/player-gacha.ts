import { NBA_LEGENDS } from '@/data/nba';
import type { RealPlayer } from '@/types/nba';
import { nameKey, type RosterPlayer } from '@/types/roster';
import { poolByClass, realPlayerToRosterPlayer } from './player-pool';
import type { PlayerClass } from './ratings';
import type { RNG } from './rng';

/**
 * The player SCOUTING gacha: five coin machines that sign a permanent player into
 * the home collection, the reliable counterpart to mid-run recruiting (which is
 * now kept only when a run is cleared). Each machine draws from one intrinsic
 * class:
 *
 *   C 250 · B 500 · A 1000 · S 2500 · Legendary 10,000 coins
 *
 * COLLECTION MODE: while a tier still has players you do not own, a pull always
 * returns a NEW one (uniform among the un-owned) at full price. Only once a tier
 * is fully collected does a pull return a repeat, which refunds half the price.
 * Pure and deterministic from the seeded RNG; the caller charges coins.
 *
 * Terminology: the UI calls this "scouting" (the Arcade's SCOUT button, the
 * `scout` handler); in this module the action is a "pull", mirroring the ability
 * gacha in abilities-gacha.ts. They are the same action.
 */

export type PlayerGachaTier = 'C' | 'B' | 'A' | 'S' | 'legendary';

export const PLAYER_GACHA_TIERS: readonly PlayerGachaTier[] = ['C', 'B', 'A', 'S', 'legendary'];

/** Fraction of the price refunded for a repeat (only possible once a tier is complete). */
export const REFUND_RATIO = 0.5;

export interface PlayerMachine {
  id: PlayerGachaTier;
  name: string;
  cost: number;
  /** The intrinsic class the machine draws from (legends are S+). */
  cls: PlayerClass;
  /** Whether the machine draws from the legend pool (90+, gold). */
  legendary: boolean;
  blurb: string;
}

/** The five machines. Prices and pools are fixed by design. */
export const PLAYER_MACHINES: Record<PlayerGachaTier, PlayerMachine> = {
  C: { id: 'C', name: 'C Scout', cost: 250, cls: 'C', legendary: false, blurb: "A random C-tier prospect you don't own." },
  B: { id: 'B', name: 'B Scout', cost: 500, cls: 'B', legendary: false, blurb: "A random B-tier player you don't own." },
  A: { id: 'A', name: 'A Scout', cost: 1000, cls: 'A', legendary: false, blurb: "A random A-tier player you don't own." },
  S: { id: 'S', name: 'S Scout', cost: 2500, cls: 'S', legendary: false, blurb: "A random S-tier star you don't own." },
  legendary: {
    id: 'legendary', name: 'Legendary Scout', cost: 10000, cls: 'S+', legendary: true,
    blurb: "A random all-time great you don't own.",
  },
};

/** The real-player pool a machine draws from (legends, or every real of the class). */
export function tierPool(tier: PlayerGachaTier): RealPlayer[] {
  const m = PLAYER_MACHINES[tier];
  return m.legendary ? NBA_LEGENDS : poolByClass(m.cls);
}

/** The owned-collection key for a real player (shares home-roster.playerKey's format). */
function realKey(rp: RealPlayer): string {
  return nameKey(rp.name, rp.position);
}

export interface TierCounts {
  owned: number;
  total: number;
  /** Whether every player in the tier is already owned (the machine is "complete"). */
  complete: boolean;
}

/** How many of a tier's players are already owned (drives the "collected N/N" UI). */
export function tierCounts(tier: PlayerGachaTier, ownedKeys: ReadonlySet<string>): TierCounts {
  const pool = tierPool(tier);
  const owned = pool.reduce((n, rp) => (ownedKeys.has(realKey(rp)) ? n + 1 : n), 0);
  return { owned, total: pool.length, complete: pool.length > 0 && owned >= pool.length };
}

export interface PlayerPullResult {
  /** The pulled player, wrapped as a deployable roster player. */
  player: RosterPlayer;
  /** True when the tier was already fully collected, so this is a repeat. */
  isDupe: boolean;
  /** Gross coins the pull costs. */
  cost: number;
  /** Coins refunded: 0 for a new player, half the cost (floored) for a repeat. */
  refund: number;
}

/**
 * Pull one player from a machine (deterministic from the seeded RNG). Returns a
 * new player you don't own when one remains in the tier, otherwise a repeat with a
 * half-price refund. Does NOT charge coins; the caller deducts cost and credits
 * refund (see home-roster.applyPlayerPull).
 */
export function pullPlayer(
  tier: PlayerGachaTier,
  ownedKeys: ReadonlySet<string>,
  rng: RNG
): PlayerPullResult {
  const cost = PLAYER_MACHINES[tier].cost;
  const pool = tierPool(tier);
  const fresh = pool.filter((rp) => !ownedKeys.has(realKey(rp)));
  if (fresh.length > 0) {
    return { player: realPlayerToRosterPlayer(rng.pick(fresh)), isDupe: false, cost, refund: 0 };
  }
  return {
    player: realPlayerToRosterPlayer(rng.pick(pool)),
    isDupe: true,
    cost,
    refund: Math.floor(cost * REFUND_RATIO),
  };
}
