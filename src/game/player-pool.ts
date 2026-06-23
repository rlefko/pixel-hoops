import { NBA_PLAYERS, NBA_LEGENDS, NBA_STARTERS, NBA_TEAMS } from '@/data/nba';
import type { NbaTeam, RealPlayer } from '@/types/nba';
import type { Player } from '@/types/player';
import { POSITION_ARCHETYPE, type RosterPlayer } from '@/types/roster';
import type { RNG } from './rng';

/**
 * The real-player pools. Two tiers:
 *  - LEGENDS (90+, gold): the rare crown jewels. They headline bosses (one per
 *    boss, from that boss's own franchise) and appear as on-loan recruit offers.
 *    Kept at their authored elite ratings (NOT round-scaled), so fielding or
 *    facing one is a genuine power spike.
 *  - STARTERS (sub-90): every franchise's real modern five. They staff regular
 *    opponents (round-scaled) and seed the player's free-agent roster.
 *
 * Everything is driven by the seeded RNG, keeping sims deterministic.
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
 * A random legend (any position/team) as an on-loan recruit offer: unscaled and
 * flagged `onLoan`, so it is usable for the rest of the run but never kept.
 */
export function legendRecruit(rng: RNG): RosterPlayer {
  return { ...realPlayerToRosterPlayer(rng.pick(NBA_PLAYERS)), onLoan: true };
}

/**
 * That franchise's all-time legend (any position), unscaled, picking one at
 * random when a team has several. Every team is covered in the dataset, so the
 * null return is a defensive fallback. Used to guarantee each boss fields a
 * marquee opponent from its OWN franchise.
 */
export function legendForTeam(teamAbbr: string, rng: RNG): RosterPlayer | null {
  const matches = NBA_LEGENDS.filter((p) => p.teamAbbr === teamAbbr);
  if (matches.length === 0) return null;
  return realPlayerToRosterPlayer(rng.pick(matches));
}

/**
 * A franchise's modern role-player starters (sub-90, not legendary). Pure data
 * (no RNG): callers round-scale these before deploying, so the difficulty curve
 * is preserved while opponents wear real names, teams, and jersey numbers.
 */
export function modernStartersForTeam(teamAbbr: string): RealPlayer[] {
  return NBA_STARTERS.filter((p) => p.teamAbbr === teamAbbr);
}

/** The keepable, free-agent-eligible reals (every modern starter). */
export function freeAgentPool(): RealPlayer[] {
  return NBA_STARTERS;
}
