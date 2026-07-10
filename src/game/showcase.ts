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
  takeover: { ...NO_BIAS, usageMult: 1.7, costDelta: KEYED_IN },
  // Q4 points ride total usage; the closer gets the ball all night.
  clutch: { ...NO_BIAS, usageMult: 1.7, costDelta: KEYED_IN },
  // Mild usage plus a green light: his own diet hunts the three harder.
  rain: { ...NO_BIAS, usageMult: 1.35, threeTendencyAdd: 0.6, costDelta: KEYED_IN },
  // The inverted call: assists credit only non-scorers, so the table-setter's
  // own usage goes DOWN (which also trims his turnover exposure, the clause the
  // <=2 TOV condition needs) while the team looks for him as the passer.
  maestro: {
    ...NO_BIAS,
    usageMult: 0.75,
    assistRateMult: 1.15,
    assistPickMult: 3,
    costDelta: KEYED_IN,
  },
  // Both halves, gentler: score through him AND let him set the table.
  conductor: {
    ...NO_BIAS,
    usageMult: 1.25,
    assistRateMult: 1.1,
    assistPickMult: 2,
    costDelta: KEYED_IN,
  },
  // Shade the arc, concede the drive into the rim protector. The funnel is the
  // cost: rim attacks are the opponent's highest-value looks.
  wall: { ...NO_BIAS, teamDelta: { blocking: 2 }, rimFunnelMult: 1.35 },
  // Crash both ends; the board goes up for grabs and the run-outs go the
  // other way.
  glass: {
    ...NO_BIAS,
    teamDelta: { rebounding: 2 },
    reboundPickMult: 1.75,
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
    1: { base: 0.3, showcased: 0.5 },
    2: { base: 0.28, showcased: 0.48 },
    3: { base: 0.22, showcased: 0.4 },
  },
  rain: {
    1: { base: 0.35, showcased: 0.52 },
    2: { base: 0.33, showcased: 0.5 },
    3: { base: 0.18, showcased: 0.32 },
  },
  maestro: {
    1: { base: 0.28, showcased: 0.42 },
    2: { base: 0.24, showcased: 0.38 },
    3: { base: 0.18, showcased: 0.3 },
  },
  conductor: {
    1: { base: 0.3, showcased: 0.45 },
    2: { base: 0.26, showcased: 0.4 },
    3: { base: 0.2, showcased: 0.32 },
  },
  wall: {
    1: { base: 0.3, showcased: 0.45 },
    2: { base: 0.28, showcased: 0.42 },
    3: { base: 0.15, showcased: 0.26 },
  },
  glass: {
    1: { base: 0.35, showcased: 0.5 },
    2: { base: 0.3, showcased: 0.45 },
    3: { base: 0.24, showcased: 0.38 },
  },
  pickpocket: {
    1: { base: 0.3, showcased: 0.46 },
    2: { base: 0.28, showcased: 0.44 },
    3: { base: 0.16, showcased: 0.28 },
  },
  clutch: {
    1: { base: 0.28, showcased: 0.44 },
    2: { base: 0.24, showcased: 0.4 },
    3: { base: 0.18, showcased: 0.3 },
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
