import type { NbaTeam, RealPlayer } from '@/types/nba';
import teams from './nba-teams.json';
import players from './nba-players.json';

/**
 * Typed access to the baked NBA dataset. The JSON is produced offline by
 * scripts/fetch-nba.ts (or hand-curated); this module is the single import
 * point the game uses so the raw JSON shape stays in one place.
 */

export const NBA_TEAMS = teams as NbaTeam[];
export const NBA_PLAYERS = players as RealPlayer[];

export function teamByAbbr(abbr: string): NbaTeam | undefined {
  return NBA_TEAMS.find((t) => t.abbreviation === abbr);
}
