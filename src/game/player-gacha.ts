import { NBA_LEGENDS } from '@/data/nba';
import type { RealPlayer } from '@/types/nba';
import { nameKey, type RosterPlayer } from '@/types/roster';
import { poolByClass, realPlayerToRosterPlayer } from './player-pool';
import { CLASS_ORDER, type PlayerClass } from './ratings';
import { copiesToOwn, overflowBounty } from './collection';
import type { Difficulty, LadderClass } from './difficulty-mode';
import type { RNG } from './rng';

/**
 * The player SCOUTING gacha: five coin machines that collect a permanent player into
 * the home collection, the reliable counterpart to mid-run recruiting (which is now
 * kept only when a run is cleared). Each machine draws from one intrinsic class:
 *
 *   C 250 · B 500 · A 1000 · S 2500 · Legendary 10,000 coins
 *
 * COPIES MODE: a pull grants ONE copy toward owning a player of that tier's class.
 * Rarer classes need more copies to unlock (see collection.copiesToOwn), so a single
 * pull is a step, not an instant sign. To keep a chase from scattering across the whole
 * tier, a pull always feeds the un-owned player CLOSEST to unlocking; the copy that
 * reaches the threshold unlocks (makes draftable). Once every player in a tier is owned,
 * further pulls OVERFLOW into a coin bounty (collection.overflowBounty), the successor to
 * the old flat half-refund. Pure and deterministic from the seeded RNG; the caller
 * charges coins, banks the bounty, and moves the copy into the collection.
 *
 * ACCESS GATE: high tiers are locked until you have climbed the ladder (see
 * machineUnlocked), so a flush wallet can never rush an S star on easy.
 *
 * Terminology: the UI calls this "scouting" (the Arcade's SCOUT button, the `scout`
 * handler); in this module the action is a "pull", mirroring the ability gacha in
 * abilities-gacha.ts. They are the same action.
 */

export type PlayerGachaTier = 'C' | 'B' | 'A' | 'S' | 'legendary';

export const PLAYER_GACHA_TIERS: readonly PlayerGachaTier[] = ['C', 'B', 'A', 'S', 'legendary'];

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

/**
 * The ladder class a scout machine stays LOCKED behind: clear it (on ANY difficulty)
 * and the machine opens. Each tier gates on the ladder rung one below it, so scouting a
 * class becomes available exactly when the ladder that recruits it does (C is always
 * open). Mirrors ladderProgress, so no extra state is persisted.
 */
const MACHINE_GATE: Record<PlayerGachaTier, LadderClass | null> = {
  C: null, // always open
  B: 'C',
  A: 'B',
  S: 'A',
  legendary: 'S',
};

/** The ladder class a machine is locked behind (null when always open). Drives the
 * "CLEAR C LADDER" hint on a locked machine. */
export function machineGate(tier: PlayerGachaTier): LadderClass | null {
  return MACHINE_GATE[tier];
}

/** Whether a scout machine is unlocked given the per-difficulty ladder progress. */
export function machineUnlocked(
  tier: PlayerGachaTier,
  ladderProgress: Record<Difficulty, LadderClass | null>
): boolean {
  const need = MACHINE_GATE[tier];
  if (!need) return true;
  const needIdx = CLASS_ORDER.indexOf(need);
  return Object.values(ladderProgress).some(
    (cleared) => cleared != null && CLASS_ORDER.indexOf(cleared) >= needIdx
  );
}

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
  /** How many of the tier's players are fully OWNED (unlocked). */
  owned: number;
  total: number;
  /** Whether every player in the tier is owned (the machine is "complete"). */
  complete: boolean;
  /** The un-owned player closest to unlocking, so the card can show "next 3/4". */
  closest?: { copies: number; threshold: number };
}

/**
 * A tier's owned/total and the closest-to-unlock progress (drives the "N/N" owned count
 * and the "next 3/4" hint). `unlockedKeys` are the players already owned; `collectingCopies`
 * maps a not-yet-owned player's key to its collected copies.
 */
export function tierCounts(
  tier: PlayerGachaTier,
  unlockedKeys: ReadonlySet<string>,
  collectingCopies: Readonly<Record<string, number>> = {}
): TierCounts {
  const pool = tierPool(tier);
  const threshold = copiesToOwn(PLAYER_MACHINES[tier].cls);
  let owned = 0;
  let best = 0;
  for (const rp of pool) {
    const k = realKey(rp);
    if (unlockedKeys.has(k)) owned += 1;
    else best = Math.max(best, collectingCopies[k] ?? 0);
  }
  const complete = pool.length > 0 && owned >= pool.length;
  return {
    owned,
    total: pool.length,
    complete,
    closest: complete ? undefined : { copies: best, threshold },
  };
}

export interface PlayerPullResult {
  /** The player who received the copy, wrapped as a deployable roster player. */
  player: RosterPlayer;
  /** Stable collection key (`name|position`) of that player. */
  targetKey: string;
  /** The tier's intrinsic class and how many copies own it. */
  cls: PlayerClass;
  threshold: number;
  /** Copies collected for this player AFTER the pull (== threshold on an overflow). */
  newCopies: number;
  /** True when this copy reached the threshold and unlocked the player. */
  unlockedNow: boolean;
  /** True when the whole tier was already owned, so this pull is a coin bounty. */
  isOverflow: boolean;
  /** Gross coins the pull costs. */
  cost: number;
  /** Coins credited back: the overflow bounty (0 unless isOverflow). */
  overflowCoins: number;
}

/**
 * Pull one copy from a machine (deterministic from the seeded RNG). Feeds the un-owned
 * player CLOSEST to unlocking (so a chase resolves in ~threshold pulls instead of
 * scattering); the copy that reaches the threshold unlocks. When every player in the
 * tier is owned, returns an OVERFLOW coin bounty and no new copy. Does NOT charge coins
 * or move the copy; the caller does both (see home-roster.applyPlayerPull).
 */
export function pullPlayer(
  tier: PlayerGachaTier,
  unlockedKeys: ReadonlySet<string>,
  collectingCopies: Readonly<Record<string, number>>,
  rng: RNG
): PlayerPullResult {
  const cost = PLAYER_MACHINES[tier].cost;
  const cls = PLAYER_MACHINES[tier].cls;
  const threshold = copiesToOwn(cls);
  const pool = tierPool(tier);
  const unowned = pool.filter((rp) => !unlockedKeys.has(realKey(rp)));
  if (unowned.length > 0) {
    // Concentrate on the player nearest to unlocking (most copies so far); ties break
    // on the seeded RNG so a fresh tier still starts somewhere reproducible.
    const progress = unowned.map((rp) => ({ rp, copies: collectingCopies[realKey(rp)] ?? 0 }));
    const best = Math.max(...progress.map((p) => p.copies));
    const pick = rng.pick(progress.filter((p) => p.copies === best));
    const newCopies = pick.copies + 1;
    return {
      player: realPlayerToRosterPlayer(pick.rp),
      targetKey: realKey(pick.rp),
      cls,
      threshold,
      newCopies,
      unlockedNow: newCopies >= threshold,
      isOverflow: false,
      cost,
      overflowCoins: 0,
    };
  }
  // Whole tier owned: overflow into a coin bounty (the successor to the half-refund).
  const target = rng.pick(pool);
  return {
    player: realPlayerToRosterPlayer(target),
    targetKey: realKey(target),
    cls,
    threshold,
    newCopies: threshold,
    unlockedNow: false,
    isOverflow: true,
    cost,
    overflowCoins: overflowBounty(cls),
  };
}
