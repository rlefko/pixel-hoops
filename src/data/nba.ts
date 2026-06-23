import type { PlayerStats } from '@/types/player';
import type { NbaTeam, RealPlayer } from '@/types/nba';
import { expandStats, isLegacyStats } from '@/game/stat-migration';
import teams from './nba-teams.json';
import players from './nba-players.json';

/**
 * Typed access to the baked NBA dataset. The JSON is produced offline by
 * scripts/fetch-nba.ts (or hand-curated); this module is the single import
 * point the game uses so the raw JSON shape stays in one place.
 *
 * The shipped JSON predates the ten-rating model (it holds the legacy four
 * stats), so each player is normalized through expandStats on load. A future
 * re-bake through nba-map.ts writes full ten-rating stats, which pass through
 * untouched (isLegacyStats returns false). No runtime API calls.
 */

type RawPlayer = Omit<RealPlayer, 'stats'> & { stats: unknown };

export const NBA_TEAMS = teams as NbaTeam[];
export const NBA_PLAYERS: RealPlayer[] = (players as unknown as RawPlayer[]).map(
  (p) => ({
    ...p,
    stats: isLegacyStats(p.stats)
      ? expandStats(p.stats, p.position)
      : (p.stats as PlayerStats),
  })
);

export function teamByAbbr(abbr: string): NbaTeam | undefined {
  return NBA_TEAMS.find((t) => t.abbreviation === abbr);
}
