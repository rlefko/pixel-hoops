import { POSITIONS, nameKey, type Position, type Roster, type RosterPlayer } from '@/types/roster';
import type { PlayerStats } from '@/types/player';
import type { Team } from '@/types/team';
import type { Difficulty } from './difficulty-mode';
import type { CoachProfile, CoachClass } from './coaches';
import { ovr, ovrRaw, offRaw, defRaw, classForOvr, CLASS_ORDER } from './ratings';
import { effectivePlayers } from './apply-effects';
import { deriveArchetype, counterEdge, archetypeLabel, Q_TO_RATING } from './team-archetype';

/**
 * The coach's lineup advisor: accepting it reshapes the WHOLE drafted run roster
 * (starters + bench) toward the coach's PLAYSTYLE-optimal lineup, not just one swap.
 * A lockdown coach pulls its best stoppers into the five, an up-tempo coach favors
 * athletic shooters, a balanced coach just fields its best five.
 *
 * The engine is PLAYSTYLE-PRIMARY, quality-anchored, and strength-scaled:
 *  - Each player gets a coach-fit value (overall + a lean toward the coach's focus and
 *    pace), so style decides among comparable players while overall still anchors it.
 *  - A hard CLASS FLOOR keeps it fair: the coach never benches a higher-class player
 *    for a lower-class one just to fit its style (it fully commits to style only up to
 *    that line), so accepting never trades your roster's class away.
 *  - The number of moves scales with the coach's CLASS (C makes one blunt fix; S+ can
 *    restructure all five), so a better coach reshapes more toward its identity.
 *  - A higher-IQ coach also threads the matchup: it avoids style moves that would walk
 *    the team into a clearly bad archetype counter, without ever chasing the matchup
 *    over its style.
 *
 * Pure: the team builder is INJECTED (so this never imports the run machine), and the
 * matchup proxy reuses the same off/def composites and archetype counter the sim
 * resolves against. We surface a qualitative edge (minor/solid/big), never a raw
 * percentage; the banner only speaks up on a meaningful, difficulty-scaled reshape.
 */

export interface CoachRec {
  /** Proposed slot-ordered five (feeds the existing setLineup as-is). */
  starters: RosterPlayer[];
  /** Proposed bench, ordered by rotation priority (best/most-in-style first). */
  bench: RosterPlayer[];
  /** Qualitative size of the reshape (minor = 1 move, solid = 2-3, big = 4+). */
  edge: 'minor' | 'solid' | 'big';
  /** How many players are brought into the starting five (1 = a single swap). */
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
  /** The difficulty-scaled style gain below which the banner stays quiet. */
  minDelta: number;
}

// --- Matchup proxy ----------------------------------------------------------

/** A matchup scorer against a fixed away team: the home edge in rating points
 * (>0 favors home). Reuses the sim's own off/def composites and the frozen archetype
 * counter, so it correlates with simulated outcomes by construction. A factory
 * because the away side is constant for a whole search: its composites and archetype
 * are derived once here instead of on every candidate evaluation. */
function makeMatchupScorer(away: Team): (home: Team) => number {
  // Unrounded composites (not teamStats.off/def, which are integer-rounded) so the
  // search can discriminate subtle, sub-one-point lineup edges.
  const awayOff = offRaw(away.teamStats);
  const awayDef = defRaw(away.teamStats);
  const aa = deriveArchetype(away);
  return (home) => {
    const homeOff = offRaw(home.teamStats);
    const homeDef = defRaw(home.teamStats);
    const ratingEdge = homeOff - awayDef - (awayOff - homeDef);
    const ha = deriveArchetype(home);
    const counter = (counterEdge(ha, aa) - counterEdge(aa, ha)) * Q_TO_RATING;
    return ratingEdge + counter;
  };
}

// --- Playstyle fit + coach strength -----------------------------------------

/** The 6-20 band midpoint; style leans measure distance from this. */
const BAND_MID = 13;
/** Per-stat-point lean weights: how strongly the coach's focus / pace reshape who
 * fits the style. Tuned so style decides among comparable players (overall still
 * anchors, and the class floor is the hard line). */
const FOCUS_LEAN = 0.6;
const PACE_LEAN = 0.4;

/**
 * A player's value to this coach: overall, plus a lean toward the coach's identity
 * (focus: lockdown -> team defense, inside/outside -> that stat; pace: fast ->
 * athleticism, slow -> defense). A balanced/auto coach has no lean, so it simply
 * fields its best players. Used for both starter selection and bench ordering.
 * Takes EFFECTIVE stats (item + ability + in-run training baked, the same line the
 * sim fields), so the coach values a trained-up or geared player at what they are
 * now, not their base line.
 */
function playerFit(s: PlayerStats, position: Position, coach: CoachProfile): number {
  let lean = 0;
  if (coach.prefFocus === 'lockdown') lean += ((s.perimeterD + s.interiorD) / 2 - BAND_MID) * FOCUS_LEAN;
  else if (coach.prefFocus === 'inside') lean += (s.inside - BAND_MID) * FOCUS_LEAN;
  else if (coach.prefFocus === 'outside') lean += (s.outside - BAND_MID) * FOCUS_LEAN;
  if (coach.prefPace === 'fast') lean += (s.athleticism - BAND_MID) * PACE_LEAN;
  else if (coach.prefPace === 'slow') lean += ((s.perimeterD + s.interiorD) / 2 - BAND_MID) * PACE_LEAN;
  return ovrRaw(s, position) + lean;
}

/** A player's class rank (0 = D ... up the ladder), from their EFFECTIVE overall, for
 * the class floor (so an upgraded player is not treated as its base class). */
function classRank(s: PlayerStats, position: Position): number {
  return CLASS_ORDER.indexOf(classForOvr(ovr(s, position)));
}

/** A frontcourt (big) slot vs a backcourt/wing (perimeter) slot. Used to preserve a
 * team's guard/big balance across a reshape. */
function isBig(position: Position): boolean {
  return position === 'PF' || position === 'C';
}

/** How many starter changes a coach may make, by class: a top coach can restructure
 * the whole five toward its ideal; the starter makes one blunt fix. */
const BUDGET_BY_CLASS: Record<CoachClass, number> = { C: 1, B: 2, A: 3, S: 4, 'S+': 5 };
function budgetForClass(cls: CoachClass): number {
  return BUDGET_BY_CLASS[cls] ?? 1;
}

/** How much a coach lets the upcoming matchup veto a style move: a low-IQ coach plays
 * pure style; a smarter one avoids walking into a clearly bad counter. */
function matchupWeightForIq(iq: number): number {
  return iq <= 10 ? 0 : iq <= 15 ? 0.5 : 1;
}

// --- Search helpers ---------------------------------------------------------

/** Reshape size for the banner label. */
function edgeForChanges(changes: number): CoachRec['edge'] {
  return changes >= 4 ? 'big' : changes >= 2 ? 'solid' : 'minor';
}

function injured(rp: RosterPlayer): boolean {
  return (rp.gamesOut ?? 0) > 0;
}

/** The roster after swapping bench[b] into the five at starters[s]. */
function swapRoster(roster: Roster, s: number, b: number): Roster {
  const starters = roster.starters.slice();
  const bench = roster.bench.slice();
  starters[s] = roster.bench[b];
  bench[b] = roster.starters[s];
  return { starters, bench };
}

const GAIN_EPS = 1e-6;

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
  /** How many players were brought into the starting five (set-based, so a pure
   * re-slot of the same five is 0). */
  changes: number;
  /** The total playstyle-fit improvement of the applied moves (rating points), for
   * the difficulty-scaled banner gate. */
  styleGain: number;
}

export interface ReorderArgs {
  roster: Roster;
  coach: CoachProfile;
  buildHome: (roster: Roster) => Team;
  /** The opponent to thread the matchup against; omit for a pure-style reorder. */
  opponent?: Team;
}

/**
 * The coach's reshape of the whole roster toward its playstyle ideal: a greedy,
 * class-floored, budget-limited search that swaps the best-fitting bench players into
 * the five (up to the coach's class budget), then slots the five by position and
 * orders the bench by fit. Always returns a (possibly unchanged) roster, so the
 * lineup builder's "let the coach set it" button can apply it directly. {@link
 * recommendLineup} wraps this with the surfacing gate for the pregame banner.
 */
export function reorderForCoach(args: ReorderArgs): ReorderResult {
  const { roster, coach, buildHome, opponent } = args;
  const budget = budgetForClass(coach.class);
  const matchupW = matchupWeightForIq(coach.iq);
  // Only a smart coach with an opponent threads the matchup; the away side is fixed
  // for the whole search, so its composites/archetype are derived once in the scorer.
  const scoreMatchup = matchupW > 0 && opponent ? makeMatchupScorer(opponent) : null;

  // Value players by their EFFECTIVE line (item + ability + in-run training baked),
  // the same one the sim fields, so the coach never overlooks a trained-up or geared
  // player by reading their base stats. Fit and class rank depend only on that line,
  // the position, and the coach, so both are baked once per player up front.
  const all = [...roster.starters, ...roster.bench];
  const effList = effectivePlayers(all);
  const fitByRef = new Map<RosterPlayer, number>();
  const rankByRef = new Map<RosterPlayer, number>();
  all.forEach((rp, i) => {
    const stats = effList[i].player.stats;
    fitByRef.set(rp, playerFit(stats, rp.position, coach));
    rankByRef.set(rp, classRank(stats, rp.position));
  });
  const fit = (rp: RosterPlayer): number =>
    fitByRef.get(rp) ?? playerFit(rp.player.stats, rp.position, coach);
  const rank = (rp: RosterPlayer): number =>
    rankByRef.get(rp) ?? classRank(rp.player.stats, rp.position);

  let current = roster;
  let styleGain = 0;

  for (let step = 0; step < budget; step++) {
    if (current.bench.length === 0) break;
    // Baseline matchup for this step, computed lazily on the first candidate that
    // survives the style pruning below: a step whose candidates all prune costs no
    // team builds at all (and then breaks the search).
    let baseMatchup: number | null = null;
    let best: { starter: number; bench: number; gain: number; styleGain: number } | null = null;
    for (let s = 0; s < current.starters.length; s++) {
      for (let b = 0; b < current.bench.length; b++) {
        const incoming = current.bench[b];
        if (injured(incoming)) continue; // cannot start a hurt player
        const outgoing = current.starters[s];
        // Keep the team's guard/big balance: a big only replaces a big and a perimeter
        // player only replaces a perimeter player, so the coach never discards a ball
        // handler for another center or stacks the frontcourt.
        if (isBig(incoming.position) !== isBig(outgoing.position)) continue;
        // Quality anchor: never trade a higher-class player out for a lower-class one
        // just to fit the style.
        if (rank(incoming) < rank(outgoing)) continue;
        const sGain = fit(incoming) - fit(outgoing);
        // The matchup term below only ever subtracts (min(0, ...)), so a swap whose
        // style gain cannot already clear the bar or the current best can never win.
        // Skip it before paying for the team build; acceptance is strict (>), so a
        // swap that could at most tie loses either way, and the pick is unchanged.
        if (sGain <= GAIN_EPS || (best !== null && sGain <= best.gain)) continue;
        // A smarter coach is penalized for a style move that worsens the matchup
        // (avoids a bad counter) but never chases the matchup over its style.
        let mGain = 0;
        if (scoreMatchup) {
          baseMatchup ??= scoreMatchup(buildHome(current));
          mGain = scoreMatchup(buildHome(swapRoster(current, s, b))) - baseMatchup;
        }
        const gain = sGain + matchupW * Math.min(0, mGain);
        if (gain > GAIN_EPS && (!best || gain > best.gain)) {
          best = { starter: s, bench: b, gain, styleGain: sGain };
        }
      }
    }
    if (!best) break;
    current = swapRoster(current, best.starter, best.bench);
    styleGain += Math.max(0, best.styleGain);
  }

  // Slot the five into natural PG..C order and order the bench by fit, so the WHOLE
  // roster is set coherently, not just which five plays.
  const bench = [...current.bench].sort((a, b) => fit(b) - fit(a));
  const result: Roster = { starters: slotByPosition(current.starters), bench };
  return {
    roster: result,
    changes: starterChanges(roster.starters, result.starters),
    styleGain,
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
  return `Reshape the rotation: start ${incoming.player.name} and ${changes - 1} more ${vs}`;
}

/**
 * Recommend the coach's playstyle reshape for the pregame banner, or null when there
 * is nothing worth surfacing (no bench, no change, or a reshape below the
 * difficulty-scaled bar). The bar is on the STYLE gain, so easy runs stay quiet and
 * hard/boss nodes surface real reshapes often; the player still owns the final
 * matchup-specific tweak (the lineup builder stays one tap away).
 */
export function recommendLineup(args: RecommendArgs): CoachRec | null {
  const { roster, coach, opponent, buildHome, minDelta } = args;
  if (roster.bench.length === 0) return null;

  const { roster: reordered, changes, styleGain } = reorderForCoach({
    roster,
    coach,
    buildHome,
    opponent,
  });
  if (changes === 0) return null;
  if (styleGain < minDelta) return null;

  return {
    starters: reordered.starters,
    bench: reordered.bench,
    edge: edgeForChanges(changes),
    changes,
    summary: summarize(roster.starters, reordered.starters, changes, opponent),
  };
}

/**
 * The style gain (in rating points) a reshape must clear to surface, scaled so the
 * coach stays quiet on easy and speaks up often on hard/insane. Lowered further on
 * the higher-stakes elite/boss nodes.
 */
export function recMinDelta(difficulty: Difficulty, nodeType: 'game' | 'elite' | 'boss'): number {
  const base =
    difficulty === 'easy' ? 1.4 : difficulty === 'medium' ? 0.9 : difficulty === 'hard' ? 0.6 : 0.5;
  const nodeAdj = nodeType === 'boss' ? -0.3 : nodeType === 'elite' ? -0.2 : 0;
  return Math.max(0.3, base + nodeAdj);
}
