import { NBA_LEGENDS } from '@/data/nba';
import type { RealPlayer } from '@/types/nba';
import { nameKey, type RosterPlayer } from '@/types/roster';
import { poolByClass, realPlayerToRosterPlayer } from './player-pool';
import { CLASS_ORDER, type PlayerClass } from './ratings';
import { copiesToOwn, overflowBounty } from './collection';
import { FAVOR_PER_COPY } from './favor';
import {
  DIFFICULTIES,
  difficultyAtLeast,
  type Difficulty,
  type LadderClass,
} from './difficulty-mode';
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
 * tier, a pull feeds a PINNED scout target when one is set (the player's explicit
 * chase, see home-roster.scoutTargets), else the un-owned player with the highest
 * EFFECTIVE progress: copies plus the banked-favor fraction (src/game/favor.ts), which
 * reduces to the classic closest-to-unlock rule when nobody has favor. The copy that
 * reaches the threshold unlocks (makes draftable). Once every player in a tier is owned,
 * further pulls OVERFLOW into a coin bounty (collection.overflowBounty), the successor to
 * the old flat half-refund. Pure and deterministic from the seeded RNG plus the ledgers
 * passed in; the caller charges coins, banks the bounty, and moves the copy into the
 * collection.
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

/** A machine's unlock requirement: clear `cls` on `minDifficulty` OR ABOVE. */
export interface MachineGate {
  cls: LadderClass;
  minDifficulty: Difficulty;
}

/**
 * The gate each scout machine stays LOCKED behind. Each tier still gates on the
 * ladder rung one below it, but the TOP tiers are now difficulty-exact: the S
 * machine demands a medium-or-better A clear and the Legendary machine a
 * hard-or-better S clear, so an easy-only climb can never open the star markets
 * (the old any-difficulty rule was the Easy farm's front door). One-directional:
 * clearing above the floor always counts. Derives from ladderProgress, so no
 * extra state persists; pre-update saves that had already opened a machine under
 * the old rule keep it via the grandfathered list (HomeRoster.legacyGates).
 */
const MACHINE_GATE: Record<PlayerGachaTier, MachineGate | null> = {
  C: null, // always open
  B: { cls: 'C', minDifficulty: 'easy' },
  A: { cls: 'B', minDifficulty: 'easy' },
  S: { cls: 'A', minDifficulty: 'medium' },
  legendary: { cls: 'S', minDifficulty: 'hard' },
};

/** The gate a machine is locked behind (null when always open). Drives the
 * "CLEAR A ON MEDIUM+" hint on a locked machine. */
export function machineGate(tier: PlayerGachaTier): MachineGate | null {
  return MACHINE_GATE[tier];
}

/** Whether a scout machine is unlocked: the gate's class cleared at (or above) the
 * gate's difficulty, or the tier grandfathered from a pre-gate save. */
export function machineUnlocked(
  tier: PlayerGachaTier,
  ladderProgress: Record<Difficulty, LadderClass | null>,
  grandfathered?: readonly PlayerGachaTier[]
): boolean {
  const need = MACHINE_GATE[tier];
  if (!need) return true;
  if (grandfathered?.includes(tier)) return true;
  const needIdx = CLASS_ORDER.indexOf(need.cls);
  return DIFFICULTIES.some((difficulty) => {
    if (!difficultyAtLeast(difficulty, need.minDifficulty)) return false;
    const cleared = ladderProgress[difficulty];
    return cleared != null && CLASS_ORDER.indexOf(cleared) >= needIdx;
  });
}

/** The OLD any-difficulty rule, kept only for the one-time v21 grandfather stamp:
 * a veteran whose machine was already open never sees it re-lock. */
export function machineUnlockedLegacyRule(
  tier: PlayerGachaTier,
  ladderProgress: Record<Difficulty, LadderClass | null>
): boolean {
  const need = MACHINE_GATE[tier];
  if (!need) return true;
  const needIdx = CLASS_ORDER.indexOf(need.cls);
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

/** Whether a collection key names a player in a machine's pool (pin validation). */
export function tierHasPlayer(tier: PlayerGachaTier, key: string): boolean {
  return tierPool(tier).some((rp) => realKey(rp) === key);
}

/** The machine tier that scouts a class, derived from the machine table so the
 * inverse map can never desync (null for the unscouted D / S++). */
export function tierForClass(cls: PlayerClass): PlayerGachaTier | null {
  return PLAYER_GACHA_TIERS.find((t) => PLAYER_MACHINES[t].cls === cls) ?? null;
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

/** What the machine card's target chip shows: the exact player the next pull will
 * feed, or null when the pull would tie-break on RNG (a fresh tier) or the tier is
 * complete. RNG-free twin of pullPlayer's selection, so the chip can never lie. */
export interface ScoutTarget {
  player: RosterPlayer;
  key: string;
  copies: number;
  threshold: number;
  /** Banked favor points for the target (0 when none). */
  favor: number;
  /** Whether the target is an explicit pin (vs the effective-progress leader). */
  pinned: boolean;
}

/** The co-leaders a pull selects among: the PINNED target alone when set and
 * un-owned, else every un-owned player tied at the highest effective progress.
 * The ONE selection rule shared by pullPlayer (which rng.picks a leader) and
 * scoutTargetFor (which shows a target only when the leader is unique), so the
 * card chip can never disagree with the machine by construction. */
function pullLeaders(
  tier: PlayerGachaTier,
  unlockedKeys: ReadonlySet<string>,
  collectingCopies: Readonly<Record<string, number>>,
  favor: Readonly<Record<string, number>>,
  pinnedKey?: string
): { leaders: RealPlayer[]; pinned: boolean; best: number } {
  const cls = PLAYER_MACHINES[tier].cls;
  const unowned = tierPool(tier).filter((rp) => !unlockedKeys.has(realKey(rp)));
  const pin = pinnedKey ? unowned.find((rp) => realKey(rp) === pinnedKey) : undefined;
  if (pin) return { leaders: [pin], pinned: true, best: 0 };
  const score = (rp: RealPlayer) =>
    effectiveProgress(collectingCopies[realKey(rp)] ?? 0, favor[realKey(rp)] ?? 0, cls);
  const best = unowned.length > 0 ? Math.max(...unowned.map(score)) : 0;
  return { leaders: unowned.filter((rp) => score(rp) === best), pinned: false, best };
}

/** The player the next pull of this machine will deterministically feed (see
 * ScoutTarget): the pin, or a UNIQUE effective-progress leader; null when the
 * pull would tie-break on the RNG (a fresh tier) or the tier is complete. */
export function scoutTargetFor(
  tier: PlayerGachaTier,
  unlockedKeys: ReadonlySet<string>,
  collectingCopies: Readonly<Record<string, number>>,
  favor: Readonly<Record<string, number>> = {},
  pinnedKey?: string
): ScoutTarget | null {
  const { leaders, pinned, best } = pullLeaders(tier, unlockedKeys, collectingCopies, favor, pinnedKey);
  if (leaders.length !== 1 || (!pinned && best <= 0)) return null;
  const rp = leaders[0];
  const key = realKey(rp);
  return {
    player: realPlayerToRosterPlayer(rp),
    key,
    copies: collectingCopies[key] ?? 0,
    threshold: copiesToOwn(PLAYER_MACHINES[tier].cls),
    favor: favor[key] ?? 0,
    pinned,
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

/** Optional favor direction for a pull: the home favor ledger and the machine's
 * pinned target. Both default empty, which reproduces the classic behavior exactly. */
export interface PullDirection {
  favor?: Readonly<Record<string, number>>;
  pinnedKey?: string;
}

/** A player's effective chase progress: whole copies plus the banked-favor fraction.
 * For the legendary tier favor IS the progress (copies are always 0 and S+ never
 * converts), so raw points order the queue there. */
function effectiveProgress(
  copies: number,
  favorPoints: number,
  cls: PlayerClass
): number {
  const perCopy = FAVOR_PER_COPY[cls] ?? 0;
  return copies + (perCopy > 0 ? favorPoints / perCopy : favorPoints);
}

/**
 * Pull one copy from a machine (deterministic from the seeded RNG plus the ledgers the
 * caller passes). Selection among the un-owned: the PINNED target first (an explicit,
 * player-chosen chase), else the highest EFFECTIVE progress (copies + banked favor
 * fraction, a strict generalization of the classic closest-to-unlock rule: identical
 * when nobody has favor), seeded-RNG tie-break. The copy that reaches the threshold
 * unlocks. When every player in the tier is owned, returns an OVERFLOW coin bounty and
 * no new copy. Does NOT charge coins or move the copy; the caller does both (see
 * home-roster.applyPlayerPull).
 */
export function pullPlayer(
  tier: PlayerGachaTier,
  unlockedKeys: ReadonlySet<string>,
  collectingCopies: Readonly<Record<string, number>>,
  rng: RNG,
  direction: PullDirection = {}
): PlayerPullResult {
  const cost = PLAYER_MACHINES[tier].cost;
  const cls = PLAYER_MACHINES[tier].cls;
  const threshold = copiesToOwn(cls);
  const pool = tierPool(tier);
  // A pinned target takes the copy outright; otherwise the copy lands on the highest
  // effective progress, ties broken on the seeded RNG so a fresh tier still starts
  // somewhere reproducible (see pullLeaders, shared with the card's target chip).
  const { leaders } = pullLeaders(
    tier,
    unlockedKeys,
    collectingCopies,
    direction.favor ?? {},
    direction.pinnedKey
  );
  if (leaders.length > 0) {
    // Always one rng.pick (a singleton picks itself), so the draw count per pull is
    // stable and downstream consumers of a shared RNG stay reproducible.
    const pick = rng.pick(leaders);
    const newCopies = (collectingCopies[realKey(pick)] ?? 0) + 1;
    return {
      player: realPlayerToRosterPlayer(pick),
      targetKey: realKey(pick),
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
