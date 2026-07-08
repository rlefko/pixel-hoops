import type { PlayerClass } from './ratings';
import { classLevel } from './classes';

/**
 * LEGACY: the win-earned career ledger behind usage-gated growth. Fielding an OWNED
 * player banks their career line game by game: wins they logged minutes in, games
 * they were the box-score MVP of (Game Score, so an empty-calorie chucker never
 * outranks a real line), and championships they played the title game of. The
 * ledger gates the deepest Locker Room ranks and the Icon Perk slot, so a player
 * grows into greatness by actually playing, not by wallet alone.
 *
 * Three guards keep it farm-proof (mirroring favor.ts, the shipped precedent):
 *  - WIN-ONLY: losses bank nothing (a ledger that pays for playing badly would make
 *    suicide runs the optimal career farm).
 *  - MINUTES-ONLY: `seconds > 0` in the box, never benched spectators.
 *  - AT-CLASS ONLY: a game credits legacy only when the run's ladder sits within one
 *    class rung of the player's own class. Legends do not pad careers against rookies.
 * And one promise the other direction: legacy NEVER decays. Earn-by-doing systems
 * that regress (NBA 2K badge regression) breed perverse play; a career only grows.
 *
 * Pure and data-only (no RNG, no storage), the single source of truth for the
 * numbers, mirroring collection.ts / favor.ts.
 */

/** One owned player's career totals. Wins are games (with minutes) the team WON;
 * mvp counts box-score MVP crowns in those wins; titles are championship clears
 * with minutes in the title game. */
export interface LegacyLine {
  w: number;
  mvp: number;
  titles: number;
}

/** A per-player career ledger, keyed by playerKey (`name|POS`). */
export type LegacyLedger = Record<string, LegacyLine>;

export function emptyLegacyLine(): LegacyLine {
  return { w: 0, mvp: 0, titles: 0 };
}

/**
 * The named legacy levels, cumulative and never revoked. Thresholds are tuned so
 * each lands naturally while fielding a player you like (L2 within ~1.5 dedicated
 * runs, L4 around five), never as a chore list: wins, MVP crowns, and titles are
 * what fielding a favorite already produces. L2/L3 open Locker Room ranks 4/5
 * (upgrades.ts); L4 opens the one Icon Perk slot.
 */
export const LEGACY_LEVELS = [
  { level: 1, name: 'ROTATION', w: 5, mvp: 0, titles: 0 },
  { level: 2, name: 'STARTER', w: 15, mvp: 3, titles: 0 },
  { level: 3, name: 'FRANCHISE', w: 35, mvp: 10, titles: 1 },
  { level: 4, name: 'ICON', w: 60, mvp: 20, titles: 3 },
] as const;

export type LegacyLevel = 0 | 1 | 2 | 3 | 4;

/** The highest legacy level a career line has reached (0 = unproven). */
export function legacyLevel(line: LegacyLine | undefined): LegacyLevel {
  if (!line) return 0;
  let reached: LegacyLevel = 0;
  for (const tier of LEGACY_LEVELS) {
    if (line.w >= tier.w && line.mvp >= tier.mvp && line.titles >= tier.titles) {
      reached = tier.level;
    }
  }
  return reached;
}

/** The next level's definition, or null at the ICON cap. */
export function nextLegacyLevel(
  line: LegacyLine | undefined
): (typeof LEGACY_LEVELS)[number] | null {
  const current = legacyLevel(line);
  return LEGACY_LEVELS.find((tier) => tier.level === current + 1) ?? null;
}

/**
 * The at-class grace: a game credits legacy only when the run's ladder level sits
 * within this many OVR points below the player's own class level. Class levels step
 * ~3 apart (C 10 / B 13 / A 16 / S 19 / S+ 22), so the grace is exactly one rung:
 * an S star still builds a career on the A ladder, but an S+ legend farming the C
 * ladder banks nothing (the Darkest Dungeon rule, softened from refusal to zero).
 */
export const LEGACY_AT_CLASS_GRACE = 3;

/** Whether a player of `playerClass` earns legacy on a `ladderClass` run. */
export function legacyEligible(playerClass: PlayerClass, ladderClass: PlayerClass): boolean {
  return classLevel(ladderClass) >= classLevel(playerClass) - LEGACY_AT_CLASS_GRACE;
}

/** One player's credit for a single won game: whether they wore the MVP crown and
 * whether the win was the championship (title-game minutes). */
export interface LegacyGameCredit {
  key: string;
  mvp: boolean;
  title: boolean;
}

/**
 * Fold one WON game into a run's legacy ledger, immutably. The caller (the run
 * reducer) has already filtered to fielded, at-class players; losses never call
 * this. A no-op (same reference) when there is nothing to add, so reducer states
 * never churn on ineligible wins.
 */
export function addLegacyGame(
  ledger: Readonly<LegacyLedger>,
  credits: readonly LegacyGameCredit[]
): LegacyLedger {
  if (credits.length === 0) return ledger as LegacyLedger;
  const next: LegacyLedger = { ...ledger };
  for (const credit of credits) {
    const line = next[credit.key] ?? emptyLegacyLine();
    next[credit.key] = {
      w: line.w + 1,
      mvp: line.mvp + (credit.mvp ? 1 : 0),
      titles: line.titles + (credit.title ? 1 : 0),
    };
  }
  return next;
}

/**
 * Bank a finished run's legacy into the home ledger, crediting only players owned
 * BEFORE the merge (a rental's usage is favor's job; crediting recruits would make
 * recruit-and-park a career farm). Exactly-once per run via the caller's
 * settledRunId guard, exactly like favor. Same reference when nothing banks.
 */
export function mergeLegacyIntoHome(
  home: Readonly<LegacyLedger>,
  runLegacy: Readonly<LegacyLedger> | undefined,
  ownedKeys: ReadonlySet<string>
): LegacyLedger {
  const entries = Object.entries(runLegacy ?? {}).filter(([key]) => ownedKeys.has(key));
  if (entries.length === 0) return home as LegacyLedger;
  const next: LegacyLedger = { ...home };
  for (const [key, earned] of entries) {
    const line = next[key] ?? emptyLegacyLine();
    next[key] = {
      w: line.w + earned.w,
      mvp: line.mvp + earned.mvp,
      titles: line.titles + earned.titles,
    };
  }
  return next;
}

/**
 * ICON PERKS: the L4 capstone, one slot, choose 1 of 3. None touch the fourteen
 * ratings (the +5/30 caps are design law); each routes through an existing bounded
 * channel instead: prestige presentation, the favor economy, or the run-scoped
 * training-point economy (already the only path to the 30 apex, reset every run).
 * The pick is a swappable sidegrade, never consumed.
 */
export const ICON_PERKS = [
  {
    id: 'pennant',
    name: "CAPTAIN'S PENNANT",
    blurb: 'A gold banner and the captain treatment. Pure prestige.',
  },
  {
    id: 'mentor',
    name: 'MENTOR',
    blurb: 'Un-owned recruits fielded beside them bank +1 favor per won game.',
  },
  {
    id: 'film-room',
    name: 'FILM ROOM',
    blurb: '+1 training point on boss wins while they play.',
  },
] as const;
export type IconPerkId = (typeof ICON_PERKS)[number]['id'];

export function isIconPerkId(value: unknown): value is IconPerkId {
  return typeof value === 'string' && ICON_PERKS.some((perk) => perk.id === value);
}

/** MENTOR: extra favor points every fielded player banks on a won game when an
 * icon mentor also took the floor (the settle keeps only the un-owned, so the
 * bonus feeds the collection chase and nothing else). Flat, never stacked. */
export const MENTOR_FAVOR_BONUS = 1;

/** FILM ROOM: extra training points a boss win pays per fielded icon with the
 * perk. Run-scoped by construction (TP resets every run). */
export const FILM_ROOM_BOSS_TP = 1;

/** Past ICON, every further MVP crown pays a small appearance fee at settle: the
 * meter keeps converting after the capstone (overflow always converts). */
export const LEGACY_MVP_FEE = 25;

/** Coins the settle owes for MVP crowns earned this run by players whose career
 * had ALREADY reached ICON before the merge (post-capstone overflow only; the
 * crowns that finished the climb still count toward it, not as coins). */
export function legacyAppearanceFees(
  home: Readonly<LegacyLedger>,
  runLegacy: Readonly<LegacyLedger> | undefined,
  ownedKeys: ReadonlySet<string>
): number {
  let fees = 0;
  for (const [key, earned] of Object.entries(runLegacy ?? {})) {
    if (!ownedKeys.has(key) || earned.mvp <= 0) continue;
    if (legacyLevel(home[key]) < 4) continue;
    fees += earned.mvp * LEGACY_MVP_FEE;
  }
  return fees;
}

/** Clamp one persisted counter to a sane non-negative integer. */
function sanitizeCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

/**
 * Restore a persisted legacy ledger, tolerating garbage. Values sanitize, but
 * MEMBERSHIP is kept even for keys not currently owned: a corrupted players load
 * path must never orphan a career (careers never decay, and an entry for a
 * departed key is inert). Empty/garbage degrades to an empty ledger.
 */
export function sanitizeLegacy(raw: unknown): LegacyLedger {
  if (!raw || typeof raw !== 'object') return {};
  const out: LegacyLedger = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const line = value as Partial<LegacyLine>;
    const w = sanitizeCount(line.w);
    const mvp = sanitizeCount(line.mvp);
    const titles = sanitizeCount(line.titles);
    if (w <= 0 && mvp <= 0 && titles <= 0) continue;
    out[key] = { w, mvp, titles };
  }
  return out;
}
