import { clamp } from './stat-scaling';

/**
 * The within-run opponent curve, now RELATIVE to the run's ladder class. Opponent
 * scaling reads a single float "level" derived from a node's absolute position in
 * the run, offset around the chosen ladder class's level (see src/game/classes.ts).
 *
 * The ramp opens a class BELOW the ladder on the first map and climbs to two
 * classes ABOVE at the final boss, smoothly and with no reset at map boundaries
 * (each boss is its map's local peak; the first game of the next map sits just
 * above the prior map's late games). On the S / S+ ladders the late ramp pushes
 * opponents into the S++ apex (stats past 10), which is why the difficulty band
 * ceiling in stat-scaling.ts allows values above 10.
 *
 * Pure and seedless: the curve is fully determined by the authored map shape plus
 * the run's ladder level and difficulty stat-shift.
 *
 * Keep these in sync with the authored map: RUN_MAPS = run-machine TOTAL_MAPS,
 * MAP_ROWS = run-map ROW_SIZES.length.
 */
const RUN_MAPS = 7;
const MAP_ROWS = 6;

/** Offset from the ladder level at the very first combat node (a class below). */
const RAMP_START = -1.0;
/** Offset from the ladder level at the final regular peak (~two classes above). */
const RAMP_END = 2.0;
/** A boss is its map's local peak: this much above its intra-map ramp. */
const BOSS_BUMP = 0.6;
/** >1 steepens the back half so the curve keeps pace with bounded meta power. */
const CURVE_POW = 1.15;

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
 * `ladderLevel` (classLevel of the selected ladder class). `statShift` lifts the
 * whole value (the difficulty's opponent stat-floor shift, applied at consumption).
 */
export function difficultyLevel(
  mapIndex: number,
  layer: number,
  isBoss: boolean,
  ladderLevel: number,
  statShift = 0
): number {
  const t = progressFraction(mapIndex, layer);
  const ramp = RAMP_START + (RAMP_END - RAMP_START) * Math.pow(t, CURVE_POW);
  return ladderLevel + ramp + (isBoss ? BOSS_BUMP : 0) + statShift;
}

/** The ramp's opening offset (a class below the ladder), shared so callers can
 * anchor economy math to the curve's start. */
export const DIFFICULTY_RAMP_START = RAMP_START;
