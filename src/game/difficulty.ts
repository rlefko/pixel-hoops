import { clamp } from './stat-scaling';

/**
 * The within-run opponent curve, now RELATIVE to the run's ladder class. Opponent
 * scaling reads a single float "level" derived from a node's absolute position in
 * the run, offset around the chosen ladder class's level (see src/game/classes.ts).
 *
 * The ramp opens a class or two BELOW the ladder on the first map and climbs toward
 * the difficulty's `rampEnd` at the final regular peak (the boss adds BOSS_BUMP on
 * top), smoothly and with no reset at map boundaries (each boss is its map's local
 * peak; the first game of the next map sits just above the prior map's late games).
 * The ramp ENDPOINTS are the difficulty's
 * main lever (see src/game/difficulty-mode.ts): the early game stays similar across
 * difficulties, but easy ends near the ladder class while insane ends ~two classes
 * above. On the harder S / S+ ladders the late ramp pushes opponents into the S++
 * apex (stats past 20), which is why the difficulty band ceiling in stat-scaling.ts
 * allows values above the normal cap.
 *
 * Pure and seedless: the curve is fully determined by the authored map shape plus
 * the run's ladder level and the difficulty's ramp endpoints.
 *
 * Keep these in sync with the authored map: RUN_MAPS = run-machine TOTAL_MAPS,
 * MAP_ROWS = run-map ROW_SIZES.length.
 */
const RUN_MAPS = 7;
const MAP_ROWS = 6;

/** A boss is its map's local peak: this much above its intra-map ramp. */
const BOSS_BUMP = 1.2;
/** >1 steepens the back half so the curve keeps pace with bounded meta power. */
const CURVE_POW = 1.15;
/** Cap on the opponent level. Keeps the S++ apex band a real [26,28] spread rather
 * than collapsing to a single value at the very top of the S+ ladder on insane. */
const MAX_OPP_LEVEL = 27.0;

/**
 * Fraction of the run (0..1) a combat node sits at, blending map progress with an
 * intra-map ramp. Combat nodes live on rows 1..MAP_ROWS-1 (row 0 is the entry
 * recruit/boost pair); the ramp is normalized across that combat span so the
 * entry row does not waste curve budget, keeping map N's late rows and map N+1's
 * early rows continuous.
 */
function progressFraction(mapIndex: number, layer: number): number {
  const layerFrac = clamp((layer - 1) / (MAP_ROWS - 2), 0, 1);
  return (mapIndex + layerFrac) / RUN_MAPS;
}

/**
 * The opponent level for a combat node at (mapIndex, layer), relative to the run's
 * `ladderLevel` (classLevel of the selected ladder class). `rampStart`/`rampEnd` are
 * the difficulty's ramp endpoints (see src/game/difficulty-mode.ts), so the same node
 * is gentler on easy and harsher on insane without changing the ladder it centers on.
 */
export function difficultyLevel(
  mapIndex: number,
  layer: number,
  isBoss: boolean,
  ladderLevel: number,
  rampStart: number,
  rampEnd: number
): number {
  const t = progressFraction(mapIndex, layer);
  const ramp = rampStart + (rampEnd - rampStart) * Math.pow(t, CURVE_POW);
  const level = ladderLevel + ramp + (isBoss ? BOSS_BUMP : 0);
  return Math.min(level, MAX_OPP_LEVEL);
}
