import { SKILL_STAT_KEYS, type PlayerStats } from '@/types/player';

/**
 * Permanent stat-upgrade economy (the between-runs "Locker Room"). Coins buy a
 * flat +1 to one of a player's eight skill ratings, with the per-tier cost
 * rising geometrically. Each purchase is a legible "+1"; diminishing returns
 * come from the rising cost, the hard rating cap of 10, and opponent scaling,
 * NOT from a fractional effect curve (which would round to +0 on the integer
 * 3-10 scale and feel like paying for nothing).
 */

/**
 * The hard per-stat permanent-upgrade cap: at most +2 in any single category, ever.
 * This is the central meta-power bound (the user found the old +5..+8 ramp made
 * upgrading "too easy / too cheap"): permanent power can only nudge a player, never
 * reclass them, so the class ladder and the draft stay the real levers. RATING_CAP
 * still bounds the absolute value on top of this.
 */
export const PER_STAT_MAX = 2;
/** Hard rating ceiling (shared with training and the 3-10 model). */
export const RATING_CAP = 10;

/** The per-stat permanent-purchase cap. Flat at PER_STAT_MAX (no ladder ramp). */
export function perStatMax(): number {
  return PER_STAT_MAX;
}
/** The eight upgradeable skills (condition ratings are not difficulty tiers). */
export const UPGRADEABLE_STATS = SKILL_STAT_KEYS;

// Steep, geometric costs: a +1 is a meaningful chunk of a run's income (~950
// coins) and the 2nd +1 is 3x the 1st, so maxing one stat takes a couple of runs
// and fully maxing a player is an aspirational, multi-run investment. The +2
// per-stat cap (PER_STAT_MAX) is still the hard bound. Tune freely here.
const STD_BASE = 400;
const STD_GROWTH = 3.0;
const PREMIUM_BASE = 600;
const PREMIUM_GROWTH = 3.0;
/** Defining, scarcer ratings cost more to raise. */
const PREMIUM_STATS = new Set<keyof PlayerStats>(['outside', 'playmaking', 'clutch']);

export function isPremiumStat(stat: keyof PlayerStats): boolean {
  return PREMIUM_STATS.has(stat);
}

/**
 * Coin cost of the next +1 for `stat`, given how many have already been bought.
 * With the +2 cap, only two ranks apply: Standard 400, 1,200. Premium 600, 1,800.
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
