import { createRNG } from './rng';
import {
  DIFFICULTIES,
  globalHighestCleared,
  isCellCleared,
  LADDER_CLASSES,
  unlockedClassesFromCells,
  type Difficulty,
  type LadderClass,
} from './difficulty-mode';
import type { PlayerGachaTier } from './player-gacha';
import type { Rarity } from './rarity';

/**
 * The Daily Layer: a once-a-day Spotlight bounty, a first-win-of-the-day bonus,
 * and weekly win goals. Everything here is the HONEST version of a daily system:
 * win-gated (never login-gated), no streaks, no sub-daily timers, and nothing a
 * missed day can take away. Grants are applied by home-roster.settleDailyRewards
 * inside the run-settle write; this module is the pure calendar + rotation math.
 *
 * Clock discipline: no Date.now() here. Timestamps arrive as arguments from the
 * hook layer (the hall-of-fame precedent), and every persisted guard compares
 * date STRINGS with equality only, so a changed device clock can re-open a day
 * for a solitaire cheater but can never void anything already banked.
 */

/** Local-time day key (YYYY-MM-DD). The boundary is the player's own midnight,
 * per the design doc's "resets at midnight local time". */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The dayKey of the local MONDAY of ts's week (the weekly ledger's key). Pivots
 * to noon before the calendar-field walk so a DST shift can never move the day. */
export function weekKey(ts: number): string {
  const d = new Date(ts);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dayKey(d.getTime());
}

/** One cell of the (difficulty x ladder class) grid. */
export interface DailyCell {
  difficulty: Difficulty;
  ladderClass: LadderClass;
}

/** Whether any cell has been cleared on a difficulty (progress-tier detection). */
function clearedAnyOn(cells: readonly string[], d: Difficulty): boolean {
  return LADDER_CLASSES.some((cls) => isCellCleared(cells, d, cls));
}

/**
 * Difficulty weights for the spotlight roll, by how far the player has come:
 * rookies see mostly-winnable days with the occasional free swing at the wall;
 * veterans who have proven themselves on hard/insane get hard as the star
 * (~60% of days land hard or insane, advertising the grid's rational farm).
 */
function difficultyWeights(cells: readonly string[]): Record<Difficulty, number> {
  if (cells.length === 0) return { easy: 3, medium: 2, hard: 1, insane: 1 };
  if (clearedAnyOn(cells, 'hard') || clearedAnyOn(cells, 'insane')) {
    return { easy: 1, medium: 2, hard: 3, insane: 2 };
  }
  return { easy: 1, medium: 2, hard: 2, insane: 1 };
}

/** Class weights over the unlocked classes: the proven class (global max cleared)
 * carries the most days, the frontier is the aspirational day, everything below
 * fills in variety. */
function classWeight(cls: LadderClass, best: LadderClass | null): number {
  if (best == null) return 2; // nothing cleared: only the frontier (C) exists
  if (cls === best) return 3;
  const bestIdx = LADDER_CLASSES.indexOf(best);
  const idx = LADDER_CLASSES.indexOf(cls);
  return idx === bestIdx + 1 ? 2 : 1;
}

/**
 * Today's Spotlight cell: one deterministic weighted pick over the cells the
 * player can actually SELECT (every difficulty x the globally unlocked classes),
 * seeded by the day. Per-player by design: with no server or leaderboard there is
 * no value in global sameness, and a global rotation would land on locked cells
 * for novices. Clearing a new class mid-day can shift a not-yet-started spotlight
 * (the eligible set grew); accepted, since the settle guard evaluates against the
 * same pre-merge cells the player saw when starting the run.
 */
export function spotlightCell(day: string, clearedCells: readonly string[]): DailyCell {
  const rng = createRNG(`spotlight-${day}`);
  const diffW = difficultyWeights(clearedCells);
  const best = globalHighestCleared(clearedCells);
  const options: (readonly [DailyCell, number])[] = [];
  for (const difficulty of DIFFICULTIES) {
    for (const ladderClass of unlockedClassesFromCells(clearedCells)) {
      options.push([
        { difficulty, ladderClass },
        diffW[difficulty] * classWeight(ladderClass, best),
      ]);
    }
  }
  return rng.weightedPick(options);
}

/** The Spotlight bounty, by the spotlight cell's difficulty: ~16-22% of that
 * clear's income, so a claimed day is meaningful and a missed day is a shrug. */
export const DAILY_BOUNTY_COINS: Record<Difficulty, number> = {
  easy: 150,
  medium: 250,
  hard: 400,
  insane: 600,
};

/** First championship of the day: a modest purse plus one free C scout pull (a
 * new player for rookies, a collection tick mid-game, and a 125-coin overflow
 * for veterans who own every C - the bonus self-converts as progression grows). */
export const FIRST_WIN_COINS = 100;
export const FIRST_WIN_SCOUT_TIER: PlayerGachaTier = 'C';

export interface WeeklyTier {
  /** Game wins needed this week (wins count even from lost runs). */
  wins: number;
  coins: number;
  /** The top tier also grants one random ability of this rarity. */
  abilityRarity?: Rarity;
}

/** Weekly goals: tier 1 lands for anyone who plays a run, tier 2 for a casual
 * week (~3 runs), tier 3 is the invested stretch. Rare (not epic) at the top so a
 * weekly can never outpay a Championship Bounty. */
export const WEEKLY_TIERS: readonly WeeklyTier[] = [
  { wins: 10, coins: 150 },
  { wins: 35, coins: 400 },
  { wins: 100, coins: 600, abilityRarity: 'rare' },
];

/** The persisted weekly ledger (see HomeRoster.weekly). Keyed by weekKey so a
 * rolled-back clock finds the old week's claims intact and can never re-grant. */
export interface WeeklyLedger {
  week: string;
  gameWins: number;
  claimedTiers: number[];
}

/** The ledger's counters for `week`, zeroed when the stored ledger belongs to a
 * different week. The lazy weekly reset IS this comparison; nothing is ever
 * subtracted from a live ledger. */
export function weeklyProgress(
  weekly: WeeklyLedger | undefined,
  week: string
): { gameWins: number; claimedTiers: number[] } {
  if (!weekly || weekly.week !== week) return { gameWins: 0, claimedTiers: [] };
  return { gameWins: weekly.gameWins, claimedTiers: weekly.claimedTiers };
}
