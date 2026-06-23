import type { PlayerStats } from '@/types/player';
import type { QuarterResult } from '@/types/game-state';
import { POSITIONS } from '@/types/roster';
import type { Team } from '@/types/team';
import type { Focus } from '@/types/tactics';
import type { SimActionId, SimEvent, SimResult, SimTeamSide } from '@/types/sim';
import { TOTAL_QUARTERS } from '@/types/game-state';
import { calculateSuccessRate } from './resolution';
import { pickRiskPosture, type RiskPosture } from './ai';
import { createRNG, type RNG } from './rng';

/**
 * The auto-sim engine. Plays a full game possession-by-possession and returns a
 * deterministic timeline the UI replays with juice. Reuses the card game's
 * success formula (calculateSuccessRate) and risk heuristic (pickRiskPosture),
 * but is driven by five-player team stat lines and a game plan instead of a hand
 * of cards. Same seed always yields the same SimResult.
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
/** Fourth-quarter margin (abs) within which clutch matters. */
const CLUTCH_MARGIN = 6;
/** How strongly clutch nudges the success rate in crunch time. */
const CLUTCH_K = 1.4;
const SECONDS_PER_QUARTER = 720;

// --- Action tables (analogous to card.ts's CARD_STAT_MAP) ---

// Only these five are ever chosen as a possession's action. The defensive ids
// (steal/block/rebound) appear in the maps below for type completeness over
// SimActionId; they surface as outcome labels, not chosen actions.
const OFFENSIVE_ACTIONS: readonly SimActionId[] = [
  'three',
  'midrange',
  'drive',
  'layup',
  'dunk',
];

const ACTION_POINTS: Record<SimActionId, number> = {
  three: 3,
  midrange: 2,
  drive: 2,
  layup: 2,
  dunk: 2,
  steal: 0,
  block: 0,
  rebound: 0,
};

/** Which offensive stat drives each action. */
const ACTION_STAT: Record<SimActionId, keyof PlayerStats> = {
  three: 'shooting',
  midrange: 'shooting',
  drive: 'speed',
  layup: 'athleticism',
  dunk: 'athleticism',
  steal: 'speed',
  block: 'athleticism',
  rebound: 'athleticism',
};

/** Which defensive stat contests each action. */
const ACTION_COUNTER: Record<SimActionId, keyof PlayerStats> = {
  three: 'athleticism',
  midrange: 'athleticism',
  drive: 'speed',
  layup: 'athleticism',
  dunk: 'athleticism',
  steal: 'speed',
  block: 'athleticism',
  rebound: 'athleticism',
};

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

/** Weighted offensive action choice, biased by focus and risk posture. */
function actionWeights(focus: Focus, posture: RiskPosture): [SimActionId, number][] {
  const w: Record<SimActionId, number> = {
    three: 3,
    midrange: 3,
    drive: 3,
    layup: 2,
    dunk: 2,
    steal: 0,
    block: 0,
    rebound: 0,
  };

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

/** How a missed attempt reads, based on the action and a roll. */
function missResult(action: SimActionId, rng: RNG): QuarterResult {
  switch (action) {
    case 'dunk':
    case 'layup':
      return rng.chance(0.6) ? 'block' : 'miss';
    case 'drive':
      if (rng.chance(0.35)) return 'turnover';
      if (rng.chance(0.3)) return 'steal';
      return 'miss';
    default:
      return rng.chance(0.12) ? 'block' : 'miss';
  }
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

    const action = rng.weightedPick(actionWeights(focus, posture));

    const yourStat = offense.teamStats[ACTION_STAT[action]];
    let counterStat = defense.teamStats[ACTION_COUNTER[action]];
    if (defense.tactic.focus === 'lockdown') counterStat += LOCKDOWN_BONUS;

    let successRate = calculateSuccessRate(yourStat, counterStat);

    const crunch = quarter === TOTAL_QUARTERS && Math.abs(margin) <= CLUTCH_MARGIN;
    if (crunch) {
      successRate += (offense.teamStats.clutch - 5) * CLUTCH_K;
      successRate = Math.max(3, Math.min(97, successRate));
    }

    const succeeded = rng.rollPercent(successRate);

    // Pick the scorer by lineup INDEX so the event carries their court slot
    // (POSITIONS[index]), not their intrinsic position. This keeps the active
    // sprite unambiguous even when two players share a real position.
    const scorerIndex = rng.weightedPick(
      offense.lineup.players.map(
        (_, i): [number, number] => [i, offense.lineup.usageWeights[i]]
      )
    );
    const scorer = offense.lineup.players[scorerIndex];

    let points = 0;
    let result: QuarterResult;

    if (succeeded) {
      points = ACTION_POINTS[action];
      result = 'score';
      // Contact finishes can draw the foul for an and-one.
      const finish = action === 'dunk' || action === 'layup' || action === 'drive';
      if (finish && rng.chance(0.12 + Math.max(0, offense.teamStats.clutch - 5) * 0.02)) {
        result = 'and-one';
        points += 1;
      }
    } else {
      result = missResult(action, rng);
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
      successRate: Math.round(successRate * 10) / 10,
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
