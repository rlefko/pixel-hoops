import { STAT_ELITE_MAX, STAT_MIN, STAT_NORMAL_MAX, type PlayerStats } from '@/types/player';
import type { Position } from '@/types/roster';
import { derivePlaystyle, type BakedTendency } from './playstyle';

/**
 * Pure mapping from NBA 2K rating space (0-99 attributes) into the game's
 * granular stat space (6-20 for the normal pool, up to 24 for curated greats).
 * Kept dependency-light (the scale constants live on the type leaf) so the
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
 *
 * Plus four intrinsic PLAY-STYLE ratings, mapped from their primary 2K source as
 * standalone read-outs (they do NOT feed OVR, only the sim's box-score behavior):
 *
 *   blocking    <- block (double-weighted), vertical, interior defense
 *   stealing    <- steal (double-weighted), pass perception/hands, lateral quickness (NO size)
 *   strength    <- strength
 *   rebounding  <- defensive + offensive rebound, strength, vertical
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

/** Map a 2K rating (~25-99) onto [lo, hi], clamped. The 2K endpoints (25..99)
 * describe the SOURCE scale and never change; only the target band moves. */
function scaleTo(rating: number, lo: number, hi: number): number {
  const t = (rating - 25) / (99 - 25);
  const scaled = Math.round(lo + t * (hi - lo));
  return Math.max(lo, Math.min(hi, scaled));
}

/** Map a 2K rating to the normal 6-20 game band (the real-player pool). */
export function scaleRating(rating: number): number {
  return scaleTo(rating, STAT_MIN, STAT_NORMAL_MAX);
}

/** Map a 2K rating to the curated-great band 6-24, so legends gain a granular,
 * specialized spread above the normal cap. */
export function scaleRatingElite(rating: number): number {
  return scaleTo(rating, STAT_MIN, STAT_ELITE_MAX);
}

/** Condense a raw 2K attribute bag into the game's ten ratings. `elite` widens the
 * target band to 6-24 for curated legends; the pool uses the normal 6-20 band. */
export function mapRatingsToStats(raw: RawRatings, opts?: { elite?: boolean }): PlayerStats {
  const scale = opts?.elite ? scaleRatingElite : scaleRating;
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

  // Play-style ratings: each leans on its primary 2K attribute so the spread is
  // realistic by construction (a guard's `block` is low, a center's `steal` is
  // low). The core signal is double-weighted; supporting attributes round it out.
  const blocking = avg([
    pick(raw, ['block'], overall),
    pick(raw, ['block'], overall),
    pick(raw, ['vertical'], overall),
    pick(raw, ['interiorDefense', 'interior_defense'], overall),
  ]);
  const stealing = avg([
    pick(raw, ['steal'], overall),
    pick(raw, ['steal'], overall),
    pick(raw, ['passPerception', 'pass_perception', 'hands'], overall),
    pick(raw, ['perimeterDefense', 'perimeter_defense', 'agility', 'speed'], overall),
  ]);
  const strength = pick(raw, ['strength'], overall);
  const rebounding = avg([
    pick(raw, ['defensiveRebound', 'defensive_rebound', 'rebound'], overall),
    pick(raw, ['offensiveRebound', 'offensive_rebound'], overall),
    pick(raw, ['strength'], overall),
    pick(raw, ['vertical'], overall),
  ]);

  return {
    inside: scale(inside),
    outside: scale(outside),
    playmaking: scale(playmaking),
    perimeterD: scale(perimeterD),
    interiorD: scale(interiorD),
    athleticism: scale(athleticism),
    iq: scale(iq),
    clutch: scale(clutch),
    stamina: scale(stamina),
    durability: scale(durability),
    blocking: scale(blocking),
    stealing: scale(stealing),
    strength: scale(strength),
    rebounding: scale(rebounding),
  };
}

/** Attribute contribution only above a relevance floor, so a guard's middling
 * post rating contributes ~nothing to the post lane (and a big's middling three
 * to the three lane). This is what makes the baked diet read by SPECIALIZATION. */
function rel(value: number, floor: number): number {
  return Math.max(0, value - floor);
}

/** Map a raw 2K attribute (~25-99) to a 0..100 lean over a sensible window. */
function lean(value: number): number {
  return Math.max(0, Math.min(100, Math.round(((value - 40) / 55) * 100)));
}

/**
 * Derive a compact {@link BakedTendency} from the rich 2K attribute bag + badge
 * names that the condensed fourteen ratings discard (on-ball vs off-ball, post
 * game, slasher vs lob, foul-drawing). Shot lanes read by specialization above a
 * floor, lightly boosted by matching badges, then normalized to integer percents
 * so the JSON stays float-free. `stats` (the already-mapped line) decides the
 * playstyle label. Pure; reused by the offline bake script (no app/runtime deps).
 */
export function deriveTendency(
  raw: RawRatings,
  badges: readonly string[],
  stats: PlayerStats,
  position: Position
): BakedTendency {
  const a = (keys: string[], fb = 25): number => pick(raw, keys, fb);
  const lower = badges.map((b) => b.toLowerCase());
  const has = (...names: string[]): boolean =>
    names.some((nm) => lower.some((b) => b.includes(nm.toLowerCase())));
  const boost = (base: number, ...names: string[]): number => base * (has(...names) ? 1.25 : 1);

  const threePt = a(['threePointShot', 'three_point_shot']);
  const midR = a(['midRangeShot', 'mid_range_shot']);
  const postFade = a(['postFade'], 25);
  const postControl = a(['postControl', 'post_control'], 25);
  const postHook = a(['postHook'], 25);
  const closeShot = a(['closeShot', 'close_shot']);
  const dLayup = a(['drivingLayup', 'driving_layup', 'layup']);
  const dDunk = a(['drivingDunk', 'driving_dunk'], 25);
  const sDunk = a(['standingDunk', 'standing_dunk'], 25);
  const swb = a(['speedWithBall', 'speed_with_ball']);

  const lanes = {
    post: boost(rel(postControl, 45) + rel(postHook, 45) + rel(postFade, 45) * 0.6, 'Post', 'Hook', 'Backdown', 'Drop Step'),
    drive: boost(rel(dLayup, 30) * 0.5 + rel(swb, 40) * 0.5, 'Physical Finisher', 'Slithery', 'Handles'),
    layup: boost(rel(dLayup, 25) * 0.6 + rel(closeShot, 25) * 0.4, 'Layup', 'Float', 'Acrobat'),
    dunk: boost(rel(dDunk, 45) + rel(sDunk, 45), 'Posterizer', 'Aerial', 'Rise Up', 'Pogo', 'Dunk'),
    mid: rel(midR, 30) + rel(postFade, 40) * 0.4,
    three: boost(rel(threePt, 30), 'Deadeye', 'Limitless', 'Set Shot', 'Marksman', 'Shifty', 'Sniper'),
  };
  // A small floor on every lane so the diet is never degenerate (everyone takes a
  // few of each), then normalize to integer percents.
  const BASE = 4;
  const total =
    lanes.post + lanes.drive + lanes.layup + lanes.dunk + lanes.mid + lanes.three + BASE * 6 || 1;
  const pct = (x: number): number => Math.round(((x + BASE) / total) * 100);

  const handle = (a(['ballHandle', 'ball_handle']) + swb + a(['passVision', 'pass_vision', 'passIQ'])) / 3;

  return {
    shot: {
      post: pct(lanes.post),
      drive: pct(lanes.drive),
      layup: pct(lanes.layup),
      dunk: pct(lanes.dunk),
      mid: pct(lanes.mid),
      three: pct(lanes.three),
    },
    onBall: lean(handle),
    drawFoul: lean(a(['drawFoul', 'draw_foul'])),
    playstyle: derivePlaystyle(stats, position).id,
  };
}
