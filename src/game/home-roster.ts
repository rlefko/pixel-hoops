import { nameKey, type Roster, type RosterPlayer } from '@/types/roster';
import type { RunRewards } from '@/types/run-map';
import type { PlayerStats } from '@/types/player';
import type { RNG } from './rng';
import { buildStartingTwelve } from './tournament';
import { backfillPlayStyleStats, expandStats, isLegacyStats } from './stat-migration';
import { remapElite, remapSystem, STAT_MIN } from './stat-scaling';
import { RATING_CAP, canUpgrade, perStatMax, upgradeCost } from './upgrades';
import { CLASS_ORDER, classForOvr, ovr, ovrRaw, type PlayerClass } from './ratings';
import {
  DIFFICULTIES,
  LADDER_CLASSES,
  advanceLadder,
  cellKey,
  difficultyMods,
  frontierFromCells,
  isLadderClass,
  type Difficulty,
  type LadderClass,
} from './difficulty-mode';
import {
  PLAYER_GACHA_TIERS,
  pullPlayer,
  machineUnlocked,
  tierPool,
  type PlayerGachaTier,
  type PlayerPullResult,
} from './player-gacha';
import { REACH_UP_DEPOSIT_COPIES, copiesToOwn, type CollectingPlayer } from './collection';
import {
  FAVOR_PER_COPY,
  FAVOR_RESIDUAL_COIN_RATE,
  favorToCopies,
  settleFavorEarned,
} from './favor';
import { playerDraftClass } from './draft';
import { GACHA_MACHINES, getGachaAbility, pickAbilityOfRarity } from './abilities-gacha';
import { BOUNTIES, GRANDMASTER_KEY, bountyFor, bountyKey, type Bounty } from './bounties';
import { HALL_OF_FAME_CAP, sanitizeHallOfFame, type HallOfFameEntry } from './hall-of-fame';
import { COACHES, STARTER_COACH_ID, earnedCoachIds, coachesWonByClear, isCoachId } from './coaches';
import { COURT_THEMES, DEFAULT_COURT_THEME_ID, courtThemeUnlocked } from './court-themes';
import {
  DAILY_BOUNTY_COINS,
  FIRST_WIN_COINS,
  FIRST_WIN_SCOUT_TIER,
  WEEKLY_TIERS,
  spotlightCell,
  weeklyProgress,
  type DailyCell,
  type WeeklyLedger,
} from './daily';

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
  /** Every OWNED (unlocked) player: uncapped, unique by playerKey, draftable. A player
   * lands here only once enough copies are collected (see `collecting` + collection.ts). */
  players: RosterPlayer[];
  /** In-progress players: collected but not yet owned (copies below the class threshold).
   * Shown as a progress meter in the roster browser; NOT draftable. Each graduates into
   * `players` the instant its copy count reaches copiesToOwn(originalClass). */
  collecting: CollectingPlayer[];
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
  /** Coin-banking ledger. Coins bank into the wallet AS THEY ARE EARNED (not at run
   * end), so the wallet always reflects a run's gains, even after a mid-run suspend.
   * `lastBankedRunId` is the run currently banking (its `core.seed`); `lastBankedCoins`
   * is how many of that run's coins are already in the wallet. The two make banking a
   * self-correcting delta that can never double-count across resumes or crashes. */
  lastBankedRunId?: string;
  lastBankedCoins?: number;
  /** The run whose TERMINAL rewards (recruits, ladder, coaches, Hall of Fame, reputation,
   * legend pity) have been merged, so a run resumed past a crash can never grant them
   * twice. Set in the same write as the merge. */
  settledRunId?: string;
  /** Cells whose one-time Championship Bounty has been materially granted, keyed by
   * bounties.bountyKey (`difficulty:ladderClass`). An explicit record + idempotency guard;
   * crests derive from clearedCells, not this. See bounties.ts. */
  claimedBounties: string[];
  /** The selected home-court theme (src/game/court-themes.ts); unlocks derive from
   * clearedCells. Absent/invalid ids fall back to the classic court. */
  courtTheme?: string;
  /** Every (difficulty x ladder class) cell ever CLEARED, keyed by cellKey
   * (`difficulty:class`). The source of truth for crests, the bounty first-clear guard,
   * court-theme unlocks, and (via the global max class) which ladder classes are
   * selectable on every difficulty: a class cleared anywhere is open everywhere, so the
   * grid is a 20-cell bounty board rather than four ladders to re-climb. Kept in sync
   * with the per-difficulty `ladderProgress` frontier (which coach ranks and scout
   * gates still read). */
  clearedCells: string[];
  /** Daily Layer claim stamps: each stores the LOCAL dayKey (src/game/daily.ts; the
   * hook owns the clock, never this module) whose reward was granted, so "claimed
   * today" is a string comparison and there is no lazy-reset write to miss. A clock
   * change can re-open a day for a solitaire cheater but can never void a grant. */
  daily?: { spotlightClaimedDay?: string; firstWinClaimedDay?: string };
  /** Weekly-goal ledger for ONE weekKey (the local Monday's dayKey). Rolls lazily: a
   * settle in a different week starts fresh counters. gameWins counts wins EVEN from
   * lost runs (weekly progress is anti-frustration by design); claimedTiers records
   * paid tier indexes so a resumed settle or a rolled-back clock can never re-pay. */
  weekly?: WeeklyLedger;
  /** FAVOR ledger: win-earned progress toward owning specific players, keyed by
   * playerKey and held only for UN-OWNED players (entries are dropped on unlock and
   * on load). Fielding an un-owned player banks favor for every won game they logged
   * minutes in; it survives a lost run and converts to collection copies at run end
   * (see src/game/favor.ts and docs/favor-system.md). */
  favor: Record<string, number>;
  /** Pinned scout target per machine tier (playerKey). A pinned un-owned player
   * receives every one of that machine's copies until owned; absent tiers fall back
   * to the highest effective progress (copies + favor), i.e. the classic
   * closest-to-unlock rule. */
  scoutTargets?: Partial<Record<PlayerGachaTier, string>>;
}

// v18 adds the favor ledger (`favor`, playerKey -> points for un-owned players) and
// the pinned scout targets (`scoutTargets`). Older saves default to an empty ledger
// and no pins (no value migration), with ONE goodwill exception: in-progress A-class
// entries are granted a half-copy of favor on the bump, since v18 also raises the
// A-class copies threshold from three to four (collection.ts) and the bar should
// visibly move forward, not back, on update day. Entries for owned players are
// dropped on load, so the ledger can never leak a completed chase.
// v17 adds the Daily Layer ledgers (`daily`/`weekly`): per-day claim stamps for the
// Spotlight bounty and the first-win bonus (each records the dayKey it paid, so a
// claim is a comparison rather than a reset), plus the weekly-goal counters (week
// key, gameWins, claimed tier indexes). Both are optional and default to undefined on
// older saves (no value migration): a veteran's first settle after the update simply
// opens today's and this week's ledgers fresh.
// v16 adds the cleared-cell set (`clearedCells`): every (difficulty x class) cell ever
// cleared, making ladder-class unlocks GLOBAL (a class cleared on any difficulty is
// selectable on all of them) and bounty claims CELL-EXACT (a jumped-over cell's bounty
// stays claimable later instead of being silently voided by the frontier). On load the
// set is seeded from each difficulty's `ladderProgress` frontier (every cell at-or-below
// it, historically exact since the pre-v16 ladder was strictly sequential), which also
// keeps re-clears of pre-v16 conquered cells from farming their bounties (the claim
// guard now tests cell membership, and seeded cells read as cleared).
// v15 adds Championship Bounties (`claimedBounties`): a one-time reward on each (difficulty
// x ladder class) cell, granted the first time that cell is cleared. The field defaults to
// [] on older saves (no value migration). Crucially, crests derive from `ladderProgress`, so
// a veteran retroactively shows every past-clear crest, but `claimedBounties` starts empty so
// no material reward is retro-granted; only genuinely new frontier clears pay a bounty.
// v14 rebalances copies-to-own (B 2->1 so the huge B pool no longer orphans, S 4->6 so the
// tiny S pool stays a chase) and lets a LEGEND you win a run with be kept (the copy deposit
// no longer strips on-loan players). No shape change: on load, deserialize auto-promotes any
// in-progress B (now owned at one copy) and never demotes an already-owned S.
// v13 adds copies-to-own collection gating: `collecting` holds in-progress players
// (copies below the class threshold), and owning a player now takes multiple copies
// (see collection.ts). The field defaults to [] on older saves and, crucially, EVERY
// previously-owned player stays in `players` (already unlocked), so no migration can lock
// a collection a veteran already earned. The scout gacha grants one copy per pull and
// high tiers gate behind ladder progress (player-gacha.machineUnlocked).
// v12 adds the coin-banking ledger (`lastBankedRunId`/`lastBankedCoins`/`settledRunId`)
// for auto-saved runs: coins now bank as-earned and the merge no longer banks them. All
// three are optional and default empty on older saves (no migration needed; a fresh run
// banks normally since its seed matches no prior ledger).
// v11 adds the Coach system (`ownedCoaches`/`selectedCoachId`). On load, owned coaches
// are DERIVED from `ladderProgress` so veteran saves retroactively receive every coach
// their progress has earned; the starter is always granted and the selection defaults to
// the starter when missing/invalid (so coaches need no separate persisted unlock state).
// v10 rebuilt the gacha-ability pool; a pre-v10 save's now-dead ability ids are dropped and
// refunded a coin floor per owned copy on load (see sanitizeAbilities).
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
const HOME_ROSTER_VERSION = 18;

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
    collecting: [],
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
    claimedBounties: [],
    clearedCells: [],
    courtTheme: DEFAULT_COURT_THEME_ID,
    favor: {},
  };
}

/** Select a home-court theme; a no-op unless the theme exists and is unlocked by
 * the cleared-cell set (mirrors selectCoach's owned-only rule). */
export function selectCourtTheme(home: HomeRoster, id: string): HomeRoster {
  const theme = COURT_THEMES.find((t) => t.id === id);
  if (!theme || !courtThemeUnlocked(theme, home.clearedCells ?? [])) return home;
  return { ...home, courtTheme: theme.id };
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

/** An in-progress collection row: the (not-yet-draftable) card plus its copies-collected
 * and the copies its class needs to unlock. Drives the roster browser progress meter. */
export interface CollectingRow {
  player: RosterPlayer;
  copies: number;
  threshold: number;
}

/** The in-progress players (collected but not yet owned), each with its unlock progress. */
export function collectingRosterPlayers(home: HomeRoster): CollectingRow[] {
  return (home.collecting ?? []).map((c) => ({
    player: c.player,
    copies: c.copies,
    threshold: copiesToOwn(playerDraftClass(c.player)),
  }));
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
 * Pull a copy from a scouting machine and fold it into the home collection. A pull grants
 * one copy toward the un-owned player closest to unlocking (see player-gacha.pullPlayer);
 * the copy that reaches the threshold graduates the player into the owned collection
 * (recency-first, like a merge). Copies short of the threshold live in `collecting` as
 * visible progress. Once a tier is fully owned, a pull OVERFLOWS into a coin bounty and
 * adds no player. A locked machine or an unaffordable pull is a no-op: the home roster is
 * returned unchanged, alongside the (unbanked) result so a caller can decide what to show.
 */
export function applyPlayerPull(
  home: HomeRoster,
  tier: PlayerGachaTier,
  rng: RNG
): { home: HomeRoster; result: PlayerPullResult } {
  const unlockedKeys = new Set(home.players.map(playerKey));
  const collectingCopies = collectingCopyMap(home);
  const result = pullPlayer(tier, unlockedKeys, collectingCopies, rng);
  // Locked behind ladder progress, or unaffordable: no-op (guarded here too, not just UI).
  if (!machineUnlocked(tier, home.ladderProgress) || home.coins < result.cost) {
    return { home, result };
  }
  // Charge the pull, then deposit the copy (foldPull credits any overflow bounty).
  return { home: foldPull({ ...home, coins: home.coins - result.cost }, result), result };
}

/**
 * Fold a pull RESULT into the collection: deposit the copy (graduating the player into the
 * owned set when it crosses the threshold) and credit any overflow bounty. Does NOT charge
 * the pull cost (the caller deducts it). Shared by the paid scout pull (applyPlayerPull) and
 * free grants (claimRunBounty), so both move a copy the exact same way.
 */
function foldPull(home: HomeRoster, result: PlayerPullResult): HomeRoster {
  const coins = home.coins + result.overflowCoins;
  if (result.isOverflow) return { ...home, coins }; // whole tier owned: overflow bounty only
  if (result.unlockedNow) {
    // Graduate into the owned collection (front = recency); drop the in-progress entry.
    const collecting = home.collecting.filter((c) => playerKey(c.player) !== result.targetKey);
    // The chase completed at the machine: banked favor pays out as coins and the
    // entry drops, so a meter the player was told to fill never evaporates.
    const banked = home.favor?.[result.targetKey] ?? 0;
    let favor = home.favor ?? {};
    if (banked > 0) {
      favor = { ...favor };
      delete favor[result.targetKey];
    }
    return {
      ...home,
      coins: coins + banked * FAVOR_RESIDUAL_COIN_RATE,
      players: [result.player, ...home.players],
      collecting,
      favor,
    };
  }
  // Still collecting: upsert the in-progress entry with the new copy count.
  const collecting = upsertCollecting(home.collecting, result.player, result.newCopies);
  return { ...home, coins, collecting };
}

/** A map of every in-progress player's key to its collected copies (for pull selection
 * and the Arcade's "closest to unlock" readout). */
export function collectingCopyMap(home: HomeRoster): Record<string, number> {
  const map: Record<string, number> = {};
  for (const c of home.collecting ?? []) map[playerKey(c.player)] = c.copies;
  return map;
}

/** Set an in-progress player's copy count (replacing any prior entry, else prepending). */
function upsertCollecting(
  collecting: CollectingPlayer[],
  player: RosterPlayer,
  copies: number
): CollectingPlayer[] {
  const key = playerKey(player);
  const idx = collecting.findIndex((c) => playerKey(c.player) === key);
  if (idx < 0) return [{ player, copies }, ...collecting];
  return collecting.map((c, i) => (i === idx ? { player, copies } : c));
}

/** One in-progress player's copy movement this run, for the end-of-run collection strip. */
export interface ProgressedCopy {
  player: RosterPlayer;
  before: number;
  after: number;
  threshold: number;
}

/** What a cleared run does to the collection: which players it UNLOCKED (crossed the class
 * threshold to own) and which it only PROGRESSED (gained a copy, still short). Drives the
 * "player scouted" reveal and the win-screen progress strip. */
export interface AcquisitionDelta {
  unlocked: RosterPlayer[];
  progressed: ProgressedCopy[];
}

/**
 * The candidate recruits a run could bring home: fielded players (a won on-loan legend
 * included) not already owned, with run-scoped state stripped, de-duped by key. Which of
 * them actually deposit is the settle's call: all of them on a championship, the single
 * best non-legend on a milestone-banked loss, nothing otherwise (see settleDeposits).
 */
function runRecruitCandidates(home: HomeRoster, runRoster: Roster): RosterPlayer[] {
  const ownedKeys = new Set(home.players.map(playerKey));
  const seen = new Set<string>();
  const out: RosterPlayer[] = [];
  for (const p of [...runRoster.starters, ...runRoster.bench]) {
    const key = playerKey(p);
    if (ownedKeys.has(key) || seen.has(key)) continue; // already owned, or offered twice
    seen.add(key);
    const copy = { ...p };
    delete copy.item; // run-scoped
    delete copy.trainingDelta; // run-scoped
    delete copy.gamesOut; // injuries heal at run end
    delete copy.equippedAbility; // the home equippedAbilities map is the source of truth
    delete copy.onLoan; // a kept legend becomes owned (drops the on-loan team chemistry)
    out.push(copy);
  }
  return out;
}

/** Whether a recruit is a legend for deposit purposes. Legends own at ONE copy, so they
 * are exempt from the copies multiplier (nothing to multiply) and barred from milestone
 * banking (a loss must never hand out a full legend). */
function isLegendRecruit(rp: RosterPlayer): boolean {
  return (rp.legendary ?? false) || playerDraftClass(rp) === 'S+';
}

/** Whether a recruit's class sits strictly ABOVE the run's ladder class (a "reach-up"
 * signing). Reach-ups deposit a fixed single copy on a clear (never the difficulty
 * multiplier) and never milestone-bank, so below-ladder content can taste the class
 * above without completing its chase. No ladder class = no cap (defensive default). */
function isReachUpRecruit(rp: RosterPlayer, ladderClass?: LadderClass): boolean {
  if (!ladderClass) return false;
  return CLASS_ORDER.indexOf(playerDraftClass(rp)) > CLASS_ORDER.indexOf(ladderClass);
}

/** The single best milestone-bankable recruit (highest class, then raw OVR), as a
 * deposit list. Legends are excluded: an on-loan legend owns at one copy, so banking it
 * from a loss would bypass the clear requirement entirely. Reach-ups are excluded too:
 * with their clear deposit capped at one copy, banking the same copy from a loss after
 * four boss wins would make dying the fastest above-class farm (clearing must strictly
 * dominate every other channel to the same reward). */
function bestBankableRecruit(
  candidates: RosterPlayer[],
  ladderClass?: LadderClass
): RosterPlayer[] {
  const rank = (rp: RosterPlayer) => CLASS_ORDER.indexOf(playerDraftClass(rp));
  const best = candidates
    .filter((rp) => !isLegendRecruit(rp) && !isReachUpRecruit(rp, ladderClass))
    .sort(
      (a, b) =>
        rank(b) - rank(a) ||
        ovrRaw(b.player.stats, b.position) - ovrRaw(a.player.stats, a.position)
    )[0];
  return best ? [best] : [];
}

/**
 * Deposit copies per new recruit into `collecting`, returning the updated list plus the
 * acquisition delta (which recruits crossed the threshold to UNLOCK, and which only
 * PROGRESSED). `copiesMul` is the difficulty's championship multiplier, capped per
 * recruit at exactly the copies still needed (a deposit tops a player up, it never
 * mints overflow coins), exempt for legends (always one copy), and capped at
 * REACH_UP_DEPOSIT_COPIES for recruits above the run's `ladderClass` (below-ladder
 * content never completes an above-class chase in one clear). Pure; the single
 * source of truth for both the merge and the reveal preview.
 */
function depositRecruitCopies(
  collecting: CollectingPlayer[],
  recruits: RosterPlayer[],
  copiesMul = 1,
  ladderClass?: LadderClass
): { collecting: CollectingPlayer[] } & AcquisitionDelta {
  let next = collecting;
  const unlocked: RosterPlayer[] = [];
  const progressed: ProgressedCopy[] = [];
  for (const rp of recruits) {
    const key = playerKey(rp);
    const threshold = copiesToOwn(playerDraftClass(rp));
    const before = next.find((c) => playerKey(c.player) === key)?.copies ?? 0;
    const mul = isReachUpRecruit(rp, ladderClass)
      ? Math.min(copiesMul, REACH_UP_DEPOSIT_COPIES)
      : copiesMul;
    const copies = isLegendRecruit(rp)
      ? 1
      : Math.max(1, Math.min(mul, threshold - before));
    const after = before + copies;
    if (after >= threshold) {
      unlocked.push(rp);
      next = next.filter((c) => playerKey(c.player) !== key);
    } else {
      next = upsertCollecting(next, rp, after);
      progressed.push({ player: rp, before, after, threshold });
    }
  }
  return { collecting: next, unlocked, progressed };
}

/** Terminal-settle inputs shared by the merge and its preview. */
export interface RunSettle {
  rewards?: RunRewards;
  /** Whether a legendary was offered this run (resets the soft-pity streak). */
  legendOffered?: boolean;
  champion?: boolean;
  /** The ladder class a championship cleared (advances the ladder + stamps the cell). */
  clearedClass?: LadderClass;
  /** The difficulty the run was actually PLAYED on (model.difficulty), which can differ
   * from home.selectedDifficulty if the menu selection changed. Drives the ladder write,
   * the copies multiplier, and milestone banking. Defaults to the current selection. */
  playedDifficulty?: Difficulty;
  /** A pre-built Hall of Fame entry for a championship (the hook builds it, since it
   * needs Date.now()). Prepended to the trophy case only on a win; ignored otherwise. */
  championEntry?: HallOfFameEntry;
  /** Bosses beaten this run (core.currentMapIndex at the summary). On a hard/insane
   * loss at or past the difficulty's milestone, the best non-legend recruit still
   * deposits one copy ("he stays in touch"). */
  bossWins?: number;
  /** The ladder class the run was PLAYED on (model.ladderClass). Drives the reach-up
   * deposit cap, the milestone-bank filter, and the favor reach-up damp; absent
   * (legacy callers) = uncapped. */
  ladderClass?: LadderClass;
  /** Base favor points this run's wins accrued per fielded playerKey (model.favor).
   * The settle banks them for the still-un-owned who finished the run on the squad,
   * scaled by the difficulty's favorMul, WIN OR LOSE. */
  runFavor?: Record<string, number>;
}

/** One player's favor movement at a settle, for the run-summary favor strip. */
export interface FavorDelta {
  player: RosterPlayer;
  /** Banked ledger points before the settle and after (post-conversion remainder). */
  before: number;
  after: number;
  /** Points this run earned (after the difficulty multiplier and any reach-up damp). */
  earned: number;
  /** Whole collection copies the conversion granted (capped at the copies needed). */
  copiesGranted: number;
  /** Whether the favor conversion itself crossed the ownership threshold. */
  unlockedNow: boolean;
  /** Coins paid out for residual favor once the chase completed. */
  residualCoins: number;
}

/** The recruit deposits a settle performs: every candidate x the difficulty's copies
 * multiplier on a championship; the single best non-legend x1 on a milestone-banked
 * loss; nothing otherwise. ONE chooser for the merge and the preview, so the reveal can
 * never disagree with what actually banks. */
function settleDeposits(
  home: HomeRoster,
  runRoster: Roster,
  settle: RunSettle
): { collecting: CollectingPlayer[] } & AcquisitionDelta {
  const { champion = false, bossWins = 0, ladderClass } = settle;
  const mods = difficultyMods(settle.playedDifficulty ?? home.selectedDifficulty);
  const candidates = runRecruitCandidates(home, runRoster);
  if (champion) {
    return depositRecruitCopies(home.collecting ?? [], candidates, mods.copiesMul, ladderClass);
  }
  const milestone = mods.milestoneBossWins != null && bossWins >= mods.milestoneBossWins;
  return depositRecruitCopies(
    home.collecting ?? [],
    milestone ? bestBankableRecruit(candidates, ladderClass) : []
  );
}

/** The full collection movement of one settle (deposits + favor), shared by the merge
 * and the preview so the reveal can never disagree with what actually banks. */
interface CollectionSettle extends AcquisitionDelta {
  collecting: CollectingPlayer[];
  favor: Record<string, number>;
  favorDelta: FavorDelta[];
  /** Coins paid for residual favor on chases the settle completed. */
  favorCoins: number;
}

/**
 * Deposits first, then the FAVOR pass against the post-deposit owned set (the
 * anti-double-count rule: a recruit the clear just signed keeps no favor; their banked
 * points pay out as coins instead). Favor banks on EVERY terminal settle, champion or
 * not: points this run's wins earned join the home ledger for the still-un-owned who
 * finished the run on the squad (cutting a player mid-run forfeits their favor),
 * convert to whole copies at the class threshold through the same deposit function
 * (identical unlock semantics), and the remainder stays visible on the meter.
 */
function settleCollection(
  home: HomeRoster,
  runRoster: Roster,
  settle: RunSettle
): CollectionSettle {
  const mods = difficultyMods(settle.playedDifficulty ?? home.selectedDifficulty);
  const deposits = settleDeposits(home, runRoster, settle);
  const unlocked = [...deposits.unlocked];
  let progressed = [...deposits.progressed];
  let collecting = deposits.collecting;
  const favor: Record<string, number> = { ...home.favor };
  const favorDelta: FavorDelta[] = [];
  let favorCoins = 0;
  const ownedAfter = new Set([...home.players.map(playerKey), ...unlocked.map(playerKey)]);
  const candidates = new Map(
    runRecruitCandidates(home, runRoster).map((p) => [playerKey(p), p] as const)
  );

  // Chases the deposits just completed: banked favor converts to coins and drops.
  for (const rp of deposits.unlocked) {
    const key = playerKey(rp);
    const banked = favor[key] ?? 0;
    if (banked <= 0) continue;
    delete favor[key];
    const residualCoins = banked * FAVOR_RESIDUAL_COIN_RATE;
    favorCoins += residualCoins;
    favorDelta.push({
      player: rp, before: banked, after: 0, earned: 0,
      copiesGranted: 0, unlockedNow: false, residualCoins,
    });
  }

  // The favor pass: bank, convert, and (rarely) unlock.
  for (const [key, base] of Object.entries(settle.runFavor ?? {})) {
    const candidate = candidates.get(key);
    if (!candidate || ownedAfter.has(key)) continue; // owned, just signed, or cut mid-run
    const earned = settleFavorEarned(
      base,
      mods.favorMul,
      isReachUpRecruit(candidate, settle.ladderClass)
    );
    if (earned <= 0) continue;
    const before = favor[key] ?? 0;
    const total = before + earned;
    const cls = playerDraftClass(candidate);
    const wholeCopies = favorToCopies(total, cls).copies;
    if (wholeCopies <= 0) {
      favor[key] = total;
      favorDelta.push({
        player: candidate, before, after: total, earned,
        copiesGranted: 0, unlockedNow: false, residualCoins: 0,
      });
      continue;
    }
    // Whole copies convert through the shared deposit function (copiesMul = the
    // grant, capped at need inside), so unlock semantics are byte-identical.
    const threshold = copiesToOwn(cls);
    const copiesBefore = collecting.find((c) => playerKey(c.player) === key)?.copies ?? 0;
    const granted = Math.min(wholeCopies, threshold - copiesBefore);
    const grant = depositRecruitCopies(collecting, [candidate], granted);
    collecting = grant.collecting;
    progressed.push(...grant.progressed);
    const unlockedNow = grant.unlocked.length > 0;
    const leftover = total - granted * (FAVOR_PER_COPY[cls] ?? 0);
    let after = leftover;
    let residualCoins = 0;
    if (unlockedNow) {
      unlocked.push(...grant.unlocked);
      ownedAfter.add(key);
      residualCoins = leftover * FAVOR_RESIDUAL_COIN_RATE;
      favorCoins += residualCoins;
      after = 0;
      delete favor[key];
    } else {
      favor[key] = after;
    }
    favorDelta.push({
      player: candidate, before, after, earned,
      copiesGranted: granted, unlockedNow, residualCoins,
    });
  }

  // Coalesce progress rows (a champion deposit + a favor conversion touch the same
  // player twice): keep the earliest `before` and the latest `after`, and drop rows
  // for players the settle ended up unlocking.
  const unlockedKeys = new Set(unlocked.map(playerKey));
  const byKey = new Map<string, ProgressedCopy>();
  for (const row of progressed) {
    const key = playerKey(row.player);
    const prior = byKey.get(key);
    byKey.set(key, prior ? { ...row, before: prior.before } : row);
  }
  progressed = [...byKey.values()].filter((row) => !unlockedKeys.has(playerKey(row.player)));

  return { collecting, unlocked, progressed, favor, favorDelta, favorCoins };
}

/**
 * The players a run's settle would UNLOCK vs PROGRESS, for the end-of-run reveal + strip
 * (including a milestone-banked loss), plus the favor movement for the favor strip.
 * Pure and read-only (does not mutate the home roster). Mirrors settleCollection
 * exactly (same chooser), so the reveal always matches what actually banks.
 */
export function previewRunAcquisitions(
  home: HomeRoster,
  runRoster: Roster,
  settle: RunSettle
): AcquisitionDelta & { favorDelta: FavorDelta[]; favorCoins: number } {
  const { unlocked, progressed, favorDelta, favorCoins } = settleCollection(home, runRoster, settle);
  return { unlocked, progressed, favorDelta, favorCoins };
}

/**
 * Fold a finished run's gains back into the home collection. The persistent collection
 * is preserved; the settle decides which NEW recruits deposit copies (all of them, at
 * the difficulty's multiplier, on a championship; the best non-legend on a milestone-
 * banked hard/insane loss), unlocking a player into the collection when its class
 * threshold is met (else advancing `collecting`). Rewards bank. On a championship the
 * cleared CELL is stamped, the played difficulty's ladder advances, and the next class
 * auto-selects. The legendary pity streak advances unless a legendary was offered.
 */
export function mergeRunGainsIntoHome(
  home: HomeRoster,
  runRoster: Roster,
  settle: RunSettle = {}
): HomeRoster {
  const {
    rewards,
    legendOffered = false,
    champion = false,
    clearedClass,
    playedDifficulty = home.selectedDifficulty,
    championEntry,
  } = settle;
  // Owned players fielded this run drive the recency reorder below. On-loan players (a
  // scouted legend) are never in the owned collection, so they are excluded from this list.
  const fielded = [...runRoster.starters, ...runRoster.bench].filter((p) => !p.onLoan);
  const ownedKeys = new Set(home.players.map(playerKey));

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

  // The settle's collection movement: recruit deposits (crossing the class threshold
  // unlocks the player into the collection now, front = recency; the rest advance
  // their in-progress copy count in `collecting`), then the favor pass (banked win or
  // lose, converting to copies and occasionally unlocking). An ordinary loss deposits
  // nothing, but its wins' favor still banks.
  const {
    collecting,
    unlocked: unlockedRecruits,
    favor,
    favorCoins,
  } = settleCollection(home, runRoster, settle);
  const players = [...fieldedOwned, ...unlockedRecruits, ...restOwned];

  // The draft rotation to restore next run is captured at draft-confirm time into
  // `rosterMemory` (per difficulty x ladder class); `...home` below preserves it.

  const ladderProgress = { ...home.ladderProgress };
  let selectedLadderClass = home.selectedLadderClass;
  let ownedCoaches = home.ownedCoaches;
  let clearedCells = home.clearedCells ?? [];
  if (champion && clearedClass) {
    // Stamp the cleared CELL (crests, bounty guards, theme unlocks, and global
    // class unlocks all derive from the cell set).
    const cell = cellKey(playedDifficulty, clearedClass);
    if (!clearedCells.includes(cell)) clearedCells = [...clearedCells, cell];
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
    collecting,
    favor,
    // Win coins are NOT banked here: they bank into the wallet as each game is won
    // (the as-earned ledger in useRun), so `...home` already holds them. Residual
    // favor coins (a chase this settle completed) and reputation are terminal
    // rewards, banked here and forfeited if the run is abandoned.
    coins: home.coins + favorCoins,
    reputation: home.reputation + (rewards?.reputation ?? 0),
    ladderProgress,
    clearedCells,
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

/** What a claimed Championship Bounty granted, for the run-summary reveal. */
export interface BountyGrant {
  key: string;
  bounty: Bounty;
  /** The apex insane:S+ Grandmaster cell (the reveal treats it as the loudest beat). */
  isCapstone: boolean;
  /** Coins added (a coin bounty, the capstone bundle, or a player-grant overflow refund). */
  coins?: number;
  /** A granted player (a guaranteed scout), and whether it UNLOCKED vs only progressed. */
  player?: RosterPlayer;
  playerUnlocked?: boolean;
  /** A granted passive-ability id. */
  abilityId?: string;
}

/**
 * Grant a run's Championship Bounty on a championship, ONCE per cell, reusing the scout fold
 * (foldPull) for player grants and addAbility for ability grants. Returns the updated home
 * plus a grant descriptor for the reveal, or `{ granted: null }` when nothing is owed.
 *
 * The "first clear" test is CELL-EXACT: the cell must not already be in `clearedCells`
 * (nor `claimedBounties`). Cross-difficulty jumps can leave lower cells uncleared, and
 * those cells' bounties stay claimable later (all 20 are collectible goals; the total is
 * fixed, so there is no farm). Pre-v16 veterans never re-farm conquered cells because the
 * load migration seeds `clearedCells` from each frontier. Call against the PRE-merge home
 * (clearedCells not yet stamped), inside the settle write.
 */
export function claimRunBounty(
  home: HomeRoster,
  difficulty: Difficulty,
  ladderClass: LadderClass,
  champion: boolean,
  rng: RNG
): { home: HomeRoster; granted: BountyGrant | null } {
  if (!champion) return { home, granted: null };
  const key = bountyKey(difficulty, ladderClass);
  if (home.claimedBounties.includes(key)) return { home, granted: null };
  // First clear only, cell-exact: a replay of an already-cleared cell never farms
  // material, while a jumped-over cell (cleared above it, never on it) still pays.
  if ((home.clearedCells ?? []).includes(key)) return { home, granted: null };

  const bounty = bountyFor(difficulty, ladderClass);
  const grant: BountyGrant = { key, bounty, isCapstone: key === GRANDMASTER_KEY };
  let next: HomeRoster = { ...home, claimedBounties: [...home.claimedBounties, key] };
  const reward = bounty.reward;
  switch (reward.kind) {
    case 'coins':
      next = { ...next, coins: next.coins + reward.amount };
      grant.coins = reward.amount;
      break;
    case 'crest':
      if (reward.coins) {
        next = { ...next, coins: next.coins + reward.coins };
        grant.coins = reward.coins;
      }
      break;
    case 'ability': {
      const id = pickAbilityOfRarity(reward.rarity, rng);
      next = addAbility(next, id);
      grant.abilityId = id;
      break;
    }
    case 'player': {
      // A free guaranteed scout: fold a copy in exactly like a paid pull, no cost and no
      // machine gate (the clear IS the unlock). A fully-owned tier converts to overflow coins.
      const result = pullPlayer(
        reward.tier,
        new Set(next.players.map(playerKey)),
        collectingCopyMap(next),
        rng
      );
      next = foldPull(next, result);
      grant.player = result.player;
      grant.playerUnlocked = result.unlockedNow;
      if (result.overflowCoins > 0) grant.coins = result.overflowCoins;
      break;
    }
  }
  return { home: next, granted: grant };
}

/** Inputs for the Daily Layer settle; the hook owns the clock and passes keys. */
export interface DailySettleInput {
  /** The cell the run was played on (model.difficulty / model.ladderClass). */
  runCell: DailyCell;
  /** Local dayKey / weekKey at settle time. */
  today: string;
  week: string;
  champion: boolean;
  /** Game wins this run (model.wins); a lost run's wins still feed the weekly ledger. */
  wins: number;
  /** Seeded off the run (deriveSeed(seed, 'daily')), so a crash-resumed settle
   * reproduces byte-identical grants. */
  rng: RNG;
}

/** What the Daily Layer paid this settle, for the summary strip and hub meter. */
export interface DailyGrants {
  /** The Spotlight bounty: today's featured cell, won. */
  spotlight?: { cell: DailyCell; coins: number };
  /** First championship of the day: purse + the free scout pull's outcome. */
  firstWin?: { coins: number; player: RosterPlayer; overflowCoins: number };
  /** Weekly tiers crossed by this settle, in ascending order. */
  weeklyTiers: { tier: number; wins: number; coins: number; abilityId?: string }[];
  /** The post-settle weekly counters. */
  weekly: { week: string; gameWins: number };
}

/**
 * The Daily Layer settle: bank this run's wins into the weekly ledger (losses
 * included), auto-grant any weekly tiers crossed, then the champion-gated pieces:
 * the first-win-of-the-day purse + free scout pull, and the Spotlight bounty when
 * the run's cell is today's featured cell. Pure and deterministic from (home,
 * input): the hook's settledRunId guard runs it at most once per run, the per-day
 * stamps and week-keyed claimedTiers make a re-execution against an already-written
 * home a no-op, and the derived rng label reproduces identical grants if a crash
 * forces the settle to re-run before the write landed. Call against the PRE-merge
 * home (its clearedCells are what the player's spotlight was derived from), inside
 * the settle write. Every transition here is grant-or-noop: a missed day or a
 * clock change can never take anything away.
 */
export function settleDailyRewards(
  home: HomeRoster,
  input: DailySettleInput
): { home: HomeRoster; granted: DailyGrants } {
  const { runCell, today, week, champion, wins, rng } = input;
  let next = home;
  let coins = 0;

  // Weekly ledger: roll on a week change (weeklyProgress zeroes a stale ledger),
  // bank this run's wins, then pay any tier the new total crosses exactly once.
  const prior = weeklyProgress(home.weekly, week);
  const gameWins = prior.gameWins + Math.max(0, wins);
  const claimedTiers = [...prior.claimedTiers];
  const weeklyTiers: DailyGrants['weeklyTiers'] = [];
  WEEKLY_TIERS.forEach((tier, i) => {
    if (claimedTiers.includes(i) || gameWins < tier.wins) return;
    claimedTiers.push(i);
    coins += tier.coins;
    let abilityId: string | undefined;
    if (tier.abilityRarity) {
      abilityId = pickAbilityOfRarity(tier.abilityRarity, rng);
      next = addAbility(next, abilityId);
    }
    weeklyTiers.push({ tier: i, wins: tier.wins, coins: tier.coins, abilityId });
  });
  next = { ...next, weekly: { week, gameWins, claimedTiers } };
  const granted: DailyGrants = { weeklyTiers, weekly: { week, gameWins } };

  // First win of the day: a purse plus one free scout pull, folded exactly like a
  // paid pull (overflow self-converts to coins for a completed tier).
  if (champion && next.daily?.firstWinClaimedDay !== today) {
    const result = pullPlayer(
      FIRST_WIN_SCOUT_TIER,
      new Set(next.players.map(playerKey)),
      collectingCopyMap(next),
      rng
    );
    next = foldPull(next, result);
    coins += FIRST_WIN_COINS;
    next = { ...next, daily: { ...next.daily, firstWinClaimedDay: today } };
    granted.firstWin = {
      coins: FIRST_WIN_COINS,
      player: result.player,
      overflowCoins: result.overflowCoins,
    };
  }

  // Spotlight bounty: the run's cell must BE today's featured cell (derived from
  // the pre-merge cleared set, i.e. what the hub showed when the run started).
  const spot = spotlightCell(today, home.clearedCells ?? []);
  if (
    champion &&
    next.daily?.spotlightClaimedDay !== today &&
    spot.difficulty === runCell.difficulty &&
    spot.ladderClass === runCell.ladderClass
  ) {
    const amount = DAILY_BOUNTY_COINS[spot.difficulty];
    coins += amount;
    next = { ...next, daily: { ...next.daily, spotlightClaimedDay: today } };
    granted.spotlight = { cell: spot, coins: amount };
  }

  if (coins > 0) next = { ...next, coins: next.coins + coins };
  return { home: next, granted };
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
  const migratePlayer = (p: RosterPlayer): RosterPlayer => {
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
  };
  const players = data.players.map(migratePlayer);

  // v13: in-progress collection entries. Validate + migrate each player like the owned
  // set; an entry whose copies now meet its class threshold (or whose player is already
  // owned) graduates into `players`, so nothing sticks below an updated bar. Pre-v13 saves
  // have no `collecting` field and default to empty (every player they own is already in
  // `players`, so nothing is lost).
  const ownedNow = new Set(players.map(playerKey));
  const collecting: CollectingPlayer[] = [];
  const rawCollecting = Array.isArray(data.collecting) ? data.collecting : [];
  for (const entry of rawCollecting) {
    const rp = (entry as Partial<CollectingPlayer> | undefined)?.player;
    const stats = rp?.player?.stats as unknown as Record<string, unknown> | undefined;
    const validPlayer =
      !!stats &&
      typeof rp?.player?.name === 'string' &&
      typeof rp?.position === 'string' &&
      (typeof stats.outside === 'number' || isLegacyStats(stats));
    if (!validPlayer) continue;
    const migrated = migratePlayer(rp as RosterPlayer);
    const key = playerKey(migrated);
    if (ownedNow.has(key)) continue; // already owned: drop the stale in-progress entry
    const rawCopies = (entry as Partial<CollectingPlayer>).copies;
    const copies = Math.max(1, Math.floor(typeof rawCopies === 'number' ? rawCopies : 1));
    const cls = playerDraftClass(migrated);
    if (copies >= copiesToOwn(cls)) {
      players.push(migrated); // meets the bar: promote to owned
      ownedNow.add(key);
    } else {
      collecting.push({ player: migrated, copies });
    }
  }

  const ladderProgress = emptyLadderProgress();
  const savedProgress = (data.ladderProgress ?? {}) as Record<string, unknown>;
  for (const d of DIFFICULTIES) {
    const v = savedProgress[d];
    if (typeof v === 'string' && isLadderClass(v as PlayerClass)) {
      ladderProgress[d] = v as LadderClass;
    }
  }

  // v16: the cleared-cell set. Keep any well-formed saved cells (validated against the
  // 20-cell bounty catalog, which shares the key format), then seed from each
  // difficulty's frontier: every cell at-or-below it is cleared. Historically exact for
  // pre-v16 saves (the old ladder was strictly sequential), and load-bearing for the
  // bounty guard: seeded cells read as cleared, so re-clearing a pre-v16 conquered cell
  // can never farm its bounty. Self-heal the frontier upward from the cells afterward,
  // so the two representations can never disagree in the frontier's disfavor.
  const cellSet = new Set<string>();
  if (Array.isArray(data.clearedCells)) {
    for (const k of data.clearedCells) {
      if (typeof k === 'string' && k in BOUNTIES) cellSet.add(k);
    }
  }
  for (const d of DIFFICULTIES) {
    const frontier = ladderProgress[d];
    if (!frontier) continue;
    for (const cls of LADDER_CLASSES) {
      cellSet.add(cellKey(d, cls));
      if (cls === frontier) break;
    }
  }
  const clearedCells = [...cellSet];
  for (const d of DIFFICULTIES) {
    const fromCells = frontierFromCells(clearedCells, d);
    const saved = ladderProgress[d];
    if (
      fromCells &&
      (saved == null || LADDER_CLASSES.indexOf(fromCells) > LADDER_CLASSES.indexOf(saved))
    ) {
      ladderProgress[d] = fromCells;
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

  // v18: the favor ledger. Owned players' entries are dropped (their chase is
  // complete) and garbage degrades to an empty ledger. On the one-time bump from an
  // older save, every in-progress A-class entry receives a half-copy of goodwill
  // favor, offsetting the A threshold moving 3 -> 4 in the same version: a veteran's
  // meter visibly moves forward on update day, never back.
  const favor = sanitizeFavor(data.favor, ownedNow);
  if (version < 18) {
    for (const c of collecting) {
      if (playerDraftClass(c.player) !== 'A') continue;
      const key = playerKey(c.player);
      favor[key] = (favor[key] ?? 0) + Math.round(FAVOR_PER_COPY.A / 2);
    }
  }

  return {
    players,
    collecting,
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
    lastBankedRunId: typeof data.lastBankedRunId === 'string' ? data.lastBankedRunId : undefined,
    lastBankedCoins: typeof data.lastBankedCoins === 'number' ? data.lastBankedCoins : undefined,
    settledRunId: typeof data.settledRunId === 'string' ? data.settledRunId : undefined,
    // v15: default to [] on older saves (no material retro-grant; the seeded cleared
    // cells block re-farming). Filter against the catalog so stale keys never linger.
    claimedBounties: Array.isArray(data.claimedBounties)
      ? data.claimedBounties.filter((k): k is string => typeof k === 'string' && k in BOUNTIES)
      : [],
    clearedCells,
    // Self-heal the theme selection: unknown ids and no-longer-unlocked themes (a
    // reset save restored over old settings) fall back to the classic court.
    courtTheme: (() => {
      const saved = COURT_THEMES.find((t) => t.id === data.courtTheme);
      return saved && courtThemeUnlocked(saved, clearedCells) ? saved.id : DEFAULT_COURT_THEME_ID;
    })(),
    // v17: Daily Layer ledgers. Garbage degrades to undefined = "nothing claimed",
    // the safe default (a bad stamp can only re-open a day, never void a grant).
    daily: sanitizeDaily(data.daily),
    weekly: sanitizeWeekly(data.weekly),
    favor,
    scoutTargets: sanitizeScoutTargets(data.scoutTargets, ownedNow),
  };
}

/** Keep only well-formed, positive favor entries for un-owned players; garbage
 * degrades to an empty ledger (favor is grant-or-noop, never destructive). */
function sanitizeFavor(raw: unknown, owned: ReadonlySet<string>): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const points = Math.floor(value);
    if (points <= 0 || owned.has(key)) continue;
    out[key] = points;
  }
  return out;
}

/** Keep pins that name a real, un-owned player in their machine's pool; anything
 * else silently unpins (the machine falls back to the closest-to-unlock rule). */
function sanitizeScoutTargets(
  raw: unknown,
  owned: ReadonlySet<string>
): HomeRoster['scoutTargets'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: NonNullable<HomeRoster['scoutTargets']> = {};
  let any = false;
  for (const tier of PLAYER_GACHA_TIERS) {
    const key = (raw as Record<string, unknown>)[tier];
    if (typeof key !== 'string' || owned.has(key)) continue;
    if (!tierPool(tier).some((p) => nameKey(p.name, p.position) === key)) continue;
    out[tier] = key;
    any = true;
  }
  return any ? out : undefined;
}

/** Keep only well-formed day stamps; undefined when nothing valid remains. */
function sanitizeDaily(raw: unknown): HomeRoster['daily'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const { spotlightClaimedDay, firstWinClaimedDay } = raw as Record<string, unknown>;
  const daily: NonNullable<HomeRoster['daily']> = {};
  if (typeof spotlightClaimedDay === 'string') daily.spotlightClaimedDay = spotlightClaimedDay;
  if (typeof firstWinClaimedDay === 'string') daily.firstWinClaimedDay = firstWinClaimedDay;
  return Object.keys(daily).length ? daily : undefined;
}

/** A valid weekly ledger needs its week key; counters clamp to sane ints and
 * claimed tiers to known indexes. Malformed input drops the whole ledger. */
function sanitizeWeekly(raw: unknown): WeeklyLedger | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const { week, gameWins, claimedTiers } = raw as Record<string, unknown>;
  if (typeof week !== 'string') return undefined;
  const wins = typeof gameWins === 'number' && Number.isFinite(gameWins)
    ? Math.max(0, Math.floor(gameWins))
    : 0;
  const tiers = Array.isArray(claimedTiers)
    ? [...new Set(claimedTiers.filter(
        (t): t is number => typeof t === 'number' && Number.isInteger(t) && t >= 0 && t < WEEKLY_TIERS.length
      ))]
    : [];
  return { week, gameWins: wins, claimedTiers: tiers };
}
