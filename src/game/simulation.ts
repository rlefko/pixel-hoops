import type { PlayerStats } from '@/types/player';
import { POSITIONS, type Position, type RosterPlayer } from '@/types/roster';
import type { Team, TeamStats } from '@/types/team';
import type { Focus } from '@/types/tactics';
import type {
  BoxLine,
  OffActionId,
  OnCourtFive,
  OnCourtSnapshot,
  QuarterResult,
  SimActionId,
  SimEvent,
  SimResult,
  SimSub,
  SimTeamSide,
} from '@/types/sim';
import { TOTAL_QUARTERS } from '@/types/sim';
import {
  makeProbability,
  missFlavor,
  expectedValue,
  fatigueMultiplier,
  ACTION_OFF,
  ACTION_DEF,
  SHOT_PROFILE,
} from './sim-resolution';
import { computeUsageWeights, computeTeamStats } from './lineup';
import { computeSynergy } from './synergy';
import type { StatDelta } from './effects';
import { deriveArchetype, counterDelta } from './team-archetype';
import { ovrRaw } from './ratings';
import { pickRiskPosture, type RiskPosture } from './ai';
import { createRNG, type RNG } from './rng';

/**
 * The auto-sim engine. Plays a full game possession-by-possession and returns a
 * deterministic timeline the UI replays with juice. Make probability and the
 * one-on-one contests live in sim-resolution.ts; this file owns pacing, shot
 * selection, the per-game form factor, fatigue/rotation, and the event stream.
 * Same seed always yields the same SimResult.
 */

// --- Tunables (kept here so score realism is easy to adjust) ---

/** Possessions per team per quarter at a baseline pace. */
const BASE_POSSESSIONS_PER_QUARTER = 12;
/** Pace value that maps to exactly the base possession count. */
const PACE_BASELINE = 14;
const MIN_POSSESSIONS = 8;
const MAX_POSSESSIONS = 18;
/** A lockdown game plan adds this to the opponent's defensive counter stat. */
const LOCKDOWN_BONUS = 3;
/**
 * Per-game shooting "form": each team draws a hot/cold offset (in rating points)
 * once per game that lifts or drops their offense all night. Independent
 * per-shot luck washes out over ~60 possessions, so this correlated factor is
 * what keeps upsets alive: a cold favorite can drop one to a hot underdog.
 */
const FORM_RANGE = 3.2;
/**
 * How hard basketball IQ pulls shot selection toward the highest expected-value
 * looks (rim and threes) and away from contested long twos. A smart five hunts
 * good shots (the NBA-2K tendency vs ability split); a low-IQ five chucks.
 */
const IQ_PULL = 0.6;
/** Fourth-quarter margin (abs) within which clutch matters. */
const CLUTCH_MARGIN = 6;
/**
 * How strongly a scorer's own clutch nudges their make rate in crunch time.
 * Deliberately small: the research shows clutch is mostly noise, not a durable
 * skill, so it is flavor here, paired with a symmetric random term, not a tax.
 */
const CLUTCH_K = 0.4;
/** Symmetric crunch-time make swing (percentage points) independent of clutch. */
const CLUTCH_NOISE = 3;
const SECONDS_PER_QUARTER = 720;

// --- Fatigue + rotation tunables ---

/**
 * Energy a normal-stamina starter loses per offensive possession on the floor.
 * Tuned so a stamina-5 starter dips into the sub zone a couple of times a game,
 * producing a real rotation (~32-36 minutes) rather than a 48-minute iron man.
 */
const DRAIN_BASE = 2.6;
/** Energy a benched player recovers per possession off the floor (fast enough
 * that a spelled starter is ready to re-enter the same game). */
const RECOVER = 4;
/** The ball-handler/scorer works harder, so drains faster. */
const SCORER_DRAIN_MULT = 1.5;
/** Pull a starter once energy drops below this (the soft sub zone). */
const SUB_OUT_ENERGY = 50;
/** Only bring in a bench player who has recovered above this (hysteresis). */
const SUB_IN_ENERGY = 72;
/**
 * A gassed starter below this is ALWAYS pulled for the best rested body, even a
 * worse one: nobody plays a full game spent. This guarantees the bench gets real
 * minutes and the stars are not run into the ground for 48.
 */
const HARD_FLOOR = 28;
/**
 * Soft-sub acceptance: spell a tired starter when a fresh bench player is at
 * least this fraction as effective right now. The fatigue penalty only maxes
 * near 20%, so this lets a fresh body within ~10% of a tired star come in.
 */
const SUB_OUT_GOOD_ENOUGH = 0.9;
/** Abs score margin (in a late quarter) that counts as garbage time. */
const BLOWOUT_MARGIN = 18;
/** Extra sub-out threshold for starters in garbage time, so the bench plays. */
const BLOWOUT_SUB_OUT_BONUS = 18;
/** Garbage-time rest only kicks in from this quarter on (keep Q1-Q3 honest). */
const BLOWOUT_QUARTER = 4;
/** Share of made field goals that are assisted, scaled by team playmaking. */
const ASSIST_RATE = 0.9;

// --- Play-style event attribution (BBGM/ZenGM pickPlayer-with-power model) ---

/**
 * A box-score event (block, steal, rebound, assist) is credited to a player with
 * probability proportional to (rating ^ POWER) over the on-court five. A higher
 * power CONCENTRATES the event on the specialist: with BLOCK_POWER 9 a rim
 * protector at blocking 18 beats a guard at blocking 7 by ~(18/7)^9, so a
 * pass-first guard essentially never records a block. These are the BBGM/ZenGM
 * exponents that reproduce realistic per-position distributions (centers lead
 * blocks/rebounds, quick guards lead steals, the primary creator hoards assists).
 */
const BLOCK_POWER = 8;
const STEAL_POWER = 4;
const OREB_POWER = 5;
const DREB_POWER = 3;
const ASSIST_POWER = 10;
/**
 * Boards skew defensive (~73% of misses), so add this to the defense's rebounding
 * aggregate when splitting offensive vs defensive boards. Tuned (with the team
 * rebounding aggregate) so ~27% of misses become offensive rebounds, the NBA rate.
 */
const DEF_REBOUND_BIAS = 18;
/** Extra and-one chance per strength point over the base, so strong finishers
 * convert through contact more often (a small secondary effect of strength). */
const STRENGTH_AND_ONE_K = 0.004;

// --- Action tables (analogous to card.ts's CARD_STAT_MAP) ---

// Only these five are ever chosen as a possession's action. The matchup ratings
// and per-action make profiles live in sim-resolution.ts (ACTION_OFF/ACTION_DEF
// and SHOT_PROFILE).
const OFFENSIVE_ACTIONS: readonly OffActionId[] = [
  'three',
  'midrange',
  'drive',
  'layup',
  'dunk',
];

// --- Future crunch-time decision hook (designed-in, dormant for now) ---

/**
 * Hook for a future Q4 timeout decision (pound inside / chuck threes / press).
 * Currently unused by the slice; the engine calls it only if supplied, so the
 * pure auto-sim is unaffected. See docs/gameplay-redesign.md.
 */
export type CrunchTimeHook = (ctx: {
  quarter: number;
  margin: number;
  rng: RNG;
}) => { focusOverride?: Focus } | null;

export interface SimConfig {
  /** The player's team (shown as "home"). */
  home: Team;
  /** The opponent ("away"). */
  away: Team;
  seed: number | string;
  decisionHook?: CrunchTimeHook;
}

// --- Action selection ---

/**
 * Weighted offensive action choice. Three layers, in order: a base mix, an
 * IQ-driven reshape toward the highest expected-value shots (tendency), then the
 * game plan's focus/posture nudges (so player agency still reads through). The
 * EV is computed against a neutral defender so selection does not leak the
 * actual opponent. Pure: it only builds weights; the single RNG draw is at the
 * call site.
 */
export function actionWeights(
  stats: TeamStats,
  focus: Focus,
  posture: RiskPosture
): [OffActionId, number][] {
  const w: Record<OffActionId, number> = {
    three: 3,
    midrange: 3,
    drive: 3,
    layup: 2,
    dunk: 2,
  };

  // IQ reshape: pull toward high-EV looks. Midrange takes an EV haircut so a
  // smart five shuns the contested long two even when it can shoot.
  const evs = OFFENSIVE_ACTIONS.map((a) => {
    const p = makeProbability({
      action: a,
      offRating: ACTION_OFF[a](stats),
      defRating: 10,
      iq: stats.iq,
    });
    const ev = expectedValue(a, p);
    return a === 'midrange' ? ev * 0.92 : ev;
  });
  const meanEv = evs.reduce((sum, e) => sum + e, 0) / evs.length;
  const pull = (IQ_PULL * (stats.iq - 10)) / 10;
  OFFENSIVE_ACTIONS.forEach((a, i) => {
    w[a] *= Math.max(0.2, 1 + pull * (evs[i] / meanEv - 1));
  });

  switch (focus) {
    case 'outside':
      w.three += 4;
      w.midrange += 2;
      w.dunk -= 1;
      w.layup -= 1;
      break;
    case 'inside':
      w.dunk += 3;
      w.layup += 3;
      w.drive += 2;
      w.three -= 2;
      break;
    case 'lockdown':
      // Defensive posture: the offense grinds it out (the real defensive effect
      // is LOCKDOWN_BONUS applied to the opponent's counter stat at sim time).
      w.midrange += 1;
      w.three -= 1;
      break;
    case 'balanced':
      break;
  }

  if (posture === 'safe') {
    w.midrange += 2;
    w.layup += 1;
    w.three -= 1;
    w.dunk -= 1;
  } else if (posture === 'risky') {
    w.three += 2;
    w.dunk += 2;
  }

  return OFFENSIVE_ACTIONS.map((a) => [a, Math.max(0.25, w[a])]);
}

// --- Play-by-play text ---

function calloutFor(action: SimActionId, result: QuarterResult): string | undefined {
  if (result === 'and-one') return 'AND-ONE!';
  if (result === 'block') return 'REJECTED!';
  if (result === 'steal') return 'STEAL!';
  if (result === 'turnover') return 'TURNOVER!';
  if (result === 'score') {
    if (action === 'three') return 'SWISH!';
    if (action === 'dunk') return 'SLAM!';
  }
  return undefined;
}

function textFor(scorer: string, action: SimActionId, result: QuarterResult): string {
  if (result === 'and-one') return `${scorer} scores AND the foul!`;
  if (result === 'block') return `${scorer} gets stuffed at the rim`;
  if (result === 'steal') return `${scorer} coughs it up`;
  if (result === 'turnover') return `${scorer} loses the handle`;
  if (result === 'miss') {
    if (action === 'three') return `${scorer} misses from deep`;
    return `${scorer}'s shot rims out`;
  }
  switch (action) {
    case 'three':
      return `${scorer} drains a three`;
    case 'midrange':
      return `${scorer} hits the midrange`;
    case 'drive':
      return `${scorer} drives and scores`;
    case 'layup':
      return `${scorer} lays it in`;
    case 'dunk':
      return `${scorer} throws it down`;
    default:
      return `${scorer} scores`;
  }
}

// --- Clock ---

function clockLabel(quarter: number, possIndex: number, possInQuarter: number): string {
  const fraction = possInQuarter > 0 ? (possIndex + 1) / possInQuarter : 1;
  const remaining = Math.max(0, Math.round(SECONDS_PER_QUARTER * (1 - fraction)));
  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  return `Q${quarter} ${mm}:${ss.toString().padStart(2, '0')}`;
}

function possessionsFor(team: Team): number {
  const scaled = Math.round(
    BASE_POSSESSIONS_PER_QUARTER * (team.teamStats.pace / PACE_BASELINE)
  );
  return Math.max(MIN_POSSESSIONS, Math.min(MAX_POSSESSIONS, scaled));
}

// --- Per-player game state (energy, rotation, box) ---

/** One player's live state during a game: where they are, how tired, their line. */
interface PlayerGameState {
  rp: RosterPlayer;
  onCourt: boolean;
  energy: number; // 0..100
  box: BoxLine;
}

/** One side's live state: roster, the current five, usage, and aggregate line. */
interface SideState {
  team: Team;
  /** Starters (in slot order) then bench. */
  all: PlayerGameState[];
  /** Exactly five; index === court slot (POSITIONS[index]). */
  onCourt: PlayerGameState[];
  /** Usage weights for the current five (sum to 1). */
  weights: number[];
  /** Effective stat line for the current five (recomputed on each sub). */
  aggregate: TeamStats;
  /** This team's hot/cold shooting night (rating-point offset to offense). */
  form: number;
  /**
   * Frozen team-archetype counter edge as a flat offensive {@link StatDelta},
   * computed once at tip-off from this team's archetype vs the opponent's and
   * re-applied to the aggregate after every substitution. {} when the matchup is
   * even (a mirror, or either side `balanced`), so it is a true no-op then.
   */
  counterDelta: StatDelta;
}

function newBoxLine(rp: RosterPlayer, slot: Position, starter: boolean): BoxLine {
  return {
    name: rp.player.name,
    slot,
    starter,
    pts: 0,
    fgm: 0,
    fga: 0,
    tpm: 0,
    tpa: 0,
    reb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    seconds: 0,
    energy: 100,
    load: 0,
  };
}

function initSide(team: Team, form: number): SideState {
  const starters = team.lineup.players.map(
    (rp, i): PlayerGameState => ({
      rp,
      onCourt: true,
      energy: 100,
      box: newBoxLine(rp, POSITIONS[i], true),
    })
  );
  const bench = team.bench.map(
    (rp): PlayerGameState => ({
      rp,
      onCourt: false,
      energy: 100,
      box: newBoxLine(rp, rp.position, false),
    })
  );
  return {
    team,
    all: [...starters, ...bench],
    onCourt: starters.slice(),
    weights: team.lineup.usageWeights.slice(),
    // Copy so applying the counter edge never mutates the shared Team.teamStats
    // (Teams are reused across games, e.g. determinism replays).
    aggregate: { ...team.teamStats },
    form,
    counterDelta: {},
  };
}

/** Recompute usage + aggregate (and synergy) for the current five, then re-apply
 * the frozen archetype counter edge so it survives substitutions. */
function recomputeAggregate(side: SideState): void {
  const players = side.onCourt.map((p) => p.rp);
  const synergy = computeSynergy(players);
  side.weights = computeUsageWeights(players, side.team.tactic);
  side.aggregate = computeTeamStats(
    players,
    side.weights,
    synergy,
    side.team.tactic,
    side.team.modifier
  );
  addDeltaToStats(side.aggregate, side.counterDelta);
}

/** Interior-D aggregate at which a post threat is considered "doubled". */
const DOUBLE_INTERIOR_THRESHOLD = 16;

/** Add a stat delta to a team stat line in place (no clamp; q() tolerates any value). */
function addDeltaToStats(stats: TeamStats, delta: StatDelta): void {
  for (const k in delta) {
    const key = k as keyof StatDelta;
    stats[key] = stats[key] + (delta[key] ?? 0);
  }
}

/** Whether any on-court player has dipped below an energy threshold. */
function anyOnCourtTired(side: SideState, energyBelow: number): boolean {
  return side.onCourt.some((p) => p.energy < energyBelow);
}

/**
 * Per-possession effective stat lines after conditional SimHooks. When neither
 * side carries hooks the aggregates are returned unchanged (same references), so
 * a game with no abilities/conditional boosts resolves identically to before.
 * Each team's own hooks shape its line; opponentRatingMult hooks bend the OTHER
 * line (an offense rule-bender like Diesel weakens the defender; a defensive
 * rule-bender like The Wall weakens the attacker).
 */
function applyHooks(
  offense: SideState,
  defense: SideState,
  quarter: number
): { off: TeamStats; def: TeamStats } {
  const offHooks = offense.team.modifier.hooks;
  const defHooks = defense.team.modifier.hooks;
  if (offHooks.length === 0 && defHooks.length === 0) {
    return { off: offense.aggregate, def: defense.aggregate };
  }
  const off: TeamStats = { ...offense.aggregate };
  const def: TeamStats = { ...defense.aggregate };

  for (const h of offHooks) {
    switch (h.kind) {
      case 'quarterDelta':
        if (quarter === h.quarter) addDeltaToStats(off, h.delta);
        break;
      case 'paceClutch':
        if (off.pace >= h.minPace) off.clutch += h.clutchAdd;
        break;
      case 'tiredBench':
        if (anyOnCourtTired(offense, h.energyBelow)) addDeltaToStats(off, h.benchDelta);
        break;
      case 'opponentRatingMult':
        if (h.when === 'offense') {
          const doubled = h.unlessDoubled && def.interiorD >= DOUBLE_INTERIOR_THRESHOLD;
          if (!doubled) def[h.stat] = def[h.stat] * h.mult;
        }
        break;
    }
  }
  for (const h of defHooks) {
    switch (h.kind) {
      case 'quarterDelta':
        if (quarter === h.quarter) addDeltaToStats(def, h.delta);
        break;
      case 'tiredBench':
        if (anyOnCourtTired(defense, h.energyBelow)) addDeltaToStats(def, h.benchDelta);
        break;
      case 'opponentRatingMult':
        if (h.when === 'defense') {
          const doubled = h.unlessDoubled && def.interiorD >= DOUBLE_INTERIOR_THRESHOLD;
          if (!doubled) off[h.stat] = off[h.stat] * h.mult;
        }
        break;
      case 'paceClutch':
        // Pace/clutch is an offense-side concept; ignored when defending.
        break;
    }
  }
  return { off, def };
}

/**
 * Deterministic rotation, three layered rules per slot (priority order):
 *
 *  1. HARD_FLOOR: a starter below it is ALWAYS pulled for the best rested body,
 *     even a worse one, so nobody plays a full game spent and the bench gets run.
 *  2. Soft sub: above the floor but below SUB_OUT_ENERGY, spell the starter for a
 *     fresh player who is at least SUB_OUT_GOOD_ENOUGH as effective right now.
 *  3. Blowout rest: in a late-game blowout, raise a starter's sub-out threshold
 *     so the stars rest and the bench plays garbage time.
 *
 * Same-position first, then higher fatigue-weighted overall, roster index as the
 * tie-break. Hysteresis (soft out at SUB_OUT_ENERGY, in at SUB_IN_ENERGY) prevents
 * thrashing; a benchless team simply never subs. No RNG, so subs are fully
 * reproducible. Returns the subs made for the event stream.
 */
function substitute(
  side: SideState,
  team: SimTeamSide,
  quarter: number,
  margin: number
): SimSub[] {
  const subs: SimSub[] = [];
  const blowout = quarter >= BLOWOUT_QUARTER && Math.abs(margin) >= BLOWOUT_MARGIN;
  for (let slot = 0; slot < side.onCourt.length; slot++) {
    const current = side.onCourt[slot];
    const position = POSITIONS[slot];

    // A gassed starter must rest no matter what; in a late blowout the stars also
    // yield to the bench (garbage time), with a widened sub-out threshold.
    const forced = current.energy < HARD_FLOOR;
    const blowoutRest = blowout && current.box.starter;
    const subOutThreshold = SUB_OUT_ENERGY + (blowoutRest ? BLOWOUT_SUB_OUT_BONUS : 0);
    if (!forced && current.energy >= subOutThreshold) continue;

    // Effective value weights overall by the real fatigue multiplier (not raw
    // energy), so a tired star is not benched for a fresh scrub: the penalty
    // only maxes near 20%, so a soft sub needs a near-equal fresh player.
    const effective = (p: PlayerGameState): number =>
      ovrRaw(p.rp.player.stats, position) * fatigueMultiplier(p.energy, false);

    // A forced sub takes the best rested body even if not fully recovered; a soft
    // sub still wants a comfortably-rested replacement (the hysteresis bar).
    const inBar = forced ? HARD_FLOOR : SUB_IN_ENERGY;
    let best: PlayerGameState | undefined;
    let bestKey = -Infinity;
    for (let index = 0; index < side.all.length; index++) {
      const p = side.all[index];
      if (p.onCourt || p.energy < inBar) continue;
      const samePos = p.rp.position === position ? 1 : 0;
      const key = samePos * 1000 + effective(p) - index * 0.001;
      if (key > bestKey) {
        bestKey = key;
        best = p;
      }
    }
    if (!best) continue;
    // A star who must rest (gassed, or garbage time) takes any rested body; a
    // normal soft sub still needs a near-equal fresh player.
    const acceptAny = forced || blowoutRest;
    if (!acceptAny && effective(best) < effective(current) * SUB_OUT_GOOD_ENOUGH) continue;

    current.onCourt = false;
    best.onCourt = true;
    best.box.slot = position;
    side.onCourt[slot] = best;
    subs.push({ team, slot: position, outName: current.rp.player.name, inName: best.rp.player.name });
  }
  if (subs.length > 0) recomputeAggregate(side);
  return subs;
}

/**
 * Drain the five on the floor (the scorer hardest), recover the bench, and log
 * minutes. Called once per the side's OWN offensive possession, so energy and
 * minutes advance only on offense; this is deliberate (it keeps the per-side
 * minutes total exactly 5 * SECONDS_PER_QUARTER per quarter). Do not also call
 * it on defense or the minutes invariant and determinism shift.
 */
function drainRecover(side: SideState, scorer: PlayerGameState, possInQuarter: number): void {
  const paceFactor = side.aggregate.pace / PACE_BASELINE;
  const secondsPerPoss = SECONDS_PER_QUARTER / possInQuarter;
  for (const p of side.all) {
    if (p.onCourt) {
      // Lower stamina drains faster (26 - stamina) / 14: stamina 20 ~0.43x, 6 ~1.43x.
      const staminaFactor = (26 - p.rp.player.stats.stamina) / 14;
      let drain = DRAIN_BASE * paceFactor * staminaFactor;
      if (p === scorer) drain *= SCORER_DRAIN_MULT;
      p.energy = Math.max(0, p.energy - drain);
      p.box.load += drain;
      p.box.seconds += secondsPerPoss;
    } else {
      p.energy = Math.min(100, p.energy + RECOVER);
    }
  }
}

function fiveOf(side: SideState): OnCourtFive {
  const five = {} as OnCourtFive;
  POSITIONS.forEach((pos, i) => {
    five[pos] = side.onCourt[i].rp.player.name;
  });
  return five;
}

/** Weighted pick over the current five, returning the player and their slot. */
function pickScorer(side: SideState, rng: RNG): { pgs: PlayerGameState; slot: Position } {
  const index = rng.weightedPick(
    side.onCourt.map((_, i): [number, number] => [i, side.weights[i]])
  );
  return { pgs: side.onCourt[index], slot: POSITIONS[index] };
}

// --- The engine ---

export function simulateGame(config: SimConfig): SimResult {
  const rng = createRNG(config.seed);
  const events: SimEvent[] = [];

  // Weighted pick over a five with P(player) proportional to (stat ^ power),
  // crediting the right specialist for each box-score event. A higher power
  // concentrates the event on the best player at that skill (see *_POWER above);
  // power 1 reproduces a plain linear weighting.
  const pickByPower = (
    five: PlayerGameState[],
    stat: keyof PlayerStats,
    power: number
  ): PlayerGameState =>
    rng.weightedPick(
      five.map((p): [PlayerGameState, number] => [
        p,
        Math.pow(Math.max(0.1, p.rp.player.stats[stat]), power),
      ])
    );

  let homeScore = 0;
  let awayScore = 0;
  let seq = 0;
  let homeFocusOverride: Focus | null = null;

  // Each team's hot/cold shooting night (drawn once, applied to offense all game).
  const homeForm = (rng.next() - 0.5) * 2 * FORM_RANGE;
  const awayForm = (rng.next() - 0.5) * 2 * FORM_RANGE;

  const homeState = initSide(config.home, homeForm);
  const awayState = initSide(config.away, awayForm);
  const stateFor = (side: SimTeamSide): SideState =>
    side === 'home' ? homeState : awayState;

  // Team-archetype matchup: a bounded rock-paper-scissors edge, frozen at tip-off
  // (so it never flickers on garbage-time subs) and telegraphed by the scout
  // report. Folded into each side's effective line as a flat offensive delta; an
  // even matchup (a mirror, or either side `balanced`) yields {} and is a no-op.
  homeState.counterDelta = counterDelta(deriveArchetype(config.home), deriveArchetype(config.away));
  awayState.counterDelta = counterDelta(deriveArchetype(config.away), deriveArchetype(config.home));
  addDeltaToStats(homeState.aggregate, homeState.counterDelta);
  addDeltaToStats(awayState.aggregate, awayState.counterDelta);

  const snapshot = (): OnCourtSnapshot => ({
    home: fiveOf(homeState),
    away: fiveOf(awayState),
  });

  /** Decide the rebound and credit it to one side's five (defense favored). The
   * split keys on team rebounding; the board itself goes to the best rebounder on
   * the winning side, with offensive boards more concentrated on the crasher. */
  function creditRebound(offense: SideState, defense: SideState): void {
    const offReb = offense.aggregate.rebounding;
    const defReb = defense.aggregate.rebounding + DEF_REBOUND_BIAS; // boards skew defensive
    const offensive = rng.chance(offReb / (offReb + defReb));
    const board = offensive ? offense : defense;
    pickByPower(board.onCourt, 'rebounding', offensive ? OREB_POWER : DREB_POWER).box.reb += 1;
  }

  function runPossession(
    offenseSide: SimTeamSide,
    quarter: number,
    possIndex: number,
    possInQuarter: number
  ): void {
    const offense = stateFor(offenseSide);
    const defense = stateFor(offenseSide === 'home' ? 'away' : 'home');

    const offenseScore = offenseSide === 'home' ? homeScore : awayScore;
    const defenseScore = offenseSide === 'home' ? awayScore : homeScore;
    const margin = offenseScore - defenseScore;

    // Rotation first: tired starters yield to fresh legs before the play (and
    // the stars rest in a late blowout).
    const subs = substitute(offense, offenseSide, quarter, margin);

    const posture = pickRiskPosture(margin);

    const focus =
      offenseSide === 'home' && homeFocusOverride
        ? homeFocusOverride
        : offense.team.tactic.focus;

    const action = rng.weightedPick(actionWeights(offense.aggregate, focus, posture));

    // Scorer by court slot (index), chosen before the make roll so their own
    // fatigue (and clutch, later) feed the probability.
    const { pgs: scorer, slot } = pickScorer(offense, rng);

    // Conditional ability/boost hooks (Q4 surges, post rule-benders, depth) bend
    // the effective lines for this possession only. A no-hook game is unchanged.
    const { off: offStats, def: defStats } = applyHooks(offense, defense, quarter);

    const offRating = ACTION_OFF[action](offStats) + offense.form;
    let defRating = ACTION_DEF[action](defStats);
    if (defense.team.tactic.focus === 'lockdown') defRating += LOCKDOWN_BONUS;

    // Crunch: the scorer's own clutch gives a small nudge, plus symmetric noise
    // so it never becomes a deterministic edge (clutch is mostly luck in reality).
    const crunch = quarter === TOTAL_QUARTERS && Math.abs(margin) <= CLUTCH_MARGIN;
    let clutchDelta = 0;
    if (crunch) {
      const noise = (rng.next() - 0.5) * (CLUTCH_NOISE / 100);
      clutchDelta = ((scorer.rp.player.stats.clutch - 10) * CLUTCH_K) / 100 + noise;
    }
    const fatigueMult = fatigueMultiplier(scorer.energy, SHOT_PROFILE[action].resilient);

    const makeP = makeProbability({
      action,
      offRating,
      defRating,
      iq: offStats.iq,
      fatigueMult,
      clutchDelta,
    });
    const successRate = Math.round(makeP * 1000) / 10;
    const succeeded = rng.chance(makeP);

    let points = 0;
    let result: QuarterResult;

    if (succeeded) {
      points = SHOT_PROFILE[action].points;
      result = 'score';
      if (
        SHOT_PROFILE[action].finish &&
        rng.chance(
          0.12 +
            Math.max(0, scorer.rp.player.stats.clutch - 10) * 0.005 +
            Math.max(0, scorer.rp.player.stats.strength - 10) * STRENGTH_AND_ONE_K
        )
      ) {
        result = 'and-one';
        points += 1;
      }
    } else {
      result = missFlavor(action, offStats, defStats, rng);
    }

    if (offenseSide === 'home') homeScore += points;
    else awayScore += points;

    // Box accumulation (fixed draw order: assist, then rebound/steal/block).
    if (result === 'score' || result === 'and-one') {
      scorer.box.fga += 1;
      scorer.box.fgm += 1;
      scorer.box.pts += points;
      if (action === 'three') {
        scorer.box.tpa += 1;
        scorer.box.tpm += 1;
      }
      const assistP = ASSIST_RATE * (offense.aggregate.playmaking / 20);
      const others = offense.onCourt.filter((p) => p !== scorer);
      if (others.length > 0 && rng.chance(assistP)) {
        pickByPower(others, 'playmaking', ASSIST_POWER).box.ast += 1;
      }
    } else if (result === 'block') {
      scorer.box.fga += 1;
      if (action === 'three') scorer.box.tpa += 1;
      // Both rim and perimeter swats credit the dedicated blocking trait, so a
      // long shot-blocker (not a guard who happens to be the nearest defender)
      // gets the rejection.
      pickByPower(defense.onCourt, 'blocking', BLOCK_POWER).box.blk += 1;
      creditRebound(offense, defense);
    } else if (result === 'steal') {
      scorer.box.tov += 1;
      pickByPower(defense.onCourt, 'stealing', STEAL_POWER).box.stl += 1;
    } else if (result === 'turnover') {
      scorer.box.tov += 1;
    } else {
      scorer.box.fga += 1;
      if (action === 'three') scorer.box.tpa += 1;
      creditRebound(offense, defense);
    }

    // Minutes + fatigue for this possession (after the scorer is known).
    drainRecover(offense, scorer, possInQuarter);

    const isBigPlay =
      (succeeded && (action === 'dunk' || action === 'three' || result === 'and-one')) ||
      (!succeeded && (result === 'block' || result === 'steal')) ||
      (crunch && succeeded);

    events.push({
      seq: seq++,
      clock: clockLabel(quarter, possIndex, possInQuarter),
      quarter,
      team: offenseSide,
      scorerName: scorer.rp.player.name,
      scorerPosition: slot,
      action,
      result,
      points,
      homeScore,
      awayScore,
      successRate,
      isBigPlay,
      callout: calloutFor(action, result),
      text: textFor(scorer.rp.player.name, action, result),
      onCourt: snapshot(),
      subs: subs.length > 0 ? subs : undefined,
    });
  }

  for (let quarter = 1; quarter <= TOTAL_QUARTERS; quarter++) {
    // Dormant crunch-time hook: only fires if a caller supplies one.
    if (quarter === TOTAL_QUARTERS && config.decisionHook) {
      const decision = config.decisionHook({
        quarter,
        margin: homeScore - awayScore,
        rng,
      });
      if (decision?.focusOverride) homeFocusOverride = decision.focusOverride;
    }

    const homePoss = possessionsFor(config.home);
    const awayPoss = possessionsFor(config.away);
    const maxPoss = Math.max(homePoss, awayPoss);

    // Alternate which side leads each quarter. If one side always shot first it would
    // always get the last possession of the quarter (a real ~7% edge); since the player
    // is always the sim's "home", that quietly handicapped every game. Splitting the
    // lead by quarter makes two evenly matched teams a true coin flip.
    const homeLeads = quarter % 2 === 1;
    for (let i = 0; i < maxPoss; i++) {
      if (homeLeads) {
        if (i < homePoss) runPossession('home', quarter, i, homePoss);
        if (i < awayPoss) runPossession('away', quarter, i, awayPoss);
      } else {
        if (i < awayPoss) runPossession('away', quarter, i, awayPoss);
        if (i < homePoss) runPossession('home', quarter, i, homePoss);
      }
    }
  }

  // No ties: the higher-clutch team hits a buzzer beater (from its on-court five).
  if (homeScore === awayScore) {
    const homeClutchWins = homeState.aggregate.clutch >= awayState.aggregate.clutch;
    const side: SimTeamSide = homeClutchWins ? 'home' : 'away';
    const state = stateFor(side);
    const { pgs: scorer, slot } = pickScorer(state, rng);
    scorer.box.pts += 2;
    scorer.box.fga += 1;
    scorer.box.fgm += 1;
    if (side === 'home') homeScore += 2;
    else awayScore += 2;
    events.push({
      seq: seq++,
      clock: `Q${TOTAL_QUARTERS} 0:00`,
      quarter: TOTAL_QUARTERS,
      team: side,
      scorerName: scorer.rp.player.name,
      scorerPosition: slot,
      action: 'midrange',
      result: 'score',
      points: 2,
      homeScore,
      awayScore,
      successRate: 50,
      isBigPlay: true,
      callout: 'BUZZER BEATER!',
      text: `${scorer.rp.player.name} hits the buzzer beater!`,
      onCourt: snapshot(),
    });
  }

  const boxFor = (side: SideState): BoxLine[] =>
    side.all.map((p) => ({ ...p.box, energy: Math.round(p.energy) }));

  return {
    events,
    finalHome: homeScore,
    finalAway: awayScore,
    winner: homeScore > awayScore ? 'home' : 'away',
    box: { home: boxFor(homeState), away: boxFor(awayState) },
    seed: config.seed,
  };
}
