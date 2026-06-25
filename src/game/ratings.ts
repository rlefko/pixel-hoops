import type { PlayerStats } from '@/types/player';
import type { Position } from '@/types/roster';

/**
 * Derived ratings: the bridge between the ten raw stats and what the player
 * sees. Cards show one OVR plus three composites (OFF/DEF/ATH); the raw ten are
 * one tap away. All composites are weighted averages on the surface scale
 * (BBGM-style Sigma(rating*w)/Sigma(w)). Pure and dependency-free (type-only
 * imports) so tests and tooling can reuse it. Inputs may exceed the normal cap
 * for team aggregates (synergy bonuses), so we never clamp the inputs, only round.
 */

type Weights = Partial<Record<keyof PlayerStats, number>>;

/** Weighted average of selected stats; weights need not sum to anything. */
function weighted(s: PlayerStats, weights: Weights): number {
  let num = 0;
  let den = 0;
  for (const key in weights) {
    const w = weights[key as keyof PlayerStats]!;
    num += s[key as keyof PlayerStats] * w;
    den += w;
  }
  return den > 0 ? num / den : 0;
}

const OFF_WEIGHTS: Weights = {
  outside: 3,
  inside: 3,
  playmaking: 2,
  iq: 2,
  athleticism: 1,
  clutch: 1,
};

const DEF_WEIGHTS: Weights = {
  perimeterD: 3,
  interiorD: 3,
  athleticism: 2,
  iq: 2,
};

/** Offensive composite (unrounded, for ranking math). */
export function offRaw(s: PlayerStats): number {
  return weighted(s, OFF_WEIGHTS);
}

/** Defensive composite (unrounded). */
export function defRaw(s: PlayerStats): number {
  return weighted(s, DEF_WEIGHTS);
}

/** Offensive composite, rounded for display. */
export function off(s: PlayerStats): number {
  return Math.round(offRaw(s));
}

/** Defensive composite, rounded for display. */
export function def(s: PlayerStats): number {
  return Math.round(defRaw(s));
}

/** Athleticism passthrough: the third surface chip, cheap and legible. */
export function ath(s: PlayerStats): number {
  return Math.round(s.athleticism);
}

/**
 * Per-position OVR weighting: a center's interior matters more than a point
 * guard's, so the same ratings produce a different overall by slot. `lean`
 * nudges toward the position's signature skills on top of the OFF/DEF blend.
 */
const OVR_WEIGHTS: Record<Position, { off: number; def: number; lean: Weights }> = {
  PG: { off: 3, def: 2, lean: { playmaking: 2, outside: 1 } },
  SG: { off: 3, def: 2, lean: { outside: 2, perimeterD: 1 } },
  SF: { off: 2.5, def: 2.5, lean: { athleticism: 1, perimeterD: 1, outside: 1 } },
  PF: { off: 2.5, def: 2.5, lean: { inside: 1, interiorD: 1 } },
  C: { off: 2, def: 3, lean: { interiorD: 2, inside: 1 } },
};

/** Unrounded position-weighted overall (for ranking/sub decisions). */
export function ovrRaw(s: PlayerStats, position: Position): number {
  const w = OVR_WEIGHTS[position];
  let num = offRaw(s) * w.off + defRaw(s) * w.def;
  let den = w.off + w.def;
  for (const key in w.lean) {
    const lw = w.lean[key as keyof PlayerStats]!;
    num += s[key as keyof PlayerStats] * lw;
    den += lw;
  }
  return num / den;
}

/** Position-weighted overall, rounded for display (surface scale). */
export function ovr(s: PlayerStats, position: Position): number {
  return Math.round(ovrRaw(s, position));
}

/**
 * The player-class ladder, lowest to highest. D is the rookie/streetball floor
 * the player starts with; C-S are the real-NBA class ladder; S+ is the legendary
 * tier; S++ is the emergent APEX, reached only by run-scoped training (skills past
 * 20, up to 30) or by the toughest end-of-run bosses (the "+2 classes" ramp on the
 * S / S+ ladders). The five SELECTABLE ladders top out at S+ (see LADDER_CLASSES
 * in difficulty-mode.ts); S++ is never drafted, only attained.
 *
 * This is the single source of truth for the class a player belongs to (see
 * classForOvr), driving the draft, opponent and recruit scaling, and the badge UI.
 * Kept here (a pure, type-only leaf) so both ratings consumers and
 * src/game/classes.ts can share it without an import cycle.
 */
export type PlayerClass = 'D' | 'C' | 'B' | 'A' | 'S' | 'S+' | 'S++';

export const CLASS_ORDER: readonly PlayerClass[] = ['D', 'C', 'B', 'A', 'S', 'S+', 'S++'];

/**
 * The class an OVR falls into. Most players sit in the 6-20 normal band; D is
 * the floor, C is ~10, up to S at 18-20. Curated greats, run-scoped training, and
 * the hardest bosses push OVR past 20: 22-24 reads S+, 26+ reads the S++ apex. The
 * thresholds line up with the class "levels" in src/game/classes.ts so a class
 * badge always matches the scaling band.
 */
export function classForOvr(ovrValue: number): PlayerClass {
  if (ovrValue >= 26) return 'S++';
  if (ovrValue >= 22) return 'S+';
  if (ovrValue >= 18) return 'S';
  if (ovrValue >= 16) return 'A';
  if (ovrValue >= 12) return 'B';
  if (ovrValue >= 10) return 'C';
  return 'D';
}

export type TierKey = 'rookie' | 'bronze' | 'silver' | 'gold' | 'elite' | 'apex' | 'zenith';

/** Class -> palette-color key (the UI maps the key to a color, keeping this module
 * free of theme dependencies). */
const CLASS_TIER: Record<PlayerClass, TierKey> = {
  D: 'rookie',
  C: 'bronze',
  B: 'silver',
  A: 'gold',
  S: 'elite',
  'S+': 'apex',
  'S++': 'zenith',
};

/**
 * Map an OVR to its class label plus a palette-color key for the badge. A thin
 * wrapper over {@link classForOvr} so card UIs get both at once.
 */
export function tierFor(ovrValue: number): { key: TierKey; label: PlayerClass } {
  const label = classForOvr(ovrValue);
  return { key: CLASS_TIER[label], label };
}
