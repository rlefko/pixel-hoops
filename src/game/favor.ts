import type { PlayerClass } from './ratings';

/**
 * FAVOR: deterministic, win-earned progress toward owning a specific player. Fielding
 * an un-owned player (a mid-run recruit, an on-loan legend) banks favor for every game
 * they play minutes in and WIN; the ledger survives a lost run, so the "recruits
 * evaporate" sting always leaves a visible meter behind. Favor never accrues on losses
 * or to benched spectators: a floor that pays for playing badly would make suicide runs
 * the optimal farm (see docs/favor-system.md).
 *
 * Favor is FRACTIONAL COPIES: at run end it converts to collection copies at a
 * class-scaled threshold, and between runs it steers the scout machines and the legend
 * reveal toward the players it marks. Pure and data-only (no RNG, no storage), the
 * single source of truth for the numbers, mirroring collection.ts.
 */

/** Favor points banked per WON game the player logged minutes in, by opponent tier.
 * The championship pays a flat bonus on top (the "they saw you lift the trophy" beat). */
export const FAVOR_WIN_POINTS = { game: 1, elite: 2, boss: 3 } as const;
export const FAVOR_CHAMPION_BONUS = 5;

/** Reach-up damp: an above-ladder guest earns half trust, mirroring the one-copy
 * deposit cap so below-ladder content can never complete an above-class chase fast. */
export const FAVOR_REACH_UP_DAMP = 0.5;

/**
 * Favor points per collection copy, by class. Scales with the chase length the tier is
 * meant to have (a dedicated at-class clear banks roughly one copy of a player fielded
 * throughout). Zero = the class never converts: legends (S+) own at a single copy, so
 * any conversion would insta-own them; their favor still steers the once-per-run reveal.
 */
export const FAVOR_PER_COPY: Record<PlayerClass, number> = {
  D: 0,
  C: 20,
  B: 30,
  A: 40,
  S: 60,
  'S+': 0,
  'S++': 0,
};

/** Whether a class's favor converts to collection copies at settle. */
export function favorConvertible(cls: PlayerClass): boolean {
  return (FAVOR_PER_COPY[cls] ?? 0) > 0;
}

/** Convert banked favor into whole copies plus the remainder that stays on the meter.
 * Non-convertible classes keep everything as remainder (legend favor is bias, not copies). */
export function favorToCopies(favor: number, cls: PlayerClass): { copies: number; remainder: number } {
  const perCopy = FAVOR_PER_COPY[cls] ?? 0;
  if (perCopy <= 0 || favor <= 0) return { copies: 0, remainder: Math.max(0, favor) };
  return { copies: Math.floor(favor / perCopy), remainder: favor % perCopy };
}

/** Progress toward the NEXT favor copy, 0..1, for meters. A settled ledger always
 * holds less than one copy's worth, so this reads as the visible fraction. */
export function favorFraction(favor: number, cls: PlayerClass): number {
  const perCopy = FAVOR_PER_COPY[cls] ?? 0;
  if (perCopy <= 0 || favor <= 0) return 0;
  return Math.min(1, favor / perCopy);
}

/** The favor a run's accrued base points settle to: scaled by the difficulty's favor
 * multiplier and damped for a reach-up (above-ladder) player. Rounded to keep the
 * ledger in integers. */
export function settleFavorEarned(base: number, favorMul: number, reachUp: boolean): number {
  if (base <= 0) return 0;
  return Math.round(base * favorMul * (reachUp ? FAVOR_REACH_UP_DAMP : 1));
}

/** Coins paid per residual favor point when a chase completes some other way (a
 * deposit or a scout pull signs the player first). A meter the game asked the player
 * to fill never evaporates; a full A copy's worth of favor refunds a modest 200. */
export const FAVOR_RESIDUAL_COIN_RATE = 5;

/** Add `points` to every key's entry, immutably. A no-op (same reference) when there
 * is nothing to add, so reducer states never churn on empty wins. */
export function addFavor(
  ledger: Readonly<Record<string, number>>,
  keys: readonly string[],
  points: number
): Record<string, number> {
  if (points <= 0 || keys.length === 0) return ledger as Record<string, number>;
  const next: Record<string, number> = { ...ledger };
  for (const key of keys) next[key] = (next[key] ?? 0) + points;
  return next;
}
