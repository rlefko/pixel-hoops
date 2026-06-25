import {
  SKILL_STAT_KEYS,
  STAT_CEIL,
  STAT_ELITE_MAX,
  STAT_MIN,
  type PlayerStats,
} from '@/types/player';
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

// Re-export the scale constants (declared on the type leaf) so the game layer
// can import them from one game-side module.
export { STAT_MIN, STAT_BASE, STAT_NORMAL_MAX, STAT_ELITE_MAX, STAT_CEIL, STAT_HARD_MAX } from '@/types/player';

/** Remap an old 3-10 rating onto the new system scale (a pure 2x widening, so
 * relative balance is preserved exactly). Used by the v7 save migration. */
export function remapSystem(old: number): number {
  return Math.round(old * 2);
}

/** Remap an old 3-10 rating into the curated-great band [STAT_MIN, STAT_ELITE_MAX],
 * so legends gain a granular spread peaking near 24. Used for legend data/saves. */
export function remapElite(old: number): number {
  return Math.round(STAT_MIN + ((old - 3) / 7) * (STAT_ELITE_MAX - STAT_MIN));
}

/** Surface scale bounds the stat band is clamped within. The floor is the normal
 * band's base; the ceiling (STAT_CEIL) rises ABOVE the normal cap so the very top
 * of the S / S+ ladders can field apex bosses (stats past 20). Levels at or below
 * the S band still round to <=20, so only the top-ladder finales exceed it. */
const STAT_FLOOR = STAT_MIN;

/**
 * Expected stat band for a continuous difficulty level (see difficulty.ts). The
 * band centers on the level and widens slightly, so deeper opponents still show
 * stat variety. Replaces the old 8-bucket integer-round table: a level of ~5
 * opens near rookie strength and ~10 is the final-boss peak, with everything in
 * between smooth (no flat-within-map step that made each map start weak).
 */
export function getStatRangeForLevel(level: number): { min: number; max: number } {
  const min = clamp(Math.round(level - 2), STAT_FLOOR, STAT_CEIL);
  const max = clamp(Math.round(level + 1), STAT_FLOOR, STAT_CEIL);
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
    scaled[key] = clamp(stats[key] + rng.int(-2, 4), range.min, range.max);
  }
  return scaled;
}
