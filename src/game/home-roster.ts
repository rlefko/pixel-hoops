import { nameKey, type Roster, type RosterPlayer } from '@/types/roster';
import type { RunRewards } from '@/types/run-map';
import type { PlayerStats } from '@/types/player';
import type { RNG } from './rng';
import { buildStartingTwelve } from './tournament';
import { backfillPlayStyleStats, expandStats, isLegacyStats } from './stat-migration';
import { remapElite, remapSystem, STAT_MIN } from './stat-scaling';
import { RATING_CAP, canUpgrade, perStatMax, upgradeCost } from './upgrades';
import { classForOvr, ovr, type PlayerClass } from './ratings';
import {
  DIFFICULTIES,
  LADDER_CLASSES,
  advanceLadder,
  isLadderClass,
  type Difficulty,
  type LadderClass,
} from './difficulty-mode';
import { pullPlayer, PLAYER_MACHINES, type PlayerGachaTier, type PlayerPullResult } from './player-gacha';
import { GACHA_MACHINES, getGachaAbility } from './abilities-gacha';
import { HALL_OF_FAME_CAP, sanitizeHallOfFame, type HallOfFameEntry } from './hall-of-fame';
import { COACHES, STARTER_COACH_ID, earnedCoachIds, coachesWonByClear, isCoachId } from './coaches';

/**
 * The persistent "home roster" that compounds across runs. It is now an UNCAPPED,
 * de-duplicated COLLECTION of every player ever recruited (searched/filtered in the
 * roster browser, drafted from before each run). A run drafts a rotation from it,
 * recruits join the collection at run end, and re-recruiting a known player is a
 * no-op (their Locker Room upgrades and equipped ability are preserved).
 *
 * Permanent stat upgrades live in the `upgrades` ledger (capped at +2/stat). Gacha
 * abilities live in `abilityInventory` (owned counts) and `equippedAbilities`
 * (playerKey -> abilityId, persisted between runs). Progress through the
 * (difficulty x class) ladder lives in `ladderProgress`. See docs/difficulty-rebalance.md.
 */
export interface HomeRoster {
  /** Every owned player (uncapped, unique by playerKey). */
  players: RosterPlayer[];
  coins: number;
  reputation: number;
  /** Paid +1 counts per player (`name|POS`) per stat. Drives cost tier + the +2 cap. */
  upgrades: Record<string, Partial<Record<keyof PlayerStats, number>>>;
  /** Owned gacha-ability counts by id (a copy can be equipped on one player at a time). */
  abilityInventory: Record<string, number>;
  /** Equipped gacha ability per player (`playerKey` -> abilityId); persists between runs. */
  equippedAbilities: Record<string, string>;
  /** Highest ladder class cleared per difficulty (null = none; C is always available). */
  ladderProgress: Record<Difficulty, LadderClass | null>;
  /** The difficulty selected for the next run. */
  selectedDifficulty: Difficulty;
  /** The ladder class selected for the next run (must be unlocked on the difficulty). */
  selectedLadderClass: LadderClass;
  /** Remembered draft rotations keyed by difficulty then ladder class. Each value is a
   * slot-ordered playerKey list (0-4 = PG..C starters, then up to 3 bench), captured the
   * instant a run's draft is confirmed. The pre-run draft pre-populates from the matching
   * cell, falling back to the nearest LOWER ladder class at the SAME difficulty (so
   * climbing a rung inherits the team built on the rung below). */
  rosterMemory: Record<Difficulty, Partial<Record<LadderClass, string[]>>>;
  /** Completed runs since a legendary was last offered (soft pity). */
  legendDryStreak: number;
  /** Whether the one-time, first-run welcome reveal has been shown. */
  seenWelcome?: boolean;
  /** Championship rosters, newest first (capped at HALL_OF_FAME_CAP). */
  hallOfFame: HallOfFameEntry[];
  /** Owned coach ids (won off the ladder, never bought; always includes the
   * starter). Derived from ladderProgress on load, then grown on championships. */
  ownedCoaches: string[];
  /** The coach equipped for the next run (must be owned; defaults to the starter). */
  selectedCoachId: string;
}

// v11 adds the Coach system (`ownedCoaches`/`selectedCoachId`). On load, owned coaches
// are DERIVED from `ladderProgress` so veteran saves retroactively receive every coach
// their progress has earned; the starter is always granted and the selection defaults to
// the starter when missing/invalid (so coaches need no separate persisted unlock state).
// v9 replaces the single `lastRotation` with `rosterMemory`, a per-(difficulty x class)
// map of remembered draft rotations; on load an older save's `lastRotation` seeds the
// currently selected cell (best-effort, since the cell it was drafted on was not stored).
// v8 adds the Hall of Fame (championship snapshots); the field defaults to [] on
// older saves (no migration needed). v7 widens the rating scale (the old 3-10 model
// doubles to a 6-20 normal band with curated greats to ~24 and a hard cap of 30):
// owned players are remapped on load (legends via the elite expansion, others x2). v6
// replaced the League-tier fields with the (difficulty x class) ladder, added the
// gacha ability inventory/equips and per-player originalClass, and uncapped the
// collection. v1's four-stat lines are still migrated to the ten-rating model before
// the scale remap.
const HOME_ROSTER_VERSION = 11;

/**
 * The rarity overhaul rebuilt the gacha-ability pool, so a pre-v10 save can hold
 * inventory counts and equips under ability ids that no longer exist. Drop the dead
 * ids (the runtime already skips unknown ids, but they would linger as phantom
 * inventory) and refund a flat coin floor per dropped OWNED copy so the player is not
 * silently robbed. Idempotent: a clean save drops nothing and refunds zero.
 */
function sanitizeAbilities(
  inventory: Record<string, number>,
  equipped: Record<string, string>
): { inventory: Record<string, number>; equipped: Record<string, string>; refund: number } {
  const cleanInv: Record<string, number> = {};
  let refund = 0;
  for (const [id, count] of Object.entries(inventory)) {
    if (getGachaAbility(id) && count > 0) cleanInv[id] = count;
    else refund += Math.max(0, count) * GACHA_MACHINES.common.cost;
  }
  const cleanEq: Record<string, string> = {};
  for (const [key, id] of Object.entries(equipped)) {
    if (getGachaAbility(id)) cleanEq[key] = id;
  }
  return { inventory: cleanInv, equipped: cleanEq, refund };
}

export interface SerializedHomeRoster {
  version: number;
  data: HomeRoster;
}

/** An empty per-difficulty ladder-progress map. */
function emptyLadderProgress(): Record<Difficulty, LadderClass | null> {
  return DIFFICULTIES.reduce(
    (acc, d) => {
      acc[d] = null;
      return acc;
    },
    {} as Record<Difficulty, LadderClass | null>
  );
}

/** An empty per-difficulty roster-memory map (each difficulty starts with no remembered
 * ladder rotations). */
function emptyRosterMemory(): Record<Difficulty, Partial<Record<LadderClass, string[]>>> {
  return DIFFICULTIES.reduce(
    (acc, d) => {
      acc[d] = {};
      return acc;
    },
    {} as Record<Difficulty, Partial<Record<LadderClass, string[]>>>
  );
}

/**
 * Remember the rotation a run's draft committed, so the next draft of this exact
 * (difficulty, ladder class) pre-populates with it. Returns a NEW home roster, or the
 * same reference for a rotation that could not field a five (fewer than five keys).
 */
export function rememberDraftRotation(
  home: HomeRoster,
  difficulty: Difficulty,
  ladderClass: LadderClass,
  rotation: string[]
): HomeRoster {
  if (rotation.length < 5) return home;
  return {
    ...home,
    rosterMemory: {
      ...home.rosterMemory,
      [difficulty]: { ...home.rosterMemory[difficulty], [ladderClass]: rotation },
    },
  };
}

/**
 * The rotation the pre-run draft should pre-fill for a (difficulty, ladder class): the
 * exact remembered cell when present, else the nearest LOWER ladder class with a
 * remembered rotation at the SAME difficulty (transitive walk-down, so a new rung
 * inherits the team built on the rung below), else undefined (a fresh loadout is built).
 * Never crosses difficulties, since each difficulty has its own draft point budget.
 */
export function resolveDraftRotation(
  home: HomeRoster,
  difficulty: Difficulty,
  ladderClass: LadderClass
): string[] | undefined {
  const memory = home.rosterMemory?.[difficulty];
  if (!memory) return undefined;
  for (let i = LADDER_CLASSES.indexOf(ladderClass); i >= 0; i--) {
    const rotation = memory[LADDER_CLASSES[i]];
    if (rotation && rotation.length >= 5) return rotation;
  }
  return undefined;
}

/** A fresh home roster: the starting twelve (5 D + 5 C + 2 B), nothing unlocked. */
export function createRookieRoster(rng: RNG): HomeRoster {
  return {
    players: buildStartingTwelve(rng),
    coins: 0,
    reputation: 0,
    upgrades: {},
    abilityInventory: {},
    equippedAbilities: {},
    ladderProgress: emptyLadderProgress(),
    selectedDifficulty: 'easy',
    selectedLadderClass: 'C',
    rosterMemory: emptyRosterMemory(),
    legendDryStreak: 0,
    seenWelcome: false,
    hallOfFame: [],
    ownedCoaches: [STARTER_COACH_ID],
    selectedCoachId: STARTER_COACH_ID,
  };
}

/** Stable per-player identity (survives merge reordering; keys the upgrade ledger
 * and the equipped-ability map). */
export function playerKey(rp: RosterPlayer): string {
  return nameKey(rp.player.name, rp.position);
}

/** A copy of a player with their equipped gacha ability stamped on from the home
 * record (so the run/draft sees it). */
export function stampEquippedAbility(rp: RosterPlayer, home: HomeRoster): RosterPlayer {
  const id = home.equippedAbilities[playerKey(rp)];
  if (!id) return rp;
  return { ...rp, equippedAbility: { id } };
}

/** The full owned collection as draftable players (each stamped with its equipped
 * ability). The pre-run draft picks a rotation from this. */
export function ownedRosterPlayers(home: HomeRoster): RosterPlayer[] {
  return home.players.map((p) => stampEquippedAbility(p, home));
}

/** Back-compat: the owned collection as a Roster (first five start). Drafting is
 * the real pre-run path; this is a convenience/default. */
export function homeToRunRoster(home: HomeRoster): Roster {
  const all = ownedRosterPlayers(home);
  return { starters: all.slice(0, 5), bench: all.slice(5) };
}

/** How many paid +1s a player has bought for one stat. */
export function upgradeCount(
  home: HomeRoster,
  rp: RosterPlayer,
  stat: keyof PlayerStats
): number {
  return home.upgrades[playerKey(rp)]?.[stat] ?? 0;
}

/** Total permanent +1s a player has bought across all stats (search tiebreaker). */
export function totalUpgrades(home: HomeRoster, rp: RosterPlayer): number {
  const ledger = home.upgrades[playerKey(rp)];
  if (!ledger) return 0;
  let sum = 0;
  for (const stat in ledger) sum += ledger[stat as keyof PlayerStats] ?? 0;
  return sum;
}

/**
 * Buy one permanent +1 of `stat` for the player at `index`. Returns a NEW home
 * roster, or the same reference when unaffordable, at the +2 per-stat cap, or at
 * the rating ceiling.
 */
export function applyUpgrade(
  home: HomeRoster,
  index: number,
  stat: keyof PlayerStats
): HomeRoster {
  const rp = home.players[index];
  if (!rp) return home;
  const key = playerKey(rp);
  const bought = home.upgrades[key]?.[stat] ?? 0;
  if (!canUpgrade(stat, rp.player.stats[stat], bought, perStatMax())) return home;
  const cost = upgradeCost(stat, bought);
  if (home.coins < cost) return home;
  const players = home.players.map((p, i) =>
    i === index
      ? {
          ...p,
          player: {
            ...p.player,
            stats: { ...p.player.stats, [stat]: Math.min(RATING_CAP, p.player.stats[stat] + 1) },
          },
        }
      : p
  );
  const upgrades = { ...home.upgrades, [key]: { ...home.upgrades[key], [stat]: bought + 1 } };
  return { ...home, players, coins: home.coins - cost, upgrades };
}

// --- Gacha ability inventory / equipping ---

/** How many copies of an ability are owned. */
export function abilityOwned(home: HomeRoster, id: string): number {
  return home.abilityInventory[id] ?? 0;
}

/** How many copies of an ability are currently equipped across players. */
export function abilityEquipped(home: HomeRoster, id: string): number {
  let n = 0;
  for (const v of Object.values(home.equippedAbilities)) if (v === id) n += 1;
  return n;
}

/** Whether another copy of an ability can be equipped (owned > equipped). */
export function canEquipAbility(home: HomeRoster, id: string): boolean {
  return abilityEquipped(home, id) < abilityOwned(home, id);
}

/** Add one pulled ability to the inventory (returns a NEW home roster). */
export function addAbility(home: HomeRoster, id: string): HomeRoster {
  return { ...home, abilityInventory: { ...home.abilityInventory, [id]: abilityOwned(home, id) + 1 } };
}

/** Equip an ability onto a player (by key), if a free copy is owned. Swapping the
 * player's current ability frees it; the new id still needs an unequipped copy.
 * No-op when none is free. */
export function equipAbility(home: HomeRoster, key: string, id: string): HomeRoster {
  if (home.equippedAbilities[key] === id) return home;
  if (!canEquipAbility(home, id)) return home;
  return { ...home, equippedAbilities: { ...home.equippedAbilities, [key]: id } };
}

/** Unequip a player's ability (returns a NEW home roster). */
export function unequipAbility(home: HomeRoster, key: string): HomeRoster {
  if (!home.equippedAbilities[key]) return home;
  const next = { ...home.equippedAbilities };
  delete next[key];
  return { ...home, equippedAbilities: next };
}

// --- Coaches (won off the ladder, never bought) ---

/** Whether a coach is owned. */
export function ownsCoach(home: HomeRoster, id: string): boolean {
  return home.ownedCoaches.includes(id);
}

/** Grant a coach (idempotent; ignores unknown ids). Returns a NEW home roster, or
 * the same reference when nothing changes. Keeps the list in catalog order. */
export function grantCoach(home: HomeRoster, id: string): HomeRoster {
  if (!isCoachId(id) || home.ownedCoaches.includes(id)) return home;
  const owned = new Set([...home.ownedCoaches, id]);
  return { ...home, ownedCoaches: COACHES.filter((c) => owned.has(c.id)).map((c) => c.id) };
}

/** Equip an owned coach for the next run (no-op when not owned). */
export function selectCoach(home: HomeRoster, id: string): HomeRoster {
  if (home.selectedCoachId === id || !home.ownedCoaches.includes(id)) return home;
  return { ...home, selectedCoachId: id };
}

// --- Player scouting gacha ---

/**
 * Pull a player from a scouting machine and fold it into the home collection. A new
 * signing prepends to the collection (recency-first, like a merge) and costs the
 * full price; a repeat (only possible once the tier is fully collected) refunds half
 * and adds no player. Unaffordable is a no-op: the home roster is returned unchanged,
 * alongside the (unbanked) result so a caller can decide what to show. See
 * src/game/player-gacha.ts for the pull odds and pricing.
 */
export function applyPlayerPull(
  home: HomeRoster,
  tier: PlayerGachaTier,
  rng: RNG
): { home: HomeRoster; result: PlayerPullResult } {
  const ownedKeys = new Set(home.players.map(playerKey));
  const result = pullPlayer(tier, ownedKeys, rng);
  if (home.coins < PLAYER_MACHINES[tier].cost) return { home, result }; // unaffordable: no-op
  const coins = home.coins - result.cost + result.refund;
  const players = result.isDupe ? home.players : [result.player, ...home.players];
  return { home: { ...home, coins, players }, result };
}

/**
 * Fold a finished run's gains back into the home collection. The persistent
 * collection is preserved; only NEW recruits (players not already owned by key,
 * on-loan stripped) are appended, with run-scoped state removed. Rewards bank. On a
 * championship at the run's (difficulty, ladder class) frontier the ladder advances
 * and auto-selects the newly unlocked class. The legendary pity streak advances
 * unless a legendary was offered this run.
 */
export function mergeRunGainsIntoHome(
  home: HomeRoster,
  runRoster: Roster,
  rewards?: RunRewards,
  legendOffered = false,
  champion = false,
  clearedClass?: LadderClass,
  // The difficulty the run was actually PLAYED on (model.difficulty), which can
  // differ from home.selectedDifficulty if the menu selection changed; the ladder
  // must advance on the played difficulty. Defaults to the current selection.
  playedDifficulty: Difficulty = home.selectedDifficulty,
  // A pre-built Hall of Fame entry for a championship (the hook builds it, since it
  // needs Date.now()). Prepended to the trophy case only on a win; ignored otherwise.
  championEntry?: HallOfFameEntry
): HomeRoster {
  const fielded = [...runRoster.starters, ...runRoster.bench].filter((p) => !p.onLoan);
  const ownedKeys = new Set(home.players.map(playerKey));
  // Recruits are kept only when the run is CLEARED. On a loss they evaporate: only
  // already-owned players come home (coins and reputation still bank below, and the
  // permanent collection is never reduced).
  const newRecruits = champion
    ? fielded
        .filter((p) => !ownedKeys.has(playerKey(p)))
        .map((p) => {
          const copy = { ...p };
          delete copy.item; // run-scoped
          delete copy.trainingDelta; // run-scoped
          delete copy.gamesOut; // injuries heal at run end
          delete copy.equippedAbility; // the home equippedAbilities map is the source of truth
          return copy;
        })
    : [];
  // De-dupe new recruits against each other (a run can offer the same name twice).
  const seen = new Set<string>();
  const deduped = newRecruits.filter((p) => {
    const k = playerKey(p);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Recency: the players fielded this run move to the FRONT of the collection (in
  // slot order), then this run's new recruits, then everyone else in prior order.
  // So the owned collection stays sorted by most-recently-used.
  const fieldedOwnedKeys: string[] = [];
  const seenF = new Set<string>();
  for (const p of fielded) {
    const k = playerKey(p);
    if (ownedKeys.has(k) && !seenF.has(k)) {
      seenF.add(k);
      fieldedOwnedKeys.push(k);
    }
  }
  const homeByKey = new Map(home.players.map((p) => [playerKey(p), p]));
  const fieldedOwned = fieldedOwnedKeys.map((k) => homeByKey.get(k)!);
  const restOwned = home.players.filter((p) => !seenF.has(playerKey(p)));
  const players = [...fieldedOwned, ...deduped, ...restOwned];

  // The draft rotation to restore next run is captured at draft-confirm time into
  // `rosterMemory` (per difficulty x ladder class); `...home` below preserves it.

  const ladderProgress = { ...home.ladderProgress };
  let selectedLadderClass = home.selectedLadderClass;
  let ownedCoaches = home.ownedCoaches;
  if (champion && clearedClass) {
    // Win any coaches this clear entitles (computed BEFORE the ladder write;
    // coachesWonByClear re-applies advanceLadder itself). Keeps the equipped coach.
    const won = coachesWonByClear(
      home.ladderProgress,
      playedDifficulty,
      clearedClass,
      new Set(home.ownedCoaches)
    );
    if (won.length) {
      const owned = new Set([...home.ownedCoaches, ...won]);
      ownedCoaches = COACHES.filter((c) => owned.has(c.id)).map((c) => c.id);
    }
    const advanced = advanceLadder(ladderProgress[playedDifficulty], clearedClass);
    ladderProgress[playedDifficulty] = advanced;
    // Auto-select the next unlocked class (the new frontier), like the old ladder.
    const order: LadderClass[] = ['C', 'B', 'A', 'S', 'S+'];
    const nextIdx = Math.min(order.indexOf(advanced) + 1, order.length - 1);
    selectedLadderClass = order[nextIdx];
  }

  return {
    ...home,
    players,
    coins: home.coins + (rewards?.coins ?? 0),
    reputation: home.reputation + (rewards?.reputation ?? 0),
    ladderProgress,
    selectedLadderClass,
    ownedCoaches,
    legendDryStreak: legendOffered ? 0 : home.legendDryStreak + 1,
    seenWelcome: home.seenWelcome ?? true,
    hallOfFame:
      champion && championEntry
        ? [championEntry, ...(home.hallOfFame ?? [])].slice(0, HALL_OF_FAME_CAP)
        : (home.hallOfFame ?? []),
  };
}

export function serializeHomeRoster(home: HomeRoster): SerializedHomeRoster {
  return { version: HOME_ROSTER_VERSION, data: home };
}

/**
 * Backfill a player's intrinsic class when missing (pre-v6 saves). Reconstructs
 * the BASE stats by subtracting the permanent-upgrade ledger first, so an already
 * upgraded legacy player records its true STARTING class, not the upgraded one.
 */
function withOriginalClass(
  rp: RosterPlayer,
  upgrades: Record<string, Partial<Record<keyof PlayerStats, number>>>
): RosterPlayer {
  if (rp.originalClass) return rp;
  if (rp.legendary) return { ...rp, originalClass: 'S+' };
  const bought = upgrades[playerKey(rp)] ?? {};
  const base = { ...rp.player.stats };
  for (const key in bought) {
    const k = key as keyof PlayerStats;
    base[k] = Math.max(STAT_MIN, base[k] - (bought[k] ?? 0));
  }
  return { ...rp, originalClass: classForOvr(ovr(base, rp.position)) };
}

/**
 * Remap a persisted player's stats onto the widened scale (v7). Legends use the
 * elite expansion (matching the re-baked legend data); everyone else doubles
 * (matching the re-baked pool). Idempotent guard: a line already on the new scale
 * (any skill above the old 10 cap) is left untouched. The upgrades ledger (purchase
 * counts) is preserved separately, so a veteran keeps their buys.
 */
function remapPlayerStatsToV7(rp: RosterPlayer): RosterPlayer {
  const stats = rp.player.stats;
  if (Object.values(stats).some((v) => v > 10)) return rp; // already widened
  const remap = rp.legendary ? remapElite : remapSystem;
  const next = {} as PlayerStats;
  for (const key in stats) {
    const k = key as keyof PlayerStats;
    next[k] = remap(stats[k]);
  }
  return { ...rp, player: { ...rp.player, stats: next } };
}

/**
 * Restore a home roster from storage, tolerating missing/garbage fields, upgrading
 * legacy four-stat saves (v1) to the ten-rating model, and migrating pre-v6 saves
 * (which had League-tier fields and a capped roster) to the (difficulty x class)
 * ladder. New fields default cleanly; run-scoped state is stripped defensively.
 */
export function deserializeHomeRoster(raw: unknown): HomeRoster | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = (raw as Partial<SerializedHomeRoster>).data as Partial<HomeRoster> | undefined;
  if (!data || !Array.isArray(data.players) || data.players.length < 5) return null;
  const playersOk = data.players.every((p) => {
    const stats = p?.player?.stats as unknown as Record<string, unknown> | undefined;
    return (
      !!stats &&
      typeof p.player?.name === 'string' &&
      typeof p.position === 'string' &&
      (typeof stats.outside === 'number' || isLegacyStats(stats))
    );
  });
  if (!playersOk) return null;
  const savedUpgrades =
    data.upgrades && typeof data.upgrades === 'object' ? data.upgrades : {};
  // Pre-v7 saves carry old 3-10 stats; widen them to the new scale on load.
  const version = typeof (raw as Partial<SerializedHomeRoster>).version === 'number'
    ? (raw as SerializedHomeRoster).version
    : 0;
  const needsScaleBump = version < 7;
  const players = data.players.map((p): RosterPlayer => {
    const expanded = isLegacyStats(p.player.stats)
      ? { ...p, player: { ...p.player, stats: expandStats(p.player.stats, p.position) } }
      : { ...p };
    const scaled = needsScaleBump ? remapPlayerStatsToV7(expanded) : expanded;
    // Fill any play-style ratings missing from a save written before the
    // expansion, position-aware (a no-op once every key is present).
    const migrated: RosterPlayer = {
      ...scaled,
      player: {
        ...scaled.player,
        stats: backfillPlayStyleStats(scaled.player.stats, scaled.position),
      },
    };
    delete migrated.item; // never trust a persisted run-scoped item
    delete migrated.onLoan;
    delete migrated.trainingDelta;
    delete migrated.gamesOut;
    delete migrated.equippedAbility; // sourced from equippedAbilities, not the player
    return withOriginalClass(migrated, savedUpgrades);
  });

  const ladderProgress = emptyLadderProgress();
  const savedProgress = (data.ladderProgress ?? {}) as Record<string, unknown>;
  for (const d of DIFFICULTIES) {
    const v = savedProgress[d];
    if (typeof v === 'string' && isLadderClass(v as PlayerClass)) {
      ladderProgress[d] = v as LadderClass;
    }
  }
  const selectedDifficulty: Difficulty =
    typeof data.selectedDifficulty === 'string' &&
    (DIFFICULTIES as readonly string[]).includes(data.selectedDifficulty)
      ? (data.selectedDifficulty as Difficulty)
      : 'easy';
  const selectedLadderClass: LadderClass =
    typeof data.selectedLadderClass === 'string' && isLadderClass(data.selectedLadderClass as PlayerClass)
      ? (data.selectedLadderClass as LadderClass)
      : 'C';

  // Per-(difficulty x class) remembered draft rotations. Copy any well-formed cells,
  // then migrate a pre-v9 save's single `lastRotation` into the currently selected cell
  // (best-effort: the cell it was drafted on was not stored; the lower-ladder fallback
  // covers any gaps).
  const rosterMemory = emptyRosterMemory();
  const savedMemory = (data.rosterMemory ?? {}) as Record<string, unknown>;
  for (const d of DIFFICULTIES) {
    const cells = savedMemory[d];
    if (!cells || typeof cells !== 'object') continue;
    for (const cls of LADDER_CLASSES) {
      const rotation = (cells as Record<string, unknown>)[cls];
      if (Array.isArray(rotation) && rotation.every((k) => typeof k === 'string')) {
        rosterMemory[d][cls] = rotation as string[];
      }
    }
  }
  const legacyRotation = (data as { lastRotation?: unknown }).lastRotation;
  if (
    Array.isArray(legacyRotation) &&
    legacyRotation.length >= 5 &&
    legacyRotation.every((k) => typeof k === 'string') &&
    !rosterMemory[selectedDifficulty][selectedLadderClass]
  ) {
    rosterMemory[selectedDifficulty][selectedLadderClass] = legacyRotation as string[];
  }

  const rawInventory =
    data.abilityInventory && typeof data.abilityInventory === 'object'
      ? (data.abilityInventory as Record<string, number>)
      : {};
  const rawEquipped =
    data.equippedAbilities && typeof data.equippedAbilities === 'object'
      ? (data.equippedAbilities as Record<string, string>)
      : {};
  const abilities = sanitizeAbilities(rawInventory, rawEquipped);

  // v11: derive owned coaches from ladder progress (so veterans retroactively own
  // every coach their progress has earned), then union with any explicitly-saved ids
  // (forward-compat), always including the starter; drop unknown ids defensively.
  const ownedSet = new Set(earnedCoachIds(ladderProgress));
  ownedSet.add(STARTER_COACH_ID);
  const savedCoaches = Array.isArray(data.ownedCoaches) ? data.ownedCoaches : [];
  for (const id of savedCoaches) if (typeof id === 'string' && isCoachId(id)) ownedSet.add(id);
  const ownedCoaches = COACHES.filter((c) => ownedSet.has(c.id)).map((c) => c.id);
  const selectedCoachId =
    typeof data.selectedCoachId === 'string' && ownedSet.has(data.selectedCoachId)
      ? data.selectedCoachId
      : STARTER_COACH_ID;

  return {
    players,
    coins: (typeof data.coins === 'number' ? data.coins : 0) + abilities.refund,
    reputation: typeof data.reputation === 'number' ? data.reputation : 0,
    upgrades: savedUpgrades,
    abilityInventory: abilities.inventory,
    equippedAbilities: abilities.equipped,
    ladderProgress,
    selectedDifficulty,
    selectedLadderClass,
    rosterMemory,
    legendDryStreak: typeof data.legendDryStreak === 'number' ? data.legendDryStreak : 0,
    seenWelcome: typeof data.seenWelcome === 'boolean' ? data.seenWelcome : true,
    hallOfFame: sanitizeHallOfFame(data.hallOfFame),
    ownedCoaches,
    selectedCoachId,
  };
}
