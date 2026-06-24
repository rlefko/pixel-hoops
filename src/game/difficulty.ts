import { clamp } from './stat-scaling';

/**
 * The continuous difficulty curve. Opponent (and recruit) stat scaling reads a
 * single float "difficulty level" derived from a node's ABSOLUTE position in the
 * run, not just its map index. This is what fixes the old "every map starts weak"
 * feel: the previous curve keyed difficulty to map index only, so every regular
 * game in a map shared one flat level and each new map reset to barely above the
 * last. Here difficulty rises smoothly node to node across the whole run, each
 * boss is its map's local peak, and the first game of the next map sits just
 * above the prior map's late games rather than resetting.
 *
 * Pure and seedless: difficulty is fully determined by the authored map shape.
 *
 * Keep these in sync with the authored map: RUN_MAPS = run-machine TOTAL_MAPS,
 * MAP_ROWS = run-map ROW_SIZES.length. They change rarely (the map shape is
 * fixed) and duplicating them keeps this a dependency-free leaf module.
 */
const RUN_MAPS = 7;
const MAP_ROWS = 6;

/** Run-1 opener: about a fresh rookie roster's strength (player base ~5). */
const LEVEL_START = 5.0;
/** Final regular peak, before the boss bump (the final boss lands near 10). */
const LEVEL_END = 9.6;
/** A boss is its map's local peak: this much above its intra-map ramp. */
const BOSS_BUMP = 0.7;
/** >1 steepens the back half so the curve keeps pace with bounded meta power. */
const CURVE_POW = 1.15;

/**
 * Fraction of the run (0..1) a combat node sits at, blending map progress with an
 * intra-map ramp. Combat nodes live on rows 1..MAP_ROWS-1 (row 0 is the entry
 * recruit/boost pair); the ramp is normalized across that combat span so the
 * entry row does not waste curve budget. Each map owns a 1/RUN_MAPS slice and the
 * ramp fills it, so map N's late rows and map N+1's early rows stay continuous.
 */
function progressFraction(mapIndex: number, layer: number): number {
  const layerFrac = clamp((layer - 1) / (MAP_ROWS - 2), 0, 1);
  return (mapIndex + layerFrac) / RUN_MAPS;
}

/**
 * The difficulty level for a combat node at (mapIndex, layer). Bosses add a bump
 * so they peak above their map. `extraShift` lifts the whole value (the League
 * Tier ladder feeds an opponent stat-floor shift here at consumption time).
 */
export function difficultyLevel(
  mapIndex: number,
  layer: number,
  isBoss: boolean,
  extraShift = 0
): number {
  const t = progressFraction(mapIndex, layer);
  const base = LEVEL_START + (LEVEL_END - LEVEL_START) * Math.pow(t, CURVE_POW);
  return base + (isBoss ? BOSS_BUMP : 0) + extraShift;
}

/** The curve's opening level, shared so callers can anchor economy math to it. */
export const DIFFICULTY_START = LEVEL_START;
