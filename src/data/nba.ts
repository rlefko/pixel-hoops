import type { PlayerStats } from '@/types/player';
import type { NbaTeam, RealPlayer } from '@/types/nba';
import { expandStats, isLegacyStats } from '@/game/stat-migration';
import teams from './nba-teams.json';
import legends from './nba-legends.json';
import starters from './nba-starters.json';

/**
 * Typed access to the baked NBA dataset, split into two pools so the rare
 * "legend" tier can never bleed into the bulk "starter" tier (and vice versa):
 *
 *  - NBA_LEGENDS  all-time greats (90+): gold, unscaled, boss/on-loan only.
 *  - NBA_STARTERS modern role-player starters (sub-90): round-scaled opponents
 *                 and keepable free agents.
 *
 * Both files are produced offline by scripts/fetch-nba.ts (or hand-curated);
 * this module is the single import point so the raw JSON shape stays in one
 * place. Legacy four-stat lines are normalized through expandStats on load; the
 * curated ten-rating lines pass through untouched. No runtime API calls.
 */

type RawPlayer = Omit<RealPlayer, 'stats'> & { stats: unknown };

function normalize(p: RawPlayer): RealPlayer {
  return {
    ...p,
    stats: isLegacyStats(p.stats)
      ? expandStats(p.stats, p.position)
      : (p.stats as PlayerStats),
  };
}

export const NBA_TEAMS = teams as NbaTeam[];

/** All-time legends (90+): rare, gold, unscaled, boss + on-loan recruit only. */
export const NBA_LEGENDS: RealPlayer[] = (
  legends as unknown as RawPlayer[]
).map(normalize);

/** Modern starters (sub-90): round-scaled opponents and keepable free agents. */
export const NBA_STARTERS: RealPlayer[] = (
  starters as unknown as RawPlayer[]
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
