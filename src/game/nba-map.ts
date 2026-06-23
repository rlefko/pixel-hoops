import type { PlayerStats } from '@/types/player';

/**
 * Pure mapping from NBA 2K rating space (0-99 attributes) into the game's
 * compact 3-10 stat space. Kept dependency-free (type-only import) so the
 * offline fetch script (scripts/fetch-nba.ts) can reuse it without pulling in
 * any app/runtime modules. The ten game ratings condense many 2K attributes:
 *
 *   inside      <- layup, dunk, close/post, strength
 *   outside     <- three-point, mid-range, free-throw
 *   playmaking  <- ball-handle, pass accuracy, pass IQ, speed-with-ball
 *   perimeterD  <- perimeter defense, steal, lateral quickness
 *   interiorD   <- interior defense, block, defensive rebound, strength
 *   athleticism <- speed, acceleration, vertical
 *   iq          <- intangibles, pass IQ, consistency
 *   clutch      <- intangibles (falls back to overall)
 *   stamina     <- stamina (falls back to overall)
 *   durability  <- durability, hustle (falls back to overall)
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

/** Condense a raw 2K attribute bag into the game's ten ratings. */
export function mapRatingsToStats(raw: RawRatings): PlayerStats {
  const overall = pick(raw, ['overall', 'overallAttribute', 'rating'], 75);

  const inside = avg([
    pick(raw, ['layup'], overall),
    pick(raw, ['drivingDunk', 'driving_dunk', 'standingDunk', 'dunk'], overall),
    pick(raw, ['postControl', 'post_control', 'closeShot', 'close_shot'], overall),
    pick(raw, ['strength'], overall),
  ]);
  const outside = avg([
    pick(raw, ['threePointShot', 'three_point_shot', 'outsideScoring'], overall),
    pick(raw, ['midRangeShot', 'mid_range_shot'], overall),
    pick(raw, ['freeThrow', 'free_throw'], overall),
  ]);
  const playmaking = avg([
    pick(raw, ['ballHandle', 'ball_handle', 'ballControl'], overall),
    pick(raw, ['passAccuracy', 'pass_accuracy'], overall),
    pick(raw, ['passIQ', 'pass_iq', 'passVision'], overall),
    pick(raw, ['speedWithBall', 'speed_with_ball'], overall),
  ]);
  const perimeterD = avg([
    pick(raw, ['perimeterDefense', 'perimeter_defense'], overall),
    pick(raw, ['steal'], overall),
    pick(raw, ['lateralQuickness', 'lateral_quickness', 'speed'], overall),
  ]);
  const interiorD = avg([
    pick(raw, ['interiorDefense', 'interior_defense'], overall),
    pick(raw, ['block'], overall),
    pick(raw, ['defensiveRebound', 'defensive_rebound', 'rebound'], overall),
    pick(raw, ['strength'], overall),
  ]);
  const athleticism = avg([
    pick(raw, ['speed'], overall),
    pick(raw, ['acceleration'], overall),
    pick(raw, ['vertical'], overall),
  ]);
  const iq = avg([
    pick(raw, ['intangibles'], overall),
    pick(raw, ['passIQ', 'pass_iq'], overall),
    pick(raw, ['offensiveConsistency', 'consistency'], overall),
  ]);
  const clutch = pick(raw, ['intangibles', 'clutch'], overall);
  const stamina = pick(raw, ['stamina'], overall);
  const durability = pick(raw, ['durability', 'hustle'], overall);

  return {
    inside: scaleRating(inside),
    outside: scaleRating(outside),
    playmaking: scaleRating(playmaking),
    perimeterD: scaleRating(perimeterD),
    interiorD: scaleRating(interiorD),
    athleticism: scaleRating(athleticism),
    iq: scaleRating(iq),
    clutch: scaleRating(clutch),
    stamina: scaleRating(stamina),
    durability: scaleRating(durability),
  };
}
