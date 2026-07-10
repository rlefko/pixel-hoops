import {
  difficultyAtLeast,
  type Difficulty,
  type LadderClass,
} from './difficulty-mode';
import {
  fourthQuarterPoints,
  stageAllows,
  type SignatureChallenge,
  type SignatureTemplateId,
  type SignatureTier,
} from './signature';
import type { GamePlan, ShowcasePlan } from '@/types/tactics';
import type { StatDelta } from './effects';
import type { RosterPlayer } from '@/types/roster';
import type { BoxLine, OffActionId, SimEvent } from '@/types/sim';

/**
 * THE SHOWCASE: the one player-authored game-plan call. When a chase legend's
 * moment is unproven and the game qualifies, the pregame offers a single toggle
 * that bends the sim toward that legend's bespoke condition, at an honest,
 * visible cost (the other team keys on it). Everything here is pure tuning data
 * and pure reads:
 *
 *  - Biases reshape the weights and gates the sim's EXISTING draws consume
 *    (same draw count, different distributions), strictly upstream of the RNG.
 *    A game without a showcase resolves byte-identically to before the feature.
 *  - The moment itself is still DETECTED from the settled timeline by the
 *    untouched momentMet; nothing here manufactures a stat.
 *  - Benefit and cost are both gated on the showcased player being ON COURT
 *    (enforced at the lineup/simulation call sites, which recompute per sub).
 *
 * Calibration contract: signature-sim.test.ts runs a baseline lane (unchanged,
 * never regenerated: the condition numbers stay calibrated to UN-showcased
 * play) and a showcase lane that pins the lift and the win-rate cost, so the
 * call is a real decision: never a gift, never a mandatory tax.
 */

// --- Per-template bias packages ---

/** How one showcase call bends the sim while the showcased player is on court.
 * Every field's default is the no-op value; each template overrides only the
 * lanes its condition actually needs, so the change surface per call stays
 * small and legible. */
export interface ShowcaseBias {
  /** Usage-load multiplier for the showcased player (overrides, not stacks
   * with, a star coach's 1.6x when both land on the same player). */
  usageMult: number;
  /** Additive bump to the showcased player's `three` shot-diet multiplier
   * (blendTendency clamps at its existing [0.4, 2.2] bounds). */
  threeTendencyAdd: number;
  /** Multiplier on the team assist gate (the 0.75 cap stays untouched). */
  assistRateMult: number;
  /** Weight multiplier for the showcased player inside the assist pick. */
  assistPickMult: number;
  /** Weight multiplier inside the steal attribution pick. */
  stealPickMult: number;
  /** Weight multiplier inside the rebound attribution pick (both ends). */
  reboundPickMult: number;
  /** Flat team-aggregate deltas while on court (event-rate gates). */
  teamDelta: StatDelta;
  /** Team pace bump (pace lives on TeamStats, outside StatDelta). */
  paceAdd: number;
  /** Multiplier funneling the OPPONENT's action weights into rim attacks
   * (drive/layup/dunk/post) while the showcased rim protector patrols: real
   * blocks need real rim traffic. Self-pricing: rim looks are high-value. */
  rimFunnelMult: number;
  /** The honest cost, folded into the aggregate while on court: the other
   * team keys on the call. */
  costDelta: StatDelta;
}

const NO_BIAS: ShowcaseBias = {
  usageMult: 1,
  threeTendencyAdd: 0,
  assistRateMult: 1,
  assistPickMult: 1,
  stealPickMult: 1,
  reboundPickMult: 1,
  teamDelta: {},
  paceAdd: 0,
  rimFunnelMult: 1,
  costDelta: {},
};

/** The offense-call tax: everyone in the building knows who the ball goes to. */
const KEYED_IN: StatDelta = { inside: -1.5, outside: -1.5 };
/** The gamble-call tax: a broken press or an empty crash concedes easy finishes. */
const RUN_OUTS: StatDelta = { interiorD: -1.5 };

/**
 * The eight calls, one per signature template. Numbers are CALIBRATION INPUTS,
 * tuned against the showcase lane in signature-sim.test.ts (never NBA
 * intuition): the lane pins the lift band, the 0.70 template ceiling, and the
 * showcased win-rate floor.
 */
const BIAS_BY_TEMPLATE: Record<SignatureTemplateId, ShowcaseBias> = {
  // Feed the scorer: the dormant star-usage lever, aimed by the player.
  takeover: { ...NO_BIAS, usageMult: 1.2, costDelta: KEYED_IN },
  // Q4 points ride total usage; the closer gets the ball all night.
  clutch: { ...NO_BIAS, usageMult: 1.6, costDelta: KEYED_IN },
  // Mild usage plus a green light: his own diet hunts the three harder.
  rain: { ...NO_BIAS, usageMult: 1.25, threeTendencyAdd: 0.45, costDelta: KEYED_IN },
  // The inverted call: assists credit only non-scorers, so the table-setter's
  // own usage goes DOWN (which also trims his turnover exposure, the clause the
  // <=2 TOV condition needs) while the team looks for him as the passer.
  maestro: {
    ...NO_BIAS,
    usageMult: 0.85,
    assistRateMult: 1.05,
    assistPickMult: 1.3,
    costDelta: KEYED_IN,
  },
  // Both halves, gentler: score through him AND let him set the table.
  conductor: {
    ...NO_BIAS,
    usageMult: 1.15,
    assistRateMult: 1.05,
    assistPickMult: 1.3,
    costDelta: KEYED_IN,
  },
  // Shade the arc, concede the drive into the rim protector. The funnel is the
  // cost: rim attacks are the opponent's highest-value looks.
  wall: { ...NO_BIAS, teamDelta: { blocking: 3 }, rimFunnelMult: 1.5 },
  // Crash both ends; the board goes up for grabs and the run-outs go the
  // other way.
  glass: {
    ...NO_BIAS,
    teamDelta: { rebounding: 1 },
    reboundPickMult: 1.2,
    costDelta: RUN_OUTS,
  },
  // More possessions, more gambles, more pockets to pick; a beaten press
  // concedes layups.
  pickpocket: {
    ...NO_BIAS,
    teamDelta: { stealing: 2 },
    stealPickMult: 1.75,
    paceAdd: 2,
    costDelta: RUN_OUTS,
  },
};

/** The bias package for one template. */
export function showcaseBias(templateId: SignatureTemplateId): ShowcaseBias {
  return BIAS_BY_TEMPLATE[templateId];
}

/** The active showcase for a five: the plan's bias plus the showcased player's
 * index in `players`, or null when no call is armed or the player sits (the
 * on-court gate: benefit and cost both switch off on the bench). */
export function activeShowcase(
  tactic: GamePlan,
  players: readonly RosterPlayer[]
): { index: number; bias: ShowcaseBias } | null {
  const plan = tactic.showcase;
  if (!plan) return null;
  const index = players.findIndex((rp) => rp.player.name === plan.playerName);
  if (index < 0) return null;
  return { index, bias: BIAS_BY_TEMPLATE[plan.templateId] };
}

const RIM_ACTIONS: ReadonlySet<OffActionId> = new Set(['drive', 'layup', 'dunk', 'post']);

/** FUNNEL THEM INSIDE: multiply the opponent's rim-attack action weights so a
 * showcased rim protector sees real traffic. Applied to the already-blended
 * weights, before the single action draw, only while the wall is on court. */
export function funnelRim(
  weights: readonly (readonly [OffActionId, number])[],
  mult: number
): [OffActionId, number][] {
  return weights.map(([action, weight]) => [
    action,
    RIM_ACTIONS.has(action) ? weight * mult : weight,
  ]);
}

// --- The call, in plan language (card copy) ---

export const SHOWCASE_CALL_COPY: Record<SignatureTemplateId, string> = {
  takeover: 'RUN IT THROUGH HIM',
  rain: 'GREEN LIGHT FROM DEEP',
  maestro: "TABLE-SETTER'S NIGHT",
  conductor: 'PUT IT IN HIS HANDS',
  wall: 'FUNNEL THEM INSIDE',
  glass: 'CRASH THE GLASS',
  pickpocket: 'FULL-COURT PRESS',
  clutch: "CLOSER'S GAME",
};

/** One line of what the call does, shown under the toggle. */
export const SHOWCASE_CALL_DETAIL: Record<SignatureTemplateId, string> = {
  takeover: 'The offense runs through him. They will key on it.',
  rain: 'He hunts the three all night. They will chase him off the line.',
  maestro: 'He hunts the pass, not the shot. They will jump the lanes.',
  conductor: 'His hands, his tempo. They will load up on him.',
  wall: 'Shade the arc, concede the drive. Rim looks are theirs to take.',
  glass: 'Everyone crashes. The run-outs go the other way.',
  pickpocket: 'Pick up full court. A broken press is a layup.',
  clutch: 'He closes. Everyone in the building knows it.',
};

/** Coach's notes for the Legends board: the EXISTING levers a chase can pull
 * even before the call (roster shape, coach, route). Discoverable strategy the
 * board can finally say out loud. */
export const CHASE_HINT: Record<SignatureTemplateId, string> = {
  takeover: 'Feed him: a star-led coach, and a five that will not fight him for shots.',
  rain: 'Space the floor around him and let his diet hunt threes.',
  maestro: 'Let him set the table: finishers around him, no rival playmaker.',
  conductor: 'Give him the ball and a running mate who can finish.',
  wall: 'Blocks live at the rim. Hunt teams that attack the paint.',
  glass: 'Field no better rebounder than him and let him own the misses.',
  pickpocket: 'Steals live at the rim. Hunt inside-heavy opponents and run.',
  clutch: 'Keep it close and keep him on the floor when it matters.',
};

// --- Qualification (the missing feedback for non-qualifying farms) ---

export type ShowcaseEligibility = { ok: true } | { ok: false; reason: string };

/**
 * Whether a moment can bank in THIS game, with the exact reason when it cannot
 * (the card's muted state: today the check runs silently after the sim and a
 * player can farm a non-qualifying cell forever without learning why). Mirrors
 * meetsSignatureFloor + stageAllows exactly; decomposed for precise copy.
 */
export function showcaseEligibility(
  challenge: Pick<SignatureChallenge, 'floor' | 'stage'>,
  difficulty: Difficulty,
  ladderClass: LadderClass,
  nodeType: 'game' | 'elite' | 'boss'
): ShowcaseEligibility {
  if (ladderClass !== 'S' && ladderClass !== 'S+') {
    return { ok: false, reason: 'S LADDER AND UP' };
  }
  if (!difficultyAtLeast(difficulty, challenge.floor)) {
    return { ok: false, reason: `NEEDS ${challenge.floor.toUpperCase()} OR HIGHER` };
  }
  if (!stageAllows(challenge.stage, nodeType)) {
    return {
      ok: false,
      reason: challenge.stage === 'boss' ? 'BOSS GAMES ONLY' : 'ELITE OR BOSS GAMES ONLY',
    };
  }
  return { ok: true };
}

// --- The quantitative read (near-miss feedback) ---

/** One axis of a condition: "22/24 PTS" or "3 TOV (max 2)". */
export interface MomentGapPart {
  unit: string;
  actual: number;
  target: number;
  /** atLeast: actual must reach target; atMost: actual must not exceed it. */
  kind: 'atLeast' | 'atMost';
  ok: boolean;
}

export interface MomentGap {
  met: boolean;
  parts: MomentGapPart[];
}

function atLeast(unit: string, actual: number, target: number): MomentGapPart {
  return { unit, actual, target, kind: 'atLeast', ok: actual >= target };
}

function atMost(unit: string, actual: number, target: number): MomentGapPart {
  return { unit, actual, target, kind: 'atMost', ok: actual <= target };
}

/**
 * The legend's line measured against their condition: the single quantitative
 * read behind the box-score row ("22 PTS - MOMENT AT 24"), the summary's
 * closest-attempt line, and the watch tracker's target. Pure stat-vs-target:
 * floor/stage/win qualification is the CALLER's job (momentMet stays the one
 * authority that banks a mark). Null when the legend never checked in, or when
 * CLUTCH GENE has no play-by-play to read.
 */
export function momentGap(
  challenge: SignatureChallenge,
  line: BoxLine | undefined,
  events?: readonly SimEvent[]
): MomentGap | null {
  if (!line || line.seconds <= 0) return null;
  const p = challenge.params;
  let parts: MomentGapPart[];
  switch (challenge.templateId) {
    case 'takeover':
      parts = [atLeast('PTS', line.pts, p.pts ?? 0)];
      break;
    case 'rain':
      parts = [atLeast('3PM', line.tpm, p.threes ?? 0)];
      break;
    case 'maestro':
      parts = [atLeast('AST', line.ast, p.ast ?? 0), atMost('TOV', line.tov, p.maxTov ?? 0)];
      break;
    case 'conductor':
      parts = [atLeast('PTS', line.pts, p.pts ?? 0), atLeast('AST', line.ast, p.ast ?? 0)];
      break;
    case 'wall':
      parts = [atLeast('BLK', line.blk, p.blk ?? 0)];
      break;
    case 'glass':
      parts = [atLeast('REB', line.reb, p.reb ?? 0)];
      break;
    case 'pickpocket':
      parts = [atLeast('STL', line.stl, p.stl ?? 0)];
      break;
    case 'clutch': {
      if (!events) return null;
      parts = [atLeast('Q4 PTS', fourthQuarterPoints(events, challenge.legendName), p.q4pts ?? 0)];
      break;
    }
  }
  return { met: parts.every((part) => part.ok), parts };
}

// --- The watch tracker (dramatization: a pure read over the settled timeline) ---

/** One tracked axis of a chase: "1/2 3PM" climbing with the landed events. */
export interface MomentTrackAxis {
  unit: string;
  target: number;
}

export interface MomentTrack {
  axes: MomentTrackAxis[];
  /** Cumulative counts per axis at each event seq (every seq keyed, carried
   * forward), so the HUD chip climbs with the landed ball. */
  progress: Map<number, number[]>;
  /** The seq where every axis reached its target AND the settled line truly met
   * the condition, or null (the chip climbs and stalls; no false celebration). */
  crossSeq: number | null;
}

/**
 * The live moment tracker for the watch, derived once from the settled timeline
 * (presentation only; outcomes never change). Only the event-attributed
 * templates track live: points, threes, Q4 points, and assists ride SimEvent;
 * blocks, boards, and steals are box-only (SimEvent never attributes them, and
 * it gains no fields), so wall/glass/pickpocket read their result at the box
 * score instead. `finalGap` (the settled box read) gates the crossing so an
 * event-invisible clause (maestro's turnovers) can never celebrate falsely.
 */
export function momentChaseTrack(
  challenge: SignatureChallenge,
  events: readonly SimEvent[],
  finalGap: MomentGap | null
): MomentTrack | null {
  const p = challenge.params;
  let axes: { unit: string; target: number; count: (e: SimEvent) => number }[];
  const scores = (e: SimEvent): boolean =>
    e.team === 'home' && e.points > 0 && e.scorerName === challenge.legendName;
  const assists = (e: SimEvent): boolean =>
    e.team === 'home' && e.points > 0 && e.assist?.name === challenge.legendName;
  switch (challenge.templateId) {
    case 'takeover':
      axes = [{ unit: 'PTS', target: p.pts ?? 0, count: (e) => (scores(e) ? e.points : 0) }];
      break;
    case 'rain':
      axes = [
        {
          unit: '3PM',
          target: p.threes ?? 0,
          count: (e) => (scores(e) && e.action === 'three' ? 1 : 0),
        },
      ];
      break;
    case 'clutch':
      axes = [
        {
          unit: 'Q4 PTS',
          target: p.q4pts ?? 0,
          count: (e) => (scores(e) && e.quarter >= 4 ? e.points : 0),
        },
      ];
      break;
    case 'maestro':
      axes = [{ unit: 'AST', target: p.ast ?? 0, count: (e) => (assists(e) ? 1 : 0) }];
      break;
    case 'conductor':
      axes = [
        { unit: 'PTS', target: p.pts ?? 0, count: (e) => (scores(e) ? e.points : 0) },
        { unit: 'AST', target: p.ast ?? 0, count: (e) => (assists(e) ? 1 : 0) },
      ];
      break;
    case 'wall':
    case 'glass':
    case 'pickpocket':
      return null;
  }
  const progress = new Map<number, number[]>();
  const counts = axes.map(() => 0);
  let crossSeq: number | null = null;
  for (const e of events) {
    axes.forEach((axis, i) => {
      counts[i] += axis.count(e);
    });
    progress.set(e.seq, [...counts]);
    if (crossSeq === null && axes.every((axis, i) => counts[i] >= axis.target)) {
      crossSeq = e.seq;
    }
  }
  // The crossing is only real if the settled box agrees (the tov clause lives
  // there); a stalled chip is honest, a false gold is not.
  if (!finalGap?.met) crossSeq = null;
  return { axes: axes.map(({ unit, target }) => ({ unit, target })), progress, crossSeq };
}

// --- Qualitative odds (the coach-odds law: words, never percentages) ---

export type MomentOddsWord =
  | 'A LONG SHOT'
  | "A PUNCHER'S CHANCE"
  | 'A LIVE LOOK'
  | 'HIS KIND OF NIGHT';

/** Map a measured per-won-game hit rate onto the four-rung ladder. */
export function momentOddsWord(rate: number): MomentOddsWord {
  if (rate < 0.08) return 'A LONG SHOT';
  if (rate < 0.2) return "A PUNCHER'S CHANCE";
  if (rate < 0.4) return 'A LIVE LOOK';
  return 'HIS KIND OF NIGHT';
}

/**
 * Measured per-template, per-tier hit rates among won games at the tier floor,
 * base vs showcased, from the signature-sim harness (a maxed dedicated five;
 * see scripts in that test's header). STATIC on purpose: the card shows the
 * decision's movement in the same qualitative language the coach system uses,
 * never a live number. Re-measure when the sim's texture or the bias constants
 * change (the harness bands will already be shouting).
 */
export const MOMENT_ODDS: Record<
  SignatureTemplateId,
  Record<SignatureTier, { base: number; showcased: number }>
> = {
  takeover: {
    1: { base: 0.5, showcased: 0.63 },
    2: { base: 0.55, showcased: 0.67 },
    3: { base: 0.41, showcased: 0.65 },
  },
  rain: {
    1: { base: 0.52, showcased: 0.67 },
    2: { base: 0.45, showcased: 0.66 },
    3: { base: 0.17, showcased: 0.45 },
  },
  maestro: {
    1: { base: 0.44, showcased: 0.7 },
    2: { base: 0.31, showcased: 0.51 },
    3: { base: 0.22, showcased: 0.48 },
  },
  // T3 conductors net near-flat under the call (usage up pulls assists down,
  // the known tension): the card honestly shows no movement there.
  conductor: {
    1: { base: 0.65, showcased: 0.71 },
    2: { base: 0.43, showcased: 0.63 },
    3: { base: 0.74, showcased: 0.74 },
  },
  wall: {
    1: { base: 0.59, showcased: 0.66 },
    2: { base: 0.54, showcased: 0.61 },
    3: { base: 0.27, showcased: 0.36 },
  },
  glass: {
    1: { base: 0.65, showcased: 0.7 },
    2: { base: 0.58, showcased: 0.71 },
    3: { base: 0.3, showcased: 0.49 },
  },
  // Only T2 pickpockets exist in the baked pool; the unmeasurable tiers mirror it.
  pickpocket: {
    1: { base: 0.28, showcased: 0.36 },
    2: { base: 0.28, showcased: 0.36 },
    3: { base: 0.28, showcased: 0.36 },
  },
  // No T1 clutch legends exist; the cell mirrors T2.
  clutch: {
    1: { base: 0.43, showcased: 0.54 },
    2: { base: 0.43, showcased: 0.54 },
    3: { base: 0.26, showcased: 0.53 },
  },
};

/** The odds ladder the card shows: base word -> showcased word. */
export function momentOddsLadder(
  templateId: SignatureTemplateId,
  tier: SignatureTier
): { base: MomentOddsWord; showcased: MomentOddsWord } {
  const cell = MOMENT_ODDS[templateId][tier];
  return { base: momentOddsWord(cell.base), showcased: momentOddsWord(cell.showcased) };
}

/** Build the ShowcasePlan for an armed call. */
export function showcasePlan(challenge: SignatureChallenge): ShowcasePlan {
  return { playerName: challenge.legendName, templateId: challenge.templateId };
}
