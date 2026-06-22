import type { PlayerStats } from '@/types/player';
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

/** Expected stat range for a given tournament round. */
export function getRoundStatRange(round: number): { min: number; max: number } {
  switch (Math.min(round, 7)) {
    case 1:
      return { min: 4, max: 5 };
    case 2:
      return { min: 4, max: 6 };
    case 3:
      return { min: 5, max: 6 };
    case 4:
      return { min: 5, max: 7 };
    case 5:
      return { min: 6, max: 8 };
    case 6:
      return { min: 7, max: 9 };
    case 7:
      return { min: 8, max: 10 };
    default:
      return { min: 4, max: 5 };
  }
}

/** Scale a stat line into a round's range with a little variance. */
export function scaleStatsToRound(
  stats: PlayerStats,
  round: number,
  rng: RNG
): PlayerStats {
  const range = getRoundStatRange(round);
  const scale = (value: number) =>
    clamp(value + rng.int(-1, 2), range.min, range.max);
  return {
    shooting: scale(stats.shooting),
    speed: scale(stats.speed),
    athleticism: scale(stats.athleticism),
    clutch: scale(stats.clutch),
  };
}
