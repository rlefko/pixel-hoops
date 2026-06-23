import type { PlayerStats } from '@/types/player';
import type { RosterPlayer } from '@/types/roster';
import type { Lineup, Team, TeamStats, SynergyResult } from '@/types/team';
import type { GamePlan } from '@/types/tactics';
import { computeSynergy } from './synergy';
import { off, def } from './ratings';

/**
 * Lineup math: turns five players into the single effective stat line the
 * simulation resolves against, plus the usage weights that decide who is
 * credited for each bucket. Modeling 5-on-5 as a weighted aggregate keeps the
 * sim cheap and deterministic while making roster construction matter (see
 * docs/gameplay-redesign.md). All pure, no RNG.
 */

const LINEUP_SIZE = 5;

/** Clamp a derived stat to a sane range so bonuses cannot run away. */
function clampStat(value: number): number {
  return Math.max(1, Math.min(14, value));
}

export function validateLineup(players: RosterPlayer[]): {
  ok: boolean;
  reason?: string;
} {
  if (players.length !== LINEUP_SIZE) {
    return { ok: false, reason: `A lineup needs exactly ${LINEUP_SIZE} players` };
  }
  return { ok: true };
}

/**
 * Possession-share weights (sum to 1). Base load blends the offensive stats;
 * guards handle the ball a touch more, and a designated star gets a bump.
 */
export function computeUsageWeights(
  players: RosterPlayer[],
  tactic: GamePlan
): number[] {
  const raw = players.map((rp, index) => {
    const s = rp.player.stats;
    let load = s.outside + s.inside + s.playmaking * 0.7 + s.clutch * 0.5;
    if (rp.position === 'PG' || rp.position === 'SG') load += 2; // ball handlers
    if (tactic.starPlayerIndex === index) load *= 1.6; // feature the star
    return Math.max(0.1, load);
  });

  const total = raw.reduce((sum, w) => sum + w, 0);
  return raw.map((w) => w / total);
}

/** Usage-weighted average of one stat across the lineup. */
function weightedStat(
  players: RosterPlayer[],
  weights: number[],
  key: keyof PlayerStats
): number {
  return players.reduce((sum, rp, i) => sum + rp.player.stats[key] * weights[i], 0);
}

/** Simple average of one stat across the lineup. */
function averageStat(players: RosterPlayer[], key: keyof PlayerStats): number {
  return players.reduce((sum, rp) => sum + rp.player.stats[key], 0) / players.length;
}

/** Defensive anchor: blend the average with the best defender (rim/wing stopper). */
function anchoredStat(players: RosterPlayer[], key: keyof PlayerStats): number {
  const avg = averageStat(players, key);
  const best = Math.max(...players.map((rp) => rp.player.stats[key]));
  return avg * 0.6 + best * 0.4;
}

/**
 * The lineup's effective stat line. Not a flat average: scorers (high usage)
 * weight the offensive ratings, defense is anchored by the best stopper, pace
 * comes from athleticism plus synergy and the pace tactic. Callable on any five
 * so the engine can recompute it after a substitution.
 */
export function computeTeamStats(
  players: RosterPlayer[],
  weights: number[],
  synergy: SynergyResult,
  tactic: GamePlan
): TeamStats {
  const avgAth = averageStat(players, 'athleticism');
  const paceTacticMod = tactic.pace === 'fast' ? 1.5 : tactic.pace === 'slow' ? -1.5 : 0;
  const athTacticMod = tactic.pace === 'fast' ? 1 : tactic.pace === 'slow' ? -1 : 0;

  const stats: TeamStats = {
    // Scorers carry the offensive load (usage-weighted).
    inside: clampStat(weightedStat(players, weights, 'inside') + synergy.offenseBonus),
    outside: clampStat(weightedStat(players, weights, 'outside') + synergy.offenseBonus),
    playmaking: clampStat(weightedStat(players, weights, 'playmaking')),
    // Defense is anchored by the best stopper, not the average.
    perimeterD: clampStat(anchoredStat(players, 'perimeterD') + synergy.defenseBonus),
    interiorD: clampStat(anchoredStat(players, 'interiorD') + synergy.defenseBonus),
    athleticism: clampStat(avgAth + athTacticMod),
    iq: clampStat(averageStat(players, 'iq')),
    clutch: clampStat(averageStat(players, 'clutch') + synergy.clutchBonus),
    stamina: clampStat(averageStat(players, 'stamina')),
    durability: clampStat(averageStat(players, 'durability')),
    pace: clampStat(avgAth + synergy.paceBonus + paceTacticMod),
    off: 0,
    def: 0,
    ovr: 0,
  };
  stats.off = off(stats);
  stats.def = def(stats);
  stats.ovr = Math.round((stats.off + stats.def) / 2);
  return stats;
}

/**
 * Assemble a full {@link Team} from a starting five, optional bench, and a game
 * plan: computes synergy, usage weights, and the effective stat line in one
 * place so the sim setup (and tests) have a single entry point. The bench feeds
 * in-game rotation; an empty bench means the five plays the whole game.
 */
export function buildTeam(
  name: string,
  players: RosterPlayer[],
  tactic: GamePlan,
  colorHex: string,
  accentHex: string,
  bench: RosterPlayer[] = []
): Team {
  const synergy = computeSynergy(players);
  const usageWeights = computeUsageWeights(players, tactic);
  const teamStats = computeTeamStats(players, usageWeights, synergy, tactic);
  const lineup: Lineup = { players, usageWeights };
  return { name, lineup, tactic, synergy, teamStats, bench, colorHex, accentHex };
}
