import { SKILL_STAT_KEYS, type PlayerStats } from '@/types/player';
import type { RNG } from './rng';

/**
 * Difficulty scaling shared by the fake generator (tournament.ts) and the real
 * NBA pool (player-pool.ts). Pulled into its own module so both can use it
 * without an import cycle. Deterministic when given a seeded RNG.
 */

/** Clamp a value to [min, max] inclusive. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Surface scale bounds (the 3-10 model) the stat band is clamped within. */
const STAT_FLOOR = 3;
const STAT_CEIL = 10;

/**
 * Expected stat band for a continuous difficulty level (see difficulty.ts). The
 * band centers on the level and widens slightly, so deeper opponents still show
 * stat variety. Replaces the old 8-bucket integer-round table: a level of ~5
 * opens near rookie strength and ~10 is the final-boss peak, with everything in
 * between smooth (no flat-within-map step that made each map start weak).
 */
export function getStatRangeForLevel(level: number): { min: number; max: number } {
  const min = clamp(Math.round(level - 1), STAT_FLOOR, STAT_CEIL);
  const max = clamp(Math.round(level + 0.5), STAT_FLOOR, STAT_CEIL);
  return { min, max: Math.max(min, max) };
}

/**
 * Scale a stat line into a difficulty level's band with a little variance. Only
 * the eight skill ratings are scaled by difficulty; stamina and durability are
 * condition, not a difficulty tier, so they pass through unchanged (scaling them
 * would make deep opponents unfatigueable). Draws happen in SKILL_STAT_KEYS order.
 */
export function scaleStatsToLevel(
  stats: PlayerStats,
  level: number,
  rng: RNG
): PlayerStats {
  const range = getStatRangeForLevel(level);
  const scaled: PlayerStats = { ...stats };
  for (const key of SKILL_STAT_KEYS) {
    scaled[key] = clamp(stats[key] + rng.int(-1, 2), range.min, range.max);
  }
  return scaled;
}
