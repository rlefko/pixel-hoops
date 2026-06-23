import { SKILL_STAT_KEYS, type PlayerStats } from '@/types/player';

/**
 * Permanent stat-upgrade economy (the between-runs "Locker Room"). Coins buy a
 * flat +1 to one of a player's eight skill ratings, with the per-tier cost
 * rising geometrically. Each purchase is a legible "+1"; diminishing returns
 * come from the rising cost, the hard rating cap of 10, and opponent scaling,
 * NOT from a fractional effect curve (which would round to +0 on the integer
 * 3-10 scale and feel like paying for nothing).
 */

/** Most +1s a single stat can be bought past its origin. */
export const PER_STAT_MAX = 5;
/** Hard rating ceiling (shared with training and the 3-10 model). */
export const RATING_CAP = 10;
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
 * Whether a stat can still be upgraded: under the per-stat cap AND below the
 * rating ceiling. A player who starts high hits the rating cap first.
 */
export function canUpgrade(
  stat: keyof PlayerStats,
  currentValue: number,
  alreadyBought: number
): boolean {
  return alreadyBought < PER_STAT_MAX && currentValue < RATING_CAP;
}
