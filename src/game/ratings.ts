import type { PlayerStats } from '@/types/player';
import type { Position } from '@/types/roster';

/**
 * Derived ratings: the bridge between the ten raw stats and what the player
 * sees. Cards show one OVR plus three composites (OFF/DEF/ATH); the raw ten are
 * one tap away. All composites are weighted averages on the 3-10 surface scale
 * (BBGM-style Sigma(rating*w)/Sigma(w)). Pure and dependency-free (type-only
 * imports) so tests and tooling can reuse it. Inputs may exceed 10 for team
 * aggregates (synergy bonuses), so we never clamp the inputs, only round.
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

/** Position-weighted overall, rounded for display (3-10 surface scale). */
export function ovr(s: PlayerStats, position: Position): number {
  return Math.round(ovrRaw(s, position));
}

export type TierKey = 'bronze' | 'silver' | 'gold' | 'elite' | 'apex' | 'zenith';

/**
 * Map an OVR to a coarse tier. Most players sit on the 3-10 surface scale (top =
 * S); run-scoped training can push skills past 10 (up to 15), lifting OVR into the
 * S+ apex tier and, with deep focused training, the S++ zenith tier. The UI maps
 * the key to a palette color so this module stays free of theme dependencies.
 */
export function tierFor(ovrValue: number): { key: TierKey; label: string } {
  if (ovrValue >= 13) return { key: 'zenith', label: 'S++' };
  if (ovrValue >= 11) return { key: 'apex', label: 'S+' };
  if (ovrValue >= 9) return { key: 'elite', label: 'S' };
  if (ovrValue >= 8) return { key: 'gold', label: 'A' };
  if (ovrValue >= 6) return { key: 'silver', label: 'B' };
  return { key: 'bronze', label: 'C' };
}
