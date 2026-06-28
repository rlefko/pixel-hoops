import type { PlayerStats } from '@/types/player';
import type { RosterPlayer } from '@/types/roster';
import type { Lineup, Team, TeamStats, SynergyResult } from '@/types/team';
import type { GamePlan } from '@/types/tactics';
import { computeSynergy } from './synergy';
import { off, def } from './ratings';
import { STAT_CEIL, STAT_NORMAL_MAX, clamp } from './stat-scaling';
import { EMPTY_TEAM_MODIFIER, type StatDelta, type TeamModifier } from './effects';

/**
 * Lineup math: turns five players into the single effective stat line the
 * simulation resolves against, plus the usage weights that decide who is
 * credited for each bucket. Modeling 5-on-5 as a weighted aggregate keeps the
 * sim cheap and deterministic while making roster construction matter (see
 * docs/gameplay-redesign.md). All pure, no RNG.
 */

const LINEUP_SIZE = 5;

/** Clamp a derived stat to a sane range so bonuses cannot run away. The floor sits
 * a little below the player floor (deliberate slack); the ceiling is the apex band
 * so synergy/auras can push an aggregate above the normal cap. */
function clampStat(value: number): number {
  return Math.max(2, Math.min(STAT_CEIL, value));
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
    if (rp.position === 'PG' || rp.position === 'SG') load += 4; // ball handlers
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

/** Outside rating at or above which a player credibly stretches the defense. */
const SHOOTER_THRESHOLD = 13;

/** Share of the five who are credible floor-spacers, 0 (clogged) to 1 (five-out). */
function shooterShare(players: RosterPlayer[]): number {
  const shooters = players.filter((rp) => rp.player.stats.outside >= SHOOTER_THRESHOLD).length;
  return players.length ? shooters / players.length : 0;
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
  tactic: GamePlan,
  modifier: TeamModifier = EMPTY_TEAM_MODIFIER
): TeamStats {
  const avgAth = averageStat(players, 'athleticism');
  const paceTacticMod = tactic.pace === 'fast' ? 3 : tactic.pace === 'slow' ? -3 : 0;
  const athTacticMod = tactic.pace === 'fast' ? 2 : tactic.pace === 'slow' ? -2 : 0;

  // Flat per-rating deltas the modifier carries (team-wide boosts/auras). An
  // empty modifier (the default) makes every term below a no-op, so a team with
  // no boosts/abilities resolves identically to before.
  const ex = (key: keyof StatDelta): number => modifier.extra[key] ?? 0;

  const stats: TeamStats = {
    // Scorers carry the offensive load (usage-weighted).
    inside: clampStat(weightedStat(players, weights, 'inside') + synergy.offenseBonus + modifier.offenseBonus + ex('inside')),
    outside: clampStat(weightedStat(players, weights, 'outside') + synergy.offenseBonus + modifier.offenseBonus + ex('outside')),
    playmaking: clampStat(weightedStat(players, weights, 'playmaking') + ex('playmaking')),
    // Defense is anchored by the best stopper, not the average.
    perimeterD: clampStat(anchoredStat(players, 'perimeterD') + synergy.defenseBonus + modifier.defenseBonus + ex('perimeterD')),
    interiorD: clampStat(anchoredStat(players, 'interiorD') + synergy.defenseBonus + modifier.defenseBonus + ex('interiorD')),
    athleticism: clampStat(avgAth + athTacticMod + ex('athleticism')),
    iq: clampStat(averageStat(players, 'iq') + ex('iq')),
    clutch: clampStat(averageStat(players, 'clutch') + synergy.clutchBonus + modifier.clutchBonus + ex('clutch')),
    stamina: clampStat(averageStat(players, 'stamina') + ex('stamina')),
    durability: clampStat(averageStat(players, 'durability') + ex('durability')),
    // Play-style aggregates set the EVENT RATE (block/steal gates, rebound split).
    // Blocking/rebounding/stealing anchor on the best (one rim protector, glass
    // cleaner, or ball hawk defines the unit, like defense); strength is a team-
    // wide average. These never feed off/def/pace below: the recipient of each
    // box-score event is chosen from individual on-court stats in the sim.
    blocking: clampStat(anchoredStat(players, 'blocking') + ex('blocking')),
    stealing: clampStat(anchoredStat(players, 'stealing') + ex('stealing')),
    strength: clampStat(averageStat(players, 'strength') + ex('strength')),
    rebounding: clampStat(anchoredStat(players, 'rebounding') + ex('rebounding')),
    pace: clampStat(avgAth + synergy.paceBonus + modifier.paceBonus + paceTacticMod),
    off: 0,
    def: 0,
    ovr: 0,
    // Fit scalars (see src/game/simulation.ts): credible-shooter share and
    // playmaking depth. Computed once per five (and on each sub), pure.
    spacing: shooterShare(players),
    creation: clamp(averageStat(players, 'playmaking') / STAT_NORMAL_MAX, 0, 1),
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
  bench: RosterPlayer[] = [],
  modifier: TeamModifier = EMPTY_TEAM_MODIFIER
): Team {
  const synergy = computeSynergy(players);
  const usageWeights = computeUsageWeights(players, tactic);
  const teamStats = computeTeamStats(players, usageWeights, synergy, tactic, modifier);
  const lineup: Lineup = { players, usageWeights };
  return { name, lineup, tactic, synergy, modifier, teamStats, bench, colorHex, accentHex };
}
