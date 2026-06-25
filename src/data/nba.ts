import type { PlayerStats } from '@/types/player';
import type { NbaTeam, RealPlayer } from '@/types/nba';
import { backfillPlayStyleStats, expandStats, isLegacyStats } from '@/game/stat-migration';
import teams from './nba-teams.json';
import legends from './nba-legends.json';
import pool from './nba-pool.json';

/**
 * Typed access to the baked NBA dataset, split into two pools so the rare
 * "legend" tier can never bleed into the bulk class pool (and vice versa):
 *
 *  - NBA_LEGENDS  all-time greats (90+): the S+ tier, gold, boss/on-loan only.
 *  - NBA_POOL     ~575 current players, each baked with an `originalClass`
 *                 (C/B/A/S) and stats anchored into that class band. The
 *                 draftable / recruitable / opponent-staffing population.
 *
 * Both files are produced offline by scripts/fetch-nba.ts (legends via --mode=
 * legends, the pool via --mode=pool); this module is the single import point so
 * the raw JSON shape stays in one place. Legacy four-stat lines are normalized
 * through expandStats on load; the curated/baked ten-rating lines pass through
 * untouched. No runtime API calls.
 */

type RawPlayer = Omit<RealPlayer, 'stats'> & { stats: unknown };

function normalize(p: RawPlayer): RealPlayer {
  const stats = isLegacyStats(p.stats)
    ? expandStats(p.stats, p.position)
    : (p.stats as PlayerStats);
  // Backfill any play-style ratings missing from a line baked before the
  // expansion (a no-op once the dataset is re-baked with the four new keys).
  return { ...p, stats: backfillPlayStyleStats(stats, p.position) };
}

export const NBA_TEAMS = teams as NbaTeam[];

/** All-time legends (90+): rare, gold, the S+ boss + on-loan recruit tier. */
export const NBA_LEGENDS: RealPlayer[] = (
  legends as unknown as RawPlayer[]
).map(normalize);

/** The class-bucketed current-player pool (C/B/A/S): the draftable / recruitable
 * / opponent-staffing population. Each carries an `originalClass`. */
export const NBA_POOL: RealPlayer[] = (
  pool as unknown as RawPlayer[]
).map(normalize);

/**
 * Back-compat alias: the historic `NBA_PLAYERS` name IS the legend pool, so the
 * legend-only helpers in player-pool.ts (legendRecruit, legendForTeam) keep
 * drawing legends-only by construction.
 */
export const NBA_PLAYERS = NBA_LEGENDS;

export function teamByAbbr(abbr: string): NbaTeam | undefined {
  return NBA_TEAMS.find((t) => t.abbreviation === abbr);
}
