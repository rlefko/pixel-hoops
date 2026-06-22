import type { PlayerStats } from '@/types/player';
import type { RosterPlayer } from '@/types/roster';
import type { Lineup, Team, TeamStats, SynergyResult } from '@/types/team';
import type { GamePlan } from '@/types/tactics';
import { computeSynergy } from './synergy';

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
    let load = s.shooting + s.athleticism + s.clutch * 0.5;
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

/**
 * The lineup's effective stat line. Not a flat average: scorers (high usage)
 * weight shooting, the rim is anchored by the best athlete on defense, pace
 * comes from team speed plus synergy and the pace tactic.
 */
export function computeTeamStats(
  players: RosterPlayer[],
  weights: number[],
  synergy: SynergyResult,
  tactic: GamePlan
): TeamStats {
  const avgAth = averageStat(players, 'athleticism');
  const maxAth = Math.max(...players.map((rp) => rp.player.stats.athleticism));
  const avgSpeed = averageStat(players, 'speed');

  const paceTacticMod = tactic.pace === 'fast' ? 1.5 : tactic.pace === 'slow' ? -1.5 : 0;

  return {
    shooting: clampStat(weightedStat(players, weights, 'shooting') + synergy.offenseBonus),
    speed: clampStat(avgSpeed + (tactic.pace === 'fast' ? 1 : tactic.pace === 'slow' ? -1 : 0)),
    // Rim protection leans on the best big, not the average.
    athleticism: clampStat(avgAth * 0.6 + maxAth * 0.4 + synergy.defenseBonus),
    clutch: clampStat(averageStat(players, 'clutch') + synergy.clutchBonus),
    pace: clampStat(avgSpeed + synergy.paceBonus + paceTacticMod),
  };
}

/**
 * Assemble a full {@link Team} from five players and a game plan: computes
 * synergy, usage weights, and the effective stat line in one place so the sim
 * setup (and tests) have a single entry point.
 */
export function buildTeam(
  name: string,
  players: RosterPlayer[],
  tactic: GamePlan,
  colorHex: string,
  accentHex: string
): Team {
  const synergy = computeSynergy(players);
  const usageWeights = computeUsageWeights(players, tactic);
  const teamStats = computeTeamStats(players, usageWeights, synergy, tactic);
  const lineup: Lineup = { players, usageWeights };
  return { name, lineup, tactic, synergy, teamStats, colorHex, accentHex };
}
