import type { Roster, RosterPlayer } from '@/types/roster';
import type { Team } from '@/types/team';
import type { Difficulty } from './difficulty-mode';
import type { CoachProfile } from './coaches';
import { ovrRaw, offRaw, defRaw } from './ratings';
import { deriveArchetype, counterEdge, archetypeLabel, Q_TO_RATING } from './team-archetype';

/**
 * The coach's lineup advisor: an optional, one-click recommendation surfaced between
 * games (never mid-game). It searches single lineup changes within the already-drafted
 * run roster (so it never spends budget and always validates), scores each against the
 * upcoming opponent with a cheap, deterministic matchup proxy, and returns the single
 * best beat-the-current-five swap, or null when there is no meaningful edge (so the
 * coach stays quiet). The coach's IQ controls how deep it looks; the difficulty-scaled
 * threshold controls when it speaks up, so easy runs are nearly silent and hard runs
 * surface real adjustments often.
 *
 * Pure: the team builder is INJECTED (so this never imports the run machine), and the
 * matchup proxy reuses the same off/def composites and archetype counter the sim
 * resolves against, so it tracks outcomes without running a single game. We surface a
 * qualitative edge (minor/solid/big), never a raw percentage, matching the game's
 * existing telegraphed matchup verdict.
 */

export interface CoachRec {
  /** Proposed slot-ordered five (feeds the existing setLineup as-is). */
  starters: RosterPlayer[];
  /** Proposed bench. */
  bench: RosterPlayer[];
  /** Qualitative strength of the suggested change. */
  edge: 'minor' | 'solid' | 'big';
  /** One-line description of the move for the banner. */
  summary: string;
}

export interface RecommendArgs {
  /** The current run roster (starters + bench). */
  roster: Roster;
  coach: CoachProfile;
  /** The upcoming opponent's built team (for the matchup proxy). */
  opponent: Team;
  /** Builds the player's home team for a candidate roster (injected by the run
   * machine so this stays a pure leaf). */
  buildHome: (roster: Roster) => Team;
  /** The difficulty-scaled gain (in rating points) below which nothing surfaces. */
  minDelta: number;
}

/** The matchup edge for the home side, in rating points (>0 favors home). Reuses the
 * sim's own off/def composites and the frozen archetype counter, so it correlates
 * with simulated outcomes by construction. */
function matchupScore(home: Team, away: Team): number {
  // Unrounded composites (not teamStats.off/def, which are integer-rounded) so the
  // search can discriminate subtle, sub-one-point lineup edges.
  const homeOff = offRaw(home.teamStats);
  const homeDef = defRaw(home.teamStats);
  const awayOff = offRaw(away.teamStats);
  const awayDef = defRaw(away.teamStats);
  const ratingEdge = homeOff - awayDef - (awayOff - homeDef);
  const ha = deriveArchetype(home);
  const aa = deriveArchetype(away);
  const counter = (counterEdge(ha, aa) - counterEdge(aa, ha)) * Q_TO_RATING;
  return ratingEdge + counter;
}

/** A small nudge so a strong coach prefers a swap that also commits the team to its
 * own system (unlocking the conditional system bonus), all else near equal. */
const SYSTEM_FIT_NUDGE = 0.2;

function edgeFor(delta: number): CoachRec['edge'] {
  return delta >= 2 ? 'big' : delta >= 1 ? 'solid' : 'minor';
}

function injured(rp: RosterPlayer): boolean {
  return (rp.gamesOut ?? 0) > 0;
}

interface Swap {
  roster: Roster;
  out: RosterPlayer;
  in: RosterPlayer;
}

/** Every single bench<->starter swap of healthy incoming players. */
function singleSwaps(roster: Roster): Swap[] {
  const swaps: Swap[] = [];
  for (let s = 0; s < roster.starters.length; s++) {
    for (let b = 0; b < roster.bench.length; b++) {
      const incoming = roster.bench[b];
      if (injured(incoming)) continue; // cannot start a hurt player
      const outgoing = roster.starters[s];
      const starters = roster.starters.slice();
      const bench = roster.bench.slice();
      starters[s] = incoming;
      bench[b] = outgoing;
      swaps.push({ roster: { starters, bench }, out: outgoing, in: incoming });
    }
  }
  return swaps;
}

/** A weak coach only sees a glaring upgrade: a bench player who clearly out-rates the
 * starter they would replace. (Injuries need no recommendation: the sim already
 * benches a hurt starter for the best healthy body via dressedRoster.) */
function isObvious(swap: Swap): boolean {
  const inVal = ovrRaw(swap.in.player.stats, swap.in.position);
  const outVal = ovrRaw(swap.out.player.stats, swap.out.position);
  return inVal - outVal >= 2;
}

function summarize(swap: Swap, opponent: Team): string {
  return `Start ${swap.in.player.name} over ${swap.out.player.name} vs their ${archetypeLabel(
    deriveArchetype(opponent)
  )}`;
}

/**
 * Recommend the single best one-click lineup change, or null if the coach has nothing
 * worth surfacing. IQ tiers the search: a low-IQ coach only flags obvious fixes, a
 * mid-IQ coach optimizes the matchup, a high-IQ coach also leans toward its own system
 * and speaks up on subtler edges.
 */
export function recommendLineup(args: RecommendArgs): CoachRec | null {
  const { roster, coach, opponent, buildHome, minDelta } = args;
  if (roster.bench.length === 0) return null;

  const tier = coach.iq <= 10 ? 'low' : coach.iq <= 15 ? 'mid' : 'high';
  const baseScore = matchupScore(buildHome(roster), opponent);
  const threshold = tier === 'high' ? minDelta * 0.8 : minDelta;

  let swaps = singleSwaps(roster);
  if (tier === 'low') swaps = swaps.filter(isObvious);

  let best: { swap: Swap; delta: number } | null = null;
  for (const swap of swaps) {
    const home = buildHome(swap.roster);
    let delta = matchupScore(home, opponent) - baseScore;
    if (tier === 'high' && coach.system.includes(deriveArchetype(home))) delta += SYSTEM_FIT_NUDGE;
    if (!best || delta > best.delta) best = { swap, delta };
  }

  if (!best || best.delta < threshold) return null;
  return {
    starters: best.swap.roster.starters,
    bench: best.swap.roster.bench,
    edge: edgeFor(best.delta),
    summary: summarize(best.swap, opponent),
  };
}

/**
 * The gain (in rating points) a recommendation must clear to surface, scaled so the
 * coach stays quiet on easy (where matchups are usually favorable) and speaks up often
 * on hard/insane (where unfavorable matchups dominate). Lowered further on the
 * higher-stakes elite/boss nodes.
 */
export function recMinDelta(difficulty: Difficulty, nodeType: 'game' | 'elite' | 'boss'): number {
  const base =
    difficulty === 'easy' ? 1.4 : difficulty === 'medium' ? 0.9 : difficulty === 'hard' ? 0.6 : 0.5;
  const nodeAdj = nodeType === 'boss' ? -0.3 : nodeType === 'elite' ? -0.2 : 0;
  return Math.max(0.3, base + nodeAdj);
}
