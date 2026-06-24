import { NBA_PLAYERS, NBA_LEGENDS, NBA_POOL, NBA_TEAMS } from '@/data/nba';
import type { NbaTeam, RealPlayer } from '@/types/nba';
import type { Player } from '@/types/player';
import { POSITION_ARCHETYPE, type RosterPlayer } from '@/types/roster';
import { classForOvr, ovr, type PlayerClass } from './ratings';
import type { RNG } from './rng';

/**
 * The real-player pools. Two tiers:
 *  - LEGENDS (90+, gold): the rare S+ crown jewels. They headline bosses (one per
 *    boss, from that boss's own franchise) and appear as on-loan recruit offers.
 *    Kept at their authored elite ratings, so fielding or facing one is a spike.
 *  - POOL (~575 current players, classes C/B/A/S): every franchise's real players,
 *    each carrying an `originalClass`. They staff opponents (class-scaled), seed
 *    the player's starting roster, and fill recruit/draft pools.
 *
 * Everything is driven by the seeded RNG, keeping sims deterministic.
 */

/** Wrap a baked real player as a deployable roster player (carries legendary +
 * ability + intrinsic class). */
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
    // Legends are S+; pool players carry a baked class; fall back to deriving it.
    originalClass:
      rp.originalClass ?? (rp.legendary ? 'S+' : classForOvr(ovr(rp.stats, rp.position))),
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
 * A franchise's real players (class-bucketed, not legendary). Pure data (no RNG):
 * callers scale these to the node's class/level before deploying, so the
 * difficulty curve is preserved while opponents wear real names, teams, and
 * jersey numbers.
 */
export function poolForTeam(teamAbbr: string): RealPlayer[] {
  return NBA_POOL.filter((p) => p.teamAbbr === teamAbbr);
}

/** Back-compat alias for the franchise pool (opponent staffing). */
export const modernStartersForTeam = poolForTeam;

/** Every real player of a given intrinsic class, for class-bucketed recruit/draft. */
export function poolByClass(cls: PlayerClass): RealPlayer[] {
  return NBA_POOL.filter((p) => (p.originalClass ?? classForOvr(ovr(p.stats, p.position))) === cls);
}

/** The keepable, free-agent-eligible reals (the whole class pool). */
export function freeAgentPool(): RealPlayer[] {
  return NBA_POOL;
}
