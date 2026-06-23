import type { PlayerStats } from '@/types/player';
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
 * ratings default to a neutral 5.
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
  };
}
