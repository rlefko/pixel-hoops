import type { PlayerStats } from '@/types/player';

/**
 * Pure mapping from NBA 2K rating space (0-99 attributes) into the game's
 * compact 3-10 stat space. Kept dependency-free (type-only import) so the
 * offline fetch script (scripts/fetch-nba.ts) can reuse it without pulling in
 * any app/runtime modules. The four game stats condense many 2K attributes:
 *
 *   shooting    <- three-point, mid-range, free-throw
 *   speed       <- speed, acceleration, ball-handling
 *   athleticism <- vertical, strength, dunk, block
 *   clutch      <- intangibles (falls back to overall)
 */

/** Loose bag of 2K attributes; the API/2kratings naming varies, so we probe. */
export type RawRatings = Record<string, number | undefined>;

/** First present, finite value among `keys`, else `fallback`. */
function pick(raw: RawRatings, keys: string[], fallback: number): number {
  for (const key of keys) {
    const v = raw[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return fallback;
}

function avg(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Map a 2K rating (~25-99) to the 3-10 game scale, clamped. */
export function scaleRating(rating: number): number {
  const t = (rating - 25) / (99 - 25);
  const scaled = Math.round(3 + t * 7);
  return Math.max(3, Math.min(10, scaled));
}

/** Condense a raw 2K attribute bag into the game's four stats. */
export function mapRatingsToStats(raw: RawRatings): PlayerStats {
  const overall = pick(raw, ['overall', 'overallAttribute', 'rating'], 75);

  const shooting = avg([
    pick(raw, ['threePointShot', 'three_point_shot', 'outsideScoring'], overall),
    pick(raw, ['midRangeShot', 'mid_range_shot'], overall),
    pick(raw, ['freeThrow', 'free_throw'], overall),
  ]);
  const speed = avg([
    pick(raw, ['speed'], overall),
    pick(raw, ['acceleration'], overall),
    pick(raw, ['ballHandle', 'ball_handle', 'ballControl'], overall),
  ]);
  const athleticism = avg([
    pick(raw, ['vertical'], overall),
    pick(raw, ['strength'], overall),
    pick(raw, ['drivingDunk', 'driving_dunk', 'standingDunk', 'dunk'], overall),
    pick(raw, ['block'], overall),
  ]);
  const clutch = pick(raw, ['intangibles', 'clutch'], overall);

  return {
    shooting: scaleRating(shooting),
    speed: scaleRating(speed),
    athleticism: scaleRating(athleticism),
    clutch: scaleRating(clutch),
  };
}
