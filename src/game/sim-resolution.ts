import type { PlayerStats } from '@/types/player';
import type { OffActionId } from '@/types/sim';

/**
 * Auto-sim shot resolution, kept separate from the legacy card game's
 * `calculateSuccessRate` (which the card screen still uses). Modeled on the
 * shipped Basketball-GM engine: a make is affine in the shooter's rating minus
 * a defensive offset, nudged by IQ and scaled by fatigue, then clamped. No
 * logistic curves, no ML, just readable arithmetic that is easy to tune. The
 * one-on-one miss-flavor contests use a ratio a/(a+b), the parameter-free form
 * that feels fair. All pure; randomness is supplied by the caller's seeded RNG.
 */

// --- Tunables (score realism lives here) ---

/** How much the shooter's normalized rating swings the make rate. */
const SLOPE = 0.45;
/** How much the contesting defender's normalized rating subtracts. */
const DEF_WEIGHT = 0.3;
/** Floor/ceiling on a make probability so nothing is automatic. */
const MIN_P = 0.03;
const MAX_P = 0.97;
/** Max efficiency bonus (in make probability) from elite shot IQ. */
const IQ_MAKE_BONUS = 0.04;
/** Block frequency on rim attacks (interior D vs the finisher). */
const BLOCK_BASE = 1.1;
/** Block frequency on jumpers (perimeter D vs the shooter). */
const JUMPER_BLOCK_BASE = 0.24;
/** Turnover/steal frequency on rim attacks (perimeter D vs playmaking). */
const TURNOVER_BASE = 1.0;

/** Per-action make profile: base rate, points, contact finish, 3P resilience. */
export interface ShotProfile {
  base: number;
  points: number;
  /** Contact finish at the rim (can draw an and-one; rim-attack miss flavor). */
  finish: boolean;
  /** Spot-up shot whose accuracy resists fatigue until severe (true for threes). */
  resilient: boolean;
}

export const SHOT_PROFILE: Record<OffActionId, ShotProfile> = {
  three: { base: 0.32, points: 3, finish: false, resilient: true },
  midrange: { base: 0.4, points: 2, finish: false, resilient: false },
  drive: { base: 0.47, points: 2, finish: true, resilient: false },
  layup: { base: 0.55, points: 2, finish: true, resilient: false },
  dunk: { base: 0.62, points: 2, finish: true, resilient: false },
};

/** Which offensive rating drives each action (some blend two). */
export const ACTION_OFF: Record<OffActionId, (s: PlayerStats) => number> = {
  three: (s) => s.outside,
  midrange: (s) => s.outside * 0.6 + s.inside * 0.4,
  drive: (s) => s.playmaking * 0.6 + s.athleticism * 0.4,
  layup: (s) => s.inside,
  dunk: (s) => s.inside * 0.5 + s.athleticism * 0.5,
};

/** Which defensive rating contests each action (perimeter vs interior). */
export const ACTION_DEF: Record<OffActionId, (s: PlayerStats) => number> = {
  three: (s) => s.perimeterD,
  midrange: (s) => s.perimeterD,
  drive: (s) => s.perimeterD,
  layup: (s) => s.interiorD,
  dunk: (s) => s.interiorD,
};

/** Normalize a 3-10 rating to ~0..1 (team aggregates may exceed 1). */
function q(rating: number): number {
  return (rating - 3) / 7;
}

/** Clamp helper. */
function clampNum(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Parameter-free one-on-one contest probability. */
export function ratio(a: number, b: number): number {
  return a + b <= 0 ? 0.5 : a / (a + b);
}

export interface MakeArgs {
  action: OffActionId;
  /** Shooter's (or on-court aggregate's) offensive rating for this action. */
  offRating: number;
  /** Contesting defensive rating (already including any lockdown bonus). */
  defRating: number;
  /** Offense IQ (lifts efficiency on the margin). */
  iq: number;
  /** Multiplicative fatigue penalty, 0..1 (default 1 = fresh). */
  fatigueMult?: number;
  /** Additive crunch-time nudge in make probability (default 0). */
  clutchDelta?: number;
}

/**
 * Probability (0..1) that an attempted shot goes in. Affine in the rating
 * matchup, plus a capped IQ bonus and clutch nudge, clamped, then scaled by
 * fatigue (so an exhausted shooter dips below the floor only when truly spent).
 */
export function makeProbability(args: MakeArgs): number {
  const profile = SHOT_PROFILE[args.action];
  const iqBonus = clampNum((args.iq - 5) * 0.008, 0, IQ_MAKE_BONUS);
  const raw =
    profile.base +
    SLOPE * q(args.offRating) -
    DEF_WEIGHT * q(args.defRating) +
    iqBonus +
    (args.clutchDelta ?? 0);
  return clampNum(raw, MIN_P, MAX_P) * (args.fatigueMult ?? 1);
}

/** Expected points of an action's make probability (for IQ shot selection). */
export function expectedValue(action: OffActionId, makeP: number): number {
  return makeP * SHOT_PROFILE[action].points;
}

export type MissFlavor = 'block' | 'steal' | 'turnover' | 'miss';

/**
 * Classify a missed possession. Rim attacks can be blocked (interior D vs the
 * finisher) or coughed up (perimeter D vs playmaking, reduced by IQ); jumpers
 * just miss, with a small chance of a perimeter block. `rng` is a chance roller
 * (probability -> boolean) so the engine keeps a single fixed draw order.
 */
export function missFlavor(
  action: OffActionId,
  offense: PlayerStats,
  defense: PlayerStats,
  rng: { chance: (p: number) => boolean }
): MissFlavor {
  if (SHOT_PROFILE[action].finish) {
    const pBlock = ratio(defense.interiorD, ACTION_OFF[action](offense)) * BLOCK_BASE;
    if (rng.chance(pBlock)) return 'block';
    let pTurnover = ratio(defense.perimeterD, offense.playmaking) * TURNOVER_BASE;
    pTurnover *= clampNum(1 - (offense.iq - 5) * 0.04, 0.6, 1.2);
    if (rng.chance(pTurnover)) return rng.chance(0.5) ? 'steal' : 'turnover';
    return 'miss';
  }
  const pBlock = ratio(defense.perimeterD, offense.outside) * JUMPER_BLOCK_BASE;
  if (rng.chance(pBlock)) return 'block';
  return 'miss';
}
