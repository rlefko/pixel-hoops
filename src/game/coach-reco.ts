import type { PlayerStats } from '@/types/player';
import { POSITIONS, nameKey, type Roster, type RosterPlayer } from '@/types/roster';
import type { Team } from '@/types/team';
import type { Difficulty } from './difficulty-mode';
import type { CoachProfile } from './coaches';
import { ovrRaw, offRaw, defRaw } from './ratings';
import { clamp } from './stat-scaling';
import { deriveArchetype, counterEdge, archetypeLabel, Q_TO_RATING } from './team-archetype';

/**
 * The coach's lineup advisor: an optional, one-click recommendation surfaced between
 * games (never mid-game). Accepting it reorders the WHOLE drafted run roster
 * (starters + bench), not just one swap, in the equipped coach's PLAYSTYLE: a
 * lockdown coach pushes stoppers into the five, an up-tempo coach favors athletic
 * shooters and a deeper bench, a star coach features a clear go-to scorer.
 *
 * The reorder is opinionated but not a solve (the Soren-Johnson "don't optimize the
 * fun out" guardrail): the search is tilted toward the coach's identity (a clamped
 * style bonus) on top of a cheap, deterministic matchup proxy, and the coach's IQ
 * gates how deep it looks and how subtle an edge it speaks up on. A weak coach makes
 * one blunt fix; a smart coach threads the matchup over several moves. The banner
 * surfaces only when the reorder genuinely improves the matchup by the
 * difficulty-scaled bar, so accepting never hurts and the player still owns the
 * final, matchup-specific tweak (the lineup builder stays one tap away).
 *
 * Pure: the team builder is INJECTED (so this never imports the run machine), and the
 * matchup proxy reuses the same off/def composites and archetype counter the sim
 * resolves against, so it tracks outcomes without running a single game. We surface a
 * qualitative edge (minor/solid/big), never a raw percentage.
 */

export interface CoachRec {
  /** Proposed slot-ordered five (feeds the existing setLineup as-is). */
  starters: RosterPlayer[];
  /** Proposed bench, ordered by rotation priority (best/most-in-style first). */
  bench: RosterPlayer[];
  /** Qualitative strength of the suggested change. */
  edge: 'minor' | 'solid' | 'big';
  /** How many starter slots change vs the current five (1 = a single swap). */
  changes: number;
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

// --- Matchup + style scoring ------------------------------------------------

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

/** Raw team quality (off + def composites), the matchup-free fallback when there is
 * no specific opponent to score against (the lineup-builder button outside a game). */
function rawQuality(home: Team): number {
  return offRaw(home.teamStats) + defRaw(home.teamStats);
}

/** A small nudge so a coach with a system prefers a five that commits to it
 * (unlocking the conditional system bonus), all else near equal. */
const SYSTEM_FIT_NUDGE = 0.2;
/** The 6-20 band midpoint; style leans measure distance from this. */
const BAND_MID = 13;
/** Style-tilt weights (rating points per stat-point of alignment), kept small and
 * clamped so the coach's identity tilts the choice without overriding a real matchup
 * edge: the reorder is opinionated, never self-sabotaging. */
const W_FOCUS = 0.15;
const W_PACE = 0.12;
const W_USAGE = 0.12;
const STYLE_CLAMP = 1.5;

function statMean(five: RosterPlayer[], key: keyof PlayerStats): number {
  if (five.length === 0) return 0;
  return five.reduce((s, rp) => s + rp.player.stats[key], 0) / five.length;
}

function teamDefenseMean(five: RosterPlayer[]): number {
  return (statMean(five, 'perimeterD') + statMean(five, 'interiorD')) / 2;
}

/** The top two position-weighted overalls in the five (for star vs egalitarian fit). */
function topTwoOvr(five: RosterPlayer[]): [number, number] {
  const vals = five.map((rp) => ovrRaw(rp.player.stats, rp.position)).sort((a, b) => b - a);
  return [vals[0] ?? 0, vals[1] ?? vals[0] ?? 0];
}

/**
 * How well a built five fits the coach's identity, in clamped rating points. Rewards
 * the coach's focus (lockdown -> team defense, inside/outside -> the matching
 * orientation), pace (fast -> athletic bodies, slow -> defense/grind), usage (star ->
 * a clear hierarchy, egalitarian -> parity), and a system match. Always on (the
 * coach's character), so the reorder leans toward its style regardless of IQ.
 */
function styleBonus(home: Team, coach: CoachProfile): number {
  const five = home.lineup.players;
  let bonus = 0;

  if (coach.prefFocus === 'lockdown') bonus += (teamDefenseMean(five) - BAND_MID) * W_FOCUS;
  else if (coach.prefFocus === 'inside')
    bonus += (statMean(five, 'inside') - statMean(five, 'outside')) * W_FOCUS;
  else if (coach.prefFocus === 'outside')
    bonus += (statMean(five, 'outside') - statMean(five, 'inside')) * W_FOCUS;

  if (coach.prefPace === 'fast') bonus += (statMean(five, 'athleticism') - BAND_MID) * W_PACE;
  else if (coach.prefPace === 'slow') bonus += (teamDefenseMean(five) - BAND_MID) * W_PACE;

  const [top, second] = topTwoOvr(five);
  if (coach.usage === 'star') bonus += (top - second) * W_USAGE;
  else if (coach.usage === 'egalitarian') bonus += (second - top) * W_USAGE;

  if (coach.system.length > 0 && coach.system.includes(deriveArchetype(home))) {
    bonus += SYSTEM_FIT_NUDGE;
  }
  return clamp(bonus, -STYLE_CLAMP, STYLE_CLAMP);
}

/** A player's value to this coach, for ordering the bench by rotation priority:
 * overall plus the coach's focus lean (a lockdown coach trusts a stopper sooner). */
function playerStyleValue(rp: RosterPlayer, coach: CoachProfile): number {
  const s = rp.player.stats;
  let lean = 0;
  if (coach.prefFocus === 'lockdown') lean = ((s.perimeterD + s.interiorD) / 2 - BAND_MID) * 0.3;
  else if (coach.prefFocus === 'inside') lean = (s.inside - BAND_MID) * 0.3;
  else if (coach.prefFocus === 'outside') lean = (s.outside - BAND_MID) * 0.3;
  return ovrRaw(s, rp.position) + lean;
}

// --- Search -----------------------------------------------------------------

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

type Tier = 'low' | 'mid' | 'high';

function tierFor(coach: CoachProfile): Tier {
  return coach.iq <= 10 ? 'low' : coach.iq <= 15 ? 'mid' : 'high';
}

/** How many hill-climb moves a coach will make: a blunt single fix at low IQ, a
 * deeper full reorder as IQ rises. */
function maxStepsFor(tier: Tier): number {
  return tier === 'low' ? 1 : tier === 'mid' ? 4 : 6;
}

const IMPROVE_EPS = 1e-6;

function key(rp: RosterPlayer): string {
  return nameKey(rp.player.name, rp.position);
}

/**
 * Arrange a chosen five into natural court-slot order (index 0 = PG ... 4 = C) by
 * each player's intrinsic position. The five's array index IS the court slot (the
 * scout/lineup UI labels slot i as POSITIONS[i], and the sim pairs defenders by
 * slot index), so the coach must hand back a position-coherent five instead of a
 * bench player landing in whatever slot it was swapped into (e.g. a Center in the
 * PG slot). Stable, so same-position players keep their relative order. With no
 * player of a slot's position the next-most-perimeter player fills it, so a big
 * never sits ahead of a guard. Mirrors how defaultLoadout fills slots position-first.
 */
function slotByPosition(five: RosterPlayer[]): RosterPlayer[] {
  return [...five].sort((a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position));
}

/** How many of the new starters were not starting before (set-based, so re-slotting
 * the same players is not counted as a change). */
function starterChanges(before: RosterPlayer[], after: RosterPlayer[]): number {
  const beforeKeys = new Set(before.map(key));
  return after.filter((rp) => !beforeKeys.has(key(rp))).length;
}

export interface ReorderResult {
  /** The reordered roster (starters in slot order, bench by rotation priority). */
  roster: Roster;
  /** The matchup-proxy gain over the input roster, in rating points (0 with no
   * opponent or no change). */
  matchupDelta: number;
  /** How many players were brought into the starting five (set-based, so a pure
   * re-slot of the same five is 0). */
  changes: number;
}

export interface ReorderArgs {
  roster: Roster;
  coach: CoachProfile;
  buildHome: (roster: Roster) => Team;
  /** The opponent to thread the matchup against; omit for a pure-style reorder. */
  opponent?: Team;
}

/**
 * The coach's preferred reordering of the whole roster: a style-tilted, IQ-gated
 * hill-climb over bench<->starter swaps that picks the five, then orders the bench by
 * rotation priority. Always returns a (possibly unchanged) roster, so the lineup
 * builder's "let the coach set it" button can apply it directly. {@link
 * recommendLineup} wraps this with the surfacing threshold for the pregame banner.
 */
export function reorderForCoach(args: ReorderArgs): ReorderResult {
  const { roster, coach, buildHome, opponent } = args;
  const tier = tierFor(coach);

  const objective = (r: Roster): number => {
    const home = buildHome(r);
    const base = opponent ? matchupScore(home, opponent) : rawQuality(home);
    return base + styleBonus(home, coach);
  };
  const matchup = (r: Roster): number =>
    opponent ? matchupScore(buildHome(r), opponent) : rawQuality(buildHome(r));

  let current = roster;
  let currentScore = objective(current);

  if (roster.bench.length > 0) {
    const maxSteps = maxStepsFor(tier);
    for (let step = 0; step < maxSteps; step++) {
      let swaps = singleSwaps(current);
      if (tier === 'low') swaps = swaps.filter(isObvious);
      let best: { roster: Roster; score: number } | null = null;
      for (const swap of swaps) {
        const score = objective(swap.roster);
        if (!best || score > best.score) best = { roster: swap.roster, score };
      }
      if (!best || best.score <= currentScore + IMPROVE_EPS) break;
      current = best.roster;
      currentScore = best.score;
    }
  }

  // Slot the chosen five into natural PG..C order (so a swapped-in player never lands
  // in the wrong court slot) and order the bench by rotation priority, so the WHOLE
  // roster is set coherently, not just which five plays.
  const bench = [...current.bench].sort(
    (a, b) => playerStyleValue(b, coach) - playerStyleValue(a, coach)
  );
  const result: Roster = { starters: slotByPosition(current.starters), bench };
  return {
    roster: result,
    matchupDelta: matchup(result) - matchup(roster),
    changes: starterChanges(roster.starters, result.starters),
  };
}

function summarize(
  before: RosterPlayer[],
  after: RosterPlayer[],
  changes: number,
  opponent: Team
): string {
  const vs = `vs their ${archetypeLabel(deriveArchetype(opponent))}`;
  const beforeKeys = new Set(before.map(key));
  // The headliner: the highest-rated player now starting who was not before.
  const incoming = after
    .filter((rp) => !beforeKeys.has(key(rp)))
    .sort((a, b) => ovrRaw(b.player.stats, b.position) - ovrRaw(a.player.stats, a.position))[0];
  if (!incoming) return `Hold this five ${vs}`;
  if (changes === 1) {
    const afterKeys = new Set(after.map(key));
    const out = before.find((rp) => !afterKeys.has(key(rp)));
    return out
      ? `Start ${incoming.player.name} over ${out.player.name} ${vs}`
      : `Start ${incoming.player.name} ${vs}`;
  }
  return `Reset the rotation: start ${incoming.player.name} and ${changes - 1} more ${vs}`;
}

/**
 * Recommend the coach's full reorder for the pregame banner, or null when there is
 * nothing worth surfacing (no bench, no change, or a gain below the
 * difficulty-scaled bar). A high-IQ coach speaks up on a subtler edge (the bar drops
 * to 80%); a low-IQ coach only flags an obvious fix, so easy runs stay quiet and hard
 * runs get real adjustments often. The surfacing test is the MATCHUP gain (not the
 * style-tilted objective), so accepting the banner never worsens the matchup.
 */
export function recommendLineup(args: RecommendArgs): CoachRec | null {
  const { roster, coach, opponent, buildHome, minDelta } = args;
  if (roster.bench.length === 0) return null;

  const { roster: reordered, matchupDelta, changes } = reorderForCoach({
    roster,
    coach,
    buildHome,
    opponent,
  });
  if (changes === 0) return null;

  const threshold = tierFor(coach) === 'high' ? minDelta * 0.8 : minDelta;
  if (matchupDelta < threshold) return null;

  return {
    starters: reordered.starters,
    bench: reordered.bench,
    edge: edgeFor(matchupDelta),
    changes,
    summary: summarize(roster.starters, reordered.starters, changes, opponent),
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
