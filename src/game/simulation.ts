import type { PlayerStats } from '@/types/player';
import type { QuarterResult } from '@/types/game-state';
import { POSITIONS, type Position, type RosterPlayer } from '@/types/roster';
import type { Team, TeamStats } from '@/types/team';
import type { Focus } from '@/types/tactics';
import type {
  BoxLine,
  OffActionId,
  OnCourtFive,
  OnCourtSnapshot,
  SimActionId,
  SimEvent,
  SimResult,
  SimSub,
  SimTeamSide,
} from '@/types/sim';
import { TOTAL_QUARTERS } from '@/types/game-state';
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
const PACE_BASELINE = 7;
const MIN_POSSESSIONS = 8;
const MAX_POSSESSIONS = 18;
/** A lockdown game plan adds this to the opponent's defensive counter stat. */
const LOCKDOWN_BONUS = 1.5;
/**
 * Per-game shooting "form": each team draws a hot/cold offset (in rating points)
 * once per game that lifts or drops their offense all night. Independent
 * per-shot luck washes out over ~60 possessions, so this correlated factor is
 * what keeps upsets alive: a cold favorite can drop one to a hot underdog.
 */
const FORM_RANGE = 1.6;
/**
 * How hard basketball IQ pulls shot selection toward the highest expected-value
 * looks (rim and threes) and away from contested long twos. A smart five hunts
 * good shots (the NBA-2K tendency vs ability split); a low-IQ five chucks.
 */
const IQ_PULL = 0.6;
/** Fourth-quarter margin (abs) within which clutch matters. */
const CLUTCH_MARGIN = 6;
/** How strongly clutch nudges the success rate in crunch time. */
const CLUTCH_K = 1.4;
const SECONDS_PER_QUARTER = 720;

// --- Fatigue + rotation tunables ---

/** Energy a normal-stamina starter loses per possession on the floor. */
const DRAIN_BASE = 1.6;
/** Energy a benched player recovers per possession off the floor. */
const RECOVER = 2.6;
/** The ball-handler/scorer works harder, so drains faster. */
const SCORER_DRAIN_MULT = 1.5;
/** Pull a starter once energy drops below this. */
const SUB_OUT_ENERGY = 45;
/** Only bring in a bench player who has recovered above this (hysteresis). */
const SUB_IN_ENERGY = 78;
/** Share of made field goals that are assisted, scaled by team playmaking. */
const ASSIST_RATE = 0.9;

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
      defRating: 5,
      iq: stats.iq,
    });
    const ev = expectedValue(a, p);
    return a === 'midrange' ? ev * 0.92 : ev;
  });
  const meanEv = evs.reduce((sum, e) => sum + e, 0) / evs.length;
  const pull = (IQ_PULL * (stats.iq - 5)) / 5;
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
    aggregate: team.teamStats,
    form,
  };
}

/** Recompute usage + aggregate (and synergy) for the current five. */
function recomputeAggregate(side: SideState): void {
  const players = side.onCourt.map((p) => p.rp);
  const synergy = computeSynergy(players);
  side.weights = computeUsageWeights(players, side.team.tactic);
  side.aggregate = computeTeamStats(players, side.weights, synergy, side.team.tactic);
}

/**
 * Deterministic rotation. Pull any starter below SUB_OUT_ENERGY for the best
 * rested off-court player (same position first, then higher energy-weighted
 * overall, roster index as the tie-break), but only if the fresh player is
 * actually more valuable right now. Hysteresis (out at 45, in at 78) prevents
 * thrashing, and a benchless team simply never subs. No RNG, so subs are fully
 * reproducible. Returns the subs made for the event stream.
 */
function substitute(side: SideState, team: SimTeamSide): SimSub[] {
  const subs: SimSub[] = [];
  let changed = false;
  for (let slot = 0; slot < side.onCourt.length; slot++) {
    const current = side.onCourt[slot];
    if (current.energy >= SUB_OUT_ENERGY) continue;
    const position = POSITIONS[slot];

    // Effective value weights overall by the real fatigue multiplier (not raw
    // energy), so a tired star is not benched for a fresh scrub: the penalty
    // only maxes near 20%, so the fresh player must be close in quality.
    const effective = (p: PlayerGameState): number =>
      ovrRaw(p.rp.player.stats, position) * fatigueMultiplier(p.energy, false);

    let best: PlayerGameState | null = null;
    let bestKey = -Infinity;
    side.all.forEach((p, index) => {
      if (p.onCourt || p.energy < SUB_IN_ENERGY) return;
      const samePos = p.rp.position === position ? 1 : 0;
      const key = samePos * 1000 + effective(p) - index * 0.001;
      if (key > bestKey) {
        bestKey = key;
        best = p;
      }
    });
    if (!best) continue;

    const fresh = best as PlayerGameState;
    if (effective(fresh) <= effective(current)) continue;

    current.onCourt = false;
    fresh.onCourt = true;
    fresh.box.slot = position;
    side.onCourt[slot] = fresh;
    subs.push({ team, slot: position, outName: current.rp.player.name, inName: fresh.rp.player.name });
    changed = true;
  }
  if (changed) recomputeAggregate(side);
  return subs;
}

/** Drain the five on the floor (the scorer hardest), recover the bench, log minutes. */
function drainRecover(side: SideState, scorer: PlayerGameState, possInQuarter: number): void {
  const paceFactor = side.aggregate.pace / PACE_BASELINE;
  const secondsPerPoss = SECONDS_PER_QUARTER / possInQuarter;
  for (const p of side.all) {
    if (p.onCourt) {
      // Lower stamina drains faster (13 - stamina) / 7: stamina 10 ~0.43x, 3 ~1.43x.
      const staminaFactor = (13 - p.rp.player.stats.stamina) / 7;
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

  // Weighted pick over a five by a stat (credits defenders/rebounders/assisters).
  const pickByStat = (five: PlayerGameState[], stat: keyof PlayerStats): PlayerGameState =>
    rng.weightedPick(
      five.map((p): [PlayerGameState, number] => [p, Math.max(0.1, p.rp.player.stats[stat])])
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

  const snapshot = (): OnCourtSnapshot => ({
    home: fiveOf(homeState),
    away: fiveOf(awayState),
  });

  /** Decide the rebound and credit it to one side's five (defense favored). */
  function creditRebound(offense: SideState, defense: SideState): void {
    const offReb = offense.aggregate.interiorD;
    const defReb = defense.aggregate.interiorD + 6; // boards skew defensive
    const offensive = rng.chance(offReb / (offReb + defReb));
    const board = offensive ? offense : defense;
    pickByStat(board.onCourt, 'interiorD').box.reb += 1;
  }

  function runPossession(
    offenseSide: SimTeamSide,
    quarter: number,
    possIndex: number,
    possInQuarter: number
  ): void {
    const offense = stateFor(offenseSide);
    const defense = stateFor(offenseSide === 'home' ? 'away' : 'home');

    // Rotation first: tired starters yield to fresh legs before the play.
    const subs = substitute(offense, offenseSide);

    const offenseScore = offenseSide === 'home' ? homeScore : awayScore;
    const defenseScore = offenseSide === 'home' ? awayScore : homeScore;
    const margin = offenseScore - defenseScore;
    const posture = pickRiskPosture(margin);

    const focus =
      offenseSide === 'home' && homeFocusOverride
        ? homeFocusOverride
        : offense.team.tactic.focus;

    const action = rng.weightedPick(actionWeights(offense.aggregate, focus, posture));

    // Scorer by court slot (index), chosen before the make roll so their own
    // fatigue (and clutch, later) feed the probability.
    const { pgs: scorer, slot } = pickScorer(offense, rng);

    const offRating = ACTION_OFF[action](offense.aggregate) + offense.form;
    let defRating = ACTION_DEF[action](defense.aggregate);
    if (defense.team.tactic.focus === 'lockdown') defRating += LOCKDOWN_BONUS;

    const crunch = quarter === TOTAL_QUARTERS && Math.abs(margin) <= CLUTCH_MARGIN;
    const clutchDelta = crunch ? ((offense.aggregate.clutch - 5) * CLUTCH_K) / 100 : 0;
    const fatigueMult = fatigueMultiplier(scorer.energy, SHOT_PROFILE[action].resilient);

    const makeP = makeProbability({
      action,
      offRating,
      defRating,
      iq: offense.aggregate.iq,
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
        rng.chance(0.12 + Math.max(0, offense.aggregate.clutch - 5) * 0.02)
      ) {
        result = 'and-one';
        points += 1;
      }
    } else {
      result = missFlavor(action, offense.aggregate, defense.aggregate, rng);
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
      const assistP = ASSIST_RATE * (offense.aggregate.playmaking / 10);
      const others = offense.onCourt.filter((p) => p !== scorer);
      if (others.length > 0 && rng.chance(assistP)) {
        pickByStat(others, 'playmaking').box.ast += 1;
      }
    } else if (result === 'block') {
      scorer.box.fga += 1;
      if (action === 'three') scorer.box.tpa += 1;
      const stat = SHOT_PROFILE[action].finish ? 'interiorD' : 'perimeterD';
      pickByStat(defense.onCourt, stat).box.blk += 1;
      creditRebound(offense, defense);
    } else if (result === 'steal') {
      scorer.box.tov += 1;
      pickByStat(defense.onCourt, 'perimeterD').box.stl += 1;
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

    for (let i = 0; i < maxPoss; i++) {
      if (i < homePoss) runPossession('home', quarter, i, homePoss);
      if (i < awayPoss) runPossession('away', quarter, i, awayPoss);
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
