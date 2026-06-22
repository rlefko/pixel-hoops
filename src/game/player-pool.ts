import { NBA_PLAYERS, NBA_TEAMS } from '@/data/nba';
import type { NbaTeam, RealPlayer } from '@/types/nba';
import type { Player } from '@/types/player';
import {
  POSITION_ARCHETYPE,
  type Position,
  type RosterPlayer,
} from '@/types/roster';
import type { RNG } from './rng';
import { scaleStatsToRound } from './stat-scaling';

/**
 * The real-player pool. Mixes the baked NBA dataset (historical + modern) into
 * opponent squads and recruit offers so the run is populated with real teams
 * and likenesses alongside the procedural streetball players (tournament.ts).
 *
 * Real players are scaled into the current round's range like fakes, so they
 * bring identity (name, team, jersey) without breaking difficulty balance.
 * Everything is driven by the seeded RNG, keeping sims deterministic.
 */

/** Wrap a baked real player as a deployable roster player. */
export function realPlayerToRosterPlayer(rp: RealPlayer): RosterPlayer {
  const player: Player = {
    name: rp.name,
    archetype: POSITION_ARCHETYPE[rp.position],
    stats: rp.stats,
    level: 1,
    trainingXP: 0,
  };
  return { player, position: rp.position, jerseyNumber: rp.jerseyNumber };
}

/** Scale a roster player's stats into the round (returns a fresh copy). */
function scaledToRound(
  rp: RosterPlayer,
  round: number,
  rng: RNG
): RosterPlayer {
  return {
    ...rp,
    player: {
      ...rp.player,
      stats: scaleStatsToRound(rp.player.stats, round, rng),
    },
  };
}

/** A random real franchise identity (name + colors). */
export function pickRealTeam(rng: RNG): NbaTeam {
  return rng.pick(NBA_TEAMS);
}

/** A real player at `position`, scaled to the round, or null if none exist. */
export function realPlayerAt(
  position: Position,
  round: number,
  rng: RNG
): RosterPlayer | null {
  const matches = NBA_PLAYERS.filter((p) => p.position === position);
  if (matches.length === 0) return null;
  return scaledToRound(realPlayerToRosterPlayer(rng.pick(matches)), round, rng);
}

/** A random real player (any position) as a recruit offer, scaled to round. */
export function realRecruit(round: number, rng: RNG): RosterPlayer {
  return scaledToRound(realPlayerToRosterPlayer(rng.pick(NBA_PLAYERS)), round, rng);
}
