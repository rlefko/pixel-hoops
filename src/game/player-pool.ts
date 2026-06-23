import { NBA_PLAYERS, NBA_TEAMS } from '@/data/nba';
import type { NbaTeam, RealPlayer } from '@/types/nba';
import type { Player } from '@/types/player';
import {
  POSITION_ARCHETYPE,
  type Position,
  type RosterPlayer,
} from '@/types/roster';
import type { RNG } from './rng';

/**
 * The real-player pool. Every baked NBA player is a 90+ Legendary, so reals are
 * the rare, exciting crown jewels: they appear on opponents only on their real
 * franchise, on bosses as a guest all-time great, and as on-loan recruit offers.
 *
 * Legends keep their authored elite ratings (NOT round-scaled like procedural
 * fakes): that is exactly what makes facing or fielding one a genuine power
 * spike. Everything is driven by the seeded RNG, keeping sims deterministic.
 */

/** Wrap a baked real player as a deployable roster player (carries legendary + ability). */
export function realPlayerToRosterPlayer(rp: RealPlayer): RosterPlayer {
  const player: Player = {
    name: rp.name,
    archetype: POSITION_ARCHETYPE[rp.position],
    stats: rp.stats,
    level: 1,
    trainingXP: 0,
  };
  return {
    player,
    position: rp.position,
    jerseyNumber: rp.jerseyNumber,
    legendary: rp.legendary ?? false,
    ability: rp.ability,
  };
}

/** A random real franchise identity (name + colors). */
export function pickRealTeam(rng: RNG): NbaTeam {
  return rng.pick(NBA_TEAMS);
}

/**
 * A franchise legend at `position`, or null if that franchise has no legend
 * there. Unscaled (keeps elite ratings), so a real on their own team is a
 * mini-boss. Used for the rarity-gated legend slot on a regular opponent five.
 */
export function realPlayerAt(
  position: Position,
  rng: RNG,
  teamAbbr: string
): RosterPlayer | null {
  const matches = NBA_PLAYERS.filter(
    (p) => p.position === position && p.teamAbbr === teamAbbr
  );
  if (matches.length === 0) return null;
  return realPlayerToRosterPlayer(rng.pick(matches));
}

/**
 * A guest all-time legend (any team) at `position`, unscaled. Used to let a boss
 * field a marquee opponent in the later rounds, even off their own franchise.
 */
export function realLegendAt(position: Position, rng: RNG): RosterPlayer | null {
  const matches = NBA_PLAYERS.filter((p) => p.position === position);
  if (matches.length === 0) return null;
  return realPlayerToRosterPlayer(rng.pick(matches));
}

/**
 * A random legend (any position/team) as an on-loan recruit offer: unscaled and
 * flagged `onLoan`, so it is usable for the rest of the run but never kept.
 */
export function legendRecruit(rng: RNG): RosterPlayer {
  return { ...realPlayerToRosterPlayer(rng.pick(NBA_PLAYERS)), onLoan: true };
}
