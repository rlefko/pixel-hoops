import type { QuarterResult } from '@/types/game-state';
import { POSITIONS } from '@/types/roster';
import type { Team, TeamStats } from '@/types/team';
import type { Focus } from '@/types/tactics';
import type {
  OffActionId,
  SimActionId,
  SimEvent,
  SimResult,
  SimTeamSide,
} from '@/types/sim';
import { TOTAL_QUARTERS } from '@/types/game-state';
import {
  makeProbability,
  missFlavor,
  expectedValue,
  ACTION_OFF,
  ACTION_DEF,
  SHOT_PROFILE,
} from './sim-resolution';
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

// --- The engine ---

export function simulateGame(config: SimConfig): SimResult {
  const rng = createRNG(config.seed);
  const events: SimEvent[] = [];

  let homeScore = 0;
  let awayScore = 0;
  let seq = 0;
  let homeFocusOverride: Focus | null = null;

  // Each team's hot/cold shooting night (drawn once, applied to offense all game).
  const homeForm = (rng.next() - 0.5) * 2 * FORM_RANGE;
  const awayForm = (rng.next() - 0.5) * 2 * FORM_RANGE;

  const sideTeam = (side: SimTeamSide): Team =>
    side === 'home' ? config.home : config.away;

  function runPossession(
    offenseSide: SimTeamSide,
    quarter: number,
    possIndex: number,
    possInQuarter: number
  ): void {
    const offense = sideTeam(offenseSide);
    const defense = sideTeam(offenseSide === 'home' ? 'away' : 'home');

    const offenseScore = offenseSide === 'home' ? homeScore : awayScore;
    const defenseScore = offenseSide === 'home' ? awayScore : homeScore;
    const margin = offenseScore - defenseScore;
    const posture = pickRiskPosture(margin);

    const focus =
      offenseSide === 'home' && homeFocusOverride
        ? homeFocusOverride
        : offense.tactic.focus;

    const action = rng.weightedPick(actionWeights(offense.teamStats, focus, posture));

    // Pick the scorer by lineup INDEX so the event carries their court slot
    // (POSITIONS[index]), not their intrinsic position. This keeps the active
    // sprite unambiguous even when two players share a real position, and is
    // chosen before the make roll so a future per-scorer clutch/fatigue read
    // can feed the probability.
    const scorerIndex = rng.weightedPick(
      offense.lineup.players.map(
        (_, i): [number, number] => [i, offense.lineup.usageWeights[i]]
      )
    );
    const scorer = offense.lineup.players[scorerIndex];

    const form = offenseSide === 'home' ? homeForm : awayForm;
    const offRating = ACTION_OFF[action](offense.teamStats) + form;
    let defRating = ACTION_DEF[action](defense.teamStats);
    if (defense.tactic.focus === 'lockdown') defRating += LOCKDOWN_BONUS;

    const crunch = quarter === TOTAL_QUARTERS && Math.abs(margin) <= CLUTCH_MARGIN;
    // Crunch nudge in make-probability space (0..1). Small by design.
    const clutchDelta = crunch ? ((offense.teamStats.clutch - 5) * CLUTCH_K) / 100 : 0;

    const makeP = makeProbability({
      action,
      offRating,
      defRating,
      iq: offense.teamStats.iq,
      clutchDelta,
    });
    const successRate = Math.round(makeP * 1000) / 10;
    const succeeded = rng.chance(makeP);

    let points = 0;
    let result: QuarterResult;

    if (succeeded) {
      points = SHOT_PROFILE[action].points;
      result = 'score';
      // Contact finishes (drive/layup/dunk) can draw the foul for an and-one.
      if (
        SHOT_PROFILE[action].finish &&
        rng.chance(0.12 + Math.max(0, offense.teamStats.clutch - 5) * 0.02)
      ) {
        result = 'and-one';
        points += 1;
      }
    } else {
      result = missFlavor(action, offense.teamStats, defense.teamStats, rng);
    }

    if (offenseSide === 'home') homeScore += points;
    else awayScore += points;

    const isBigPlay =
      (succeeded && (action === 'dunk' || action === 'three' || result === 'and-one')) ||
      (!succeeded && (result === 'block' || result === 'steal')) ||
      (crunch && succeeded);

    events.push({
      seq: seq++,
      clock: clockLabel(quarter, possIndex, possInQuarter),
      quarter,
      team: offenseSide,
      scorerName: scorer.player.name,
      scorerPosition: POSITIONS[scorerIndex],
      action,
      result,
      points,
      homeScore,
      awayScore,
      successRate,
      isBigPlay,
      callout: calloutFor(action, result),
      text: textFor(scorer.player.name, action, result),
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

  // No ties: the higher-clutch team hits a buzzer beater.
  if (homeScore === awayScore) {
    const homeClutchWins = config.home.teamStats.clutch >= config.away.teamStats.clutch;
    const side: SimTeamSide = homeClutchWins ? 'home' : 'away';
    const team = sideTeam(side);
    const scorerIndex = rng.weightedPick(
      team.lineup.players.map(
        (_, i): [number, number] => [i, team.lineup.usageWeights[i]]
      )
    );
    const scorer = team.lineup.players[scorerIndex];
    if (side === 'home') homeScore += 2;
    else awayScore += 2;
    events.push({
      seq: seq++,
      clock: `Q${TOTAL_QUARTERS} 0:00`,
      quarter: TOTAL_QUARTERS,
      team: side,
      scorerName: scorer.player.name,
      scorerPosition: POSITIONS[scorerIndex],
      action: 'midrange',
      result: 'score',
      points: 2,
      homeScore,
      awayScore,
      successRate: 50,
      isBigPlay: true,
      callout: 'BUZZER BEATER!',
      text: `${scorer.player.name} hits the buzzer beater!`,
    });
  }

  return {
    events,
    finalHome: homeScore,
    finalAway: awayScore,
    winner: homeScore > awayScore ? 'home' : 'away',
    seed: config.seed,
  };
}
