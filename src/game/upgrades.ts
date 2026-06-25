import { SKILL_STAT_KEYS, STAT_HARD_MAX, type PlayerStats } from '@/types/player';

/**
 * Permanent stat-upgrade economy (the between-runs "Locker Room"). Coins buy a
 * flat +1 to one of a player's eight skill ratings, with the per-tier cost
 * rising geometrically. Each purchase is a legible "+1"; diminishing returns
 * come from the rising cost, the hard rating cap, and opponent scaling, NOT from
 * a fractional effect curve (which would round to +0 on the integer scale and
 * feel like paying for nothing).
 */

/**
 * The hard per-stat permanent-upgrade cap: at most +5 in any single category, ever.
 * On the wider 6-20 scale a +1 is a smaller relative bump than before, so five
 * cheap steps stay a nudge rather than a reclass: permanent power lifts a player
 * within reach of the next class but the class ladder and the draft stay the real
 * levers. RATING_CAP still bounds the absolute value on top of this.
 */
export const PER_STAT_MAX = 5;
/** Hard rating ceiling (shared with training; the absolute top of the scale). */
export const RATING_CAP = STAT_HARD_MAX;

/** The per-stat permanent-purchase cap. Flat at PER_STAT_MAX (no ladder ramp). */
export function perStatMax(): number {
  return PER_STAT_MAX;
}
/** The eight upgradeable skills (condition ratings are not difficulty tiers). */
export const UPGRADEABLE_STATS = SKILL_STAT_KEYS;

// Cheap, gently-ramping costs (base 200, x2 per rank): a +1 is roughly a fifth of
// a run's income (~950 coins) so it is a frequent, satisfying reward, while the
// doubling ramp keeps maxing a stat (+5) an aspirational, multi-run investment.
// The +5 per-stat cap (PER_STAT_MAX) is the hard bound. Tune freely here.
const STD_BASE = 200;
const STD_GROWTH = 2.0;
const PREMIUM_BASE = 300;
const PREMIUM_GROWTH = 2.0;
/** Defining, scarcer ratings cost more to raise. */
const PREMIUM_STATS = new Set<keyof PlayerStats>(['outside', 'playmaking', 'clutch']);

export function isPremiumStat(stat: keyof PlayerStats): boolean {
  return PREMIUM_STATS.has(stat);
}

/**
 * Coin cost of the next +1 for `stat`, given how many have already been bought.
 * With the +5 cap, five ranks apply: Standard 200, 400, 800, 1,600, 3,200.
 * Premium 300, 600, 1,200, 2,400, 4,800.
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
