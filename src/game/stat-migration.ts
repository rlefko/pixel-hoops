import { STAT_MIN, STAT_NORMAL_MAX, type PlayerStats } from '@/types/player';
import type { Position } from '@/types/roster';

/**
 * Forward migration from the legacy four-stat model to the ten-rating model.
 * The baked NBA dataset and any saved rosters predate the expansion, and a full
 * re-bake needs an API key that is not available at runtime or in CI. This
 * module deterministically projects {shooting, speed, athleticism, clutch} +
 * position into the ten ratings so the app plays correctly with no re-bake. A
 * later re-bake through nba-map.ts supersedes it with full-fidelity values.
 *
 * Pure and RNG-free so it is idempotent and stable across reloads.
 */

/** The retired four-stat shape. */
export interface LegacyStats {
  shooting: number;
  speed: number;
  athleticism: number;
  clutch: number;
}

const GUARD_POSITIONS: readonly Position[] = ['PG', 'SG'];
const BIG_POSITIONS: readonly Position[] = ['PF', 'C'];

function clamp(value: number): number {
  return Math.max(3, Math.min(10, Math.round(value)));
}

/**
 * True when `s` is a legacy four-stat line (has `shooting`/`speed` but lacks the
 * new `outside`). Lets callers run migration only on old data; already-expanded
 * stats pass through untouched.
 */
export function isLegacyStats(s: unknown): s is LegacyStats {
  if (!s || typeof s !== 'object') return false;
  const r = s as Record<string, unknown>;
  return (
    typeof r.shooting === 'number' &&
    typeof r.speed === 'number' &&
    r.outside === undefined
  );
}

/**
 * Project a legacy four-stat line into the ten-rating model, position-aware.
 * Lossy but sensible: `outside` inherits the old jumper-heavy `shooting`,
 * `inside` blends shooting and athleticism, guards keep `speed` as playmaking,
 * bigs anchor `interiorD` on athleticism, and IQ leans off clutch. Condition
 * ratings default to a neutral 5; play-style ratings are position-aware so a
 * migrated big still blocks and rebounds and a migrated guard still steals.
 */
export function expandStats(old: LegacyStats, position: Position): PlayerStats {
  const isGuard = GUARD_POSITIONS.includes(position);
  const isBig = BIG_POSITIONS.includes(position);
  return {
    inside: clamp((old.shooting + old.athleticism) / 2),
    outside: clamp(old.shooting),
    playmaking: clamp(isGuard ? old.speed : (old.speed + old.shooting) / 2),
    perimeterD: clamp((old.speed + old.athleticism) / 2),
    interiorD: clamp(isBig ? old.athleticism : (old.athleticism + 5) / 2),
    athleticism: clamp(old.athleticism),
    iq: clamp((old.clutch + 5) / 2),
    clutch: clamp(old.clutch),
    stamina: 5,
    durability: 5,
    blocking: clamp(isBig ? old.athleticism : isGuard ? 4 : (old.athleticism + 4) / 2),
    stealing: clamp(isGuard ? old.speed : isBig ? 4 : (old.speed + 4) / 2),
    strength: clamp(isBig ? old.athleticism : isGuard ? 4 : 5),
    rebounding: clamp(isBig ? old.athleticism : isGuard ? 4 : (old.athleticism + 4) / 2),
  };
}

/** Clamp a backfilled play-style rating into the normal pool band [6, 20]. */
function clampNormal(value: number): number {
  return Math.max(STAT_MIN, Math.min(STAT_NORMAL_MAX, Math.round(value)));
}

/**
 * Fill any missing play-style ratings (blocking/stealing/strength/rebounding) on
 * a widened-scale line, position-aware, so data baked before the play-style
 * expansion (or any partial save) never reads `undefined` -> NaN in the sim. A
 * full re-bake through nba-map.ts supplies real 2K-derived values; this is the
 * safety net and a no-op once all four keys are present. Each key is filled
 * independently so a partially-baked line keeps its real values.
 */
export function backfillPlayStyleStats(stats: PlayerStats, position: Position): PlayerStats {
  const isGuard = GUARD_POSITIONS.includes(position);
  const isBig = BIG_POSITIONS.includes(position);
  return {
    ...stats,
    blocking:
      stats.blocking ??
      clampNormal(isBig ? stats.interiorD : isGuard ? 8 : (stats.interiorD + 8) / 2),
    stealing:
      stats.stealing ??
      clampNormal(isGuard ? stats.perimeterD : isBig ? 8 : (stats.perimeterD + 8) / 2),
    strength:
      stats.strength ??
      clampNormal(isBig ? (stats.inside + stats.interiorD) / 2 : isGuard ? 8 : 10),
    rebounding:
      stats.rebounding ??
      clampNormal(isBig ? stats.interiorD : isGuard ? 8 : (stats.interiorD + 8) / 2),
  };
}
