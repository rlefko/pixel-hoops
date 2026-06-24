import { SKILL_STAT_KEYS, type PlayerStats } from '@/types/player';

/**
 * Permanent stat-upgrade economy (the between-runs "Locker Room"). Coins buy a
 * flat +1 to one of a player's eight skill ratings, with the per-tier cost
 * rising geometrically. Each purchase is a legible "+1"; diminishing returns
 * come from the rising cost, the hard rating cap of 10, and opponent scaling,
 * NOT from a fractional effect curve (which would round to +0 on the integer
 * 3-10 scale and feel like paying for nothing).
 */

/** Base most +1s a single stat can be bought past its origin (the run-1 cap). */
export const PER_STAT_MAX = 5;
/** Ceiling the League-raised per-stat cap can reach. RATING_CAP still bounds the
 * absolute value, so permanent power stays bounded even at the top tier. */
export const PER_STAT_HARD_MAX = 8;
/** Hard rating ceiling (shared with training and the 3-10 model). */
export const RATING_CAP = 10;

/**
 * The per-stat permanent-purchase cap at a given League tier. It starts low
 * (PER_STAT_MAX) and only grows by clearing hard content (climbing the ladder),
 * the Pokelike-style bound: permanent power raises the floor without ever letting
 * a fielded five outrun the difficulty curve. The salary cap is the main limiter.
 */
export function perStatMax(leagueTier: number): number {
  return Math.min(PER_STAT_HARD_MAX, PER_STAT_MAX + Math.floor(Math.max(0, leagueTier) / 2));
}
/** The eight upgradeable skills (condition ratings are not difficulty tiers). */
export const UPGRADEABLE_STATS = SKILL_STAT_KEYS;

const STD_BASE = 20;
const STD_GROWTH = 1.25;
const PREMIUM_BASE = 30;
const PREMIUM_GROWTH = 1.3;
/** Defining, scarcer ratings cost more to raise. */
const PREMIUM_STATS = new Set<keyof PlayerStats>(['outside', 'playmaking', 'clutch']);

export function isPremiumStat(stat: keyof PlayerStats): boolean {
  return PREMIUM_STATS.has(stat);
}

/**
 * Coin cost of the next +1 for `stat`, given how many have already been bought.
 * Standard: 20, 25, 31, 39, 49. Premium: 30, 39, 51, 66, 86.
 */
export function upgradeCost(stat: keyof PlayerStats, alreadyBought: number): number {
  const premium = isPremiumStat(stat);
  const base = premium ? PREMIUM_BASE : STD_BASE;
  const growth = premium ? PREMIUM_GROWTH : STD_GROWTH;
  return Math.round(base * Math.pow(growth, alreadyBought));
}

/**
 * Whether a stat can still be upgraded: under the per-stat cap (which the League
 * tier may have raised, hence the optional `maxBought`) AND below the rating
 * ceiling. A player who starts high hits the rating cap first.
 */
export function canUpgrade(
  stat: keyof PlayerStats,
  currentValue: number,
  alreadyBought: number,
  maxBought: number = PER_STAT_MAX
): boolean {
  return alreadyBought < maxBought && currentValue < RATING_CAP;
}
