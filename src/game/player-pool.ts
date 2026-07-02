import { NBA_PLAYERS, NBA_LEGENDS, NBA_POOL, NBA_TEAMS } from '@/data/nba';
import type { NbaTeam, RealPlayer } from '@/types/nba';
import type { Player } from '@/types/player';
import { POSITION_ARCHETYPE, nameKey, type RosterPlayer } from '@/types/roster';
import { classForOvr, ovr, type PlayerClass } from './ratings';
import { tendencyFromBaked } from './playstyle';
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
    // Convert the baked shot diet to a runtime profile; absent for older bakes,
    // in which case the sim derives one from the stats (see playstyle.tendencyFor).
    tendency: rp.tendency ? tendencyFromBaked(rp.tendency) : undefined,
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

/** The home favor ledger filtered to legend keys, snapshotted at run start to bias
 * the once-per-run reveal. Small (only legends with favor) and read-only. */
export function legendFavorSnapshot(
  favor: Readonly<Record<string, number>>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of NBA_PLAYERS) {
    const key = nameKey(p.name, p.position);
    const points = favor[key];
    if (typeof points === 'number' && points > 0) out[key] = points;
  }
  return out;
}

/**
 * The favor-steered legend reveal: the highest-favor UN-OWNED legend walks in, so the
 * legend a player ran (and maybe lost) with becomes their standing front-runner. When
 * the reveal fires stays chance-and-pity (run-machine's gate); only WHO is earned.
 * Zero favor everywhere reduces to today's uniform pick among the un-owned (a single
 * seeded draw either way, so replays and resumes stay stable).
 */
export function legendRecruitFavored(
  ownedLegendKeys: readonly string[],
  legendFavor: Readonly<Record<string, number>>,
  rng: RNG
): RosterPlayer {
  const owned = new Set(ownedLegendKeys);
  const unowned = NBA_PLAYERS.filter((p) => !owned.has(nameKey(p.name, p.position)));
  const pool = unowned.length > 0 ? unowned : NBA_PLAYERS;
  let best = 0;
  for (const p of pool) best = Math.max(best, legendFavor[nameKey(p.name, p.position)] ?? 0);
  const top =
    best > 0 ? pool.filter((p) => (legendFavor[nameKey(p.name, p.position)] ?? 0) === best) : pool;
  return { ...realPlayerToRosterPlayer(rng.pick(top)), onLoan: true };
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
