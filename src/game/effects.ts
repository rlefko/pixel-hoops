import { STAT_ELITE_MAX, STAT_HARD_MAX, STAT_MIN, STAT_NORMAL_MAX, type PlayerStats } from '@/types/player';
import type { RosterPlayer } from '@/types/roster';

/** A single skill trains up to this; the only path past the normal 20 cap, to the
 * absolute ceiling of 30. */
export const MAX_TRAINED_STAT = STAT_HARD_MAX;

/**
 * The effect/modifier spine. One small, declarative, serialization-safe model
 * funnels all three new sources of power (per-player items, legendary abilities,
 * run-level passive boosts) into the existing buildTeam -> computeTeamStats path.
 *
 * Two mechanisms:
 *  - StatDelta: flat per-player rating deltas, baked into effective-stat COPIES
 *    before buildTeam (items, legend self-auras). The sim never sees these
 *    separately; they live on player.stats by game time.
 *  - TeamModifier: team-level additive bonuses (mirrors SynergyResult) plus a
 *    tiny set of conditional SimHooks. Folded in at the computeTeamStats clamp
 *    site and re-applied on every substitution.
 *
 * SimHook is a PLAIN tagged union (no closures) so a Team/SimResult carrying it
 * stays serializable for replay and fully deterministic.
 */

/** Flat additive deltas to one or more of a player's ten ratings. */
export type StatDelta = Partial<Record<keyof PlayerStats, number>>;

/**
 * Conditional, sim-time rule-benders. Evaluated per possession in
 * simulation.ts. Kept intentionally tiny.
 *  - quarterDelta: add deltas to the owner team's effective line in a quarter
 *    (Jordan "Flu Game" +3 in Q4; the "Ice Water" boost). Applies to the team's
 *    stats whether it is on offense or defense that possession.
 *  - paceClutch: if the owner team plays fast (pace >= minPace), add clutch.
 *  - tiredBench: when an on-court starter dips below `energyBelow`, the team
 *    gets benchDelta (the "Sixth Man" depth payoff).
 *  - opponentRatingMult: the owner bends the OTHER team's rating. `when` picks
 *    the trigger: 'offense' fires while the owner attacks (Shaq "Diesel" halves
 *    your interior D); 'defense' fires while the owner defends (a rim wall caps
 *    your finishing). `unlessDoubled` cancels it when the defending five's
 *    interior D aggregate is high (you committed a second big).
 */
export type SimHook =
  | { kind: 'quarterDelta'; quarter: number; delta: StatDelta }
  | { kind: 'paceClutch'; minPace: number; clutchAdd: number }
  | { kind: 'tiredBench'; energyBelow: number; benchDelta: StatDelta }
  | {
      kind: 'opponentRatingMult';
      stat: keyof PlayerStats;
      mult: number;
      when: 'offense' | 'defense';
      unlessDoubled?: boolean;
    };

/**
 * Team-wide additive bonuses from passive boosts and legend team-auras. The
 * four numeric fields share SynergyResult's semantics so the two sum cleanly at
 * the computeTeamStats clamp site; `extra` carries flat aggregate deltas synergy
 * does not model (e.g. team-wide +1 outside); `hooks` carry the conditional set.
 */
export interface TeamModifier {
  paceBonus: number;
  clutchBonus: number;
  defenseBonus: number;
  offenseBonus: number;
  extra: StatDelta;
  hooks: SimHook[];
  labels: string[];
}

export const EMPTY_TEAM_MODIFIER: TeamModifier = {
  paceBonus: 0,
  clutchBonus: 0,
  defenseBonus: 0,
  offenseBonus: 0,
  extra: {},
  hooks: [],
  labels: [],
};

/** Whether a delta has at least one non-zero entry. */
export function hasDelta(delta: StatDelta): boolean {
  for (const key in delta) if (delta[key as keyof PlayerStats]) return true;
  return false;
}

/** Sum two stat deltas into a fresh delta. */
export function addStatDelta(a: StatDelta, b: StatDelta): StatDelta {
  const out: StatDelta = { ...a };
  for (const k in b) {
    const key = k as keyof PlayerStats;
    out[key] = (out[key] ?? 0) + (b[key] ?? 0);
  }
  return out;
}

/** Above the normal cap each extra point of a flat item/ability reward counts for
 * this much, so a big bonus still lands on an already-strong stat (sharpening a
 * specialist) rather than leaking into the clamp. */
const OVER_CAP_RATE = 0.5;

/**
 * Soft-cap a raw stat from items/abilities: full value through the normal cap
 * (STAT_NORMAL_MAX = 20), then diminishing returns up to the elite ceiling
 * (STAT_ELITE_MAX = 24). A +6 on an 18 shooter now lands ~+4 (to 22) instead of
 * the old hard-clamp +2, so investment widens a specialist's lead. Training
 * (applyTrainingDelta) stays the only channel that reaches the 30 hard cap.
 */
function softCapStat(raw: number): number {
  if (raw <= STAT_NORMAL_MAX) return raw;
  const over = Math.round((raw - STAT_NORMAL_MAX) * OVER_CAP_RATE);
  return Math.min(STAT_NORMAL_MAX + over, STAT_ELITE_MAX);
}

/** Apply a stat delta to a player line. Positive deltas soft-cap above the normal
 * band (up to the elite ceiling); the floor stays STAT_MIN (pure copy). */
export function applyStatDelta(stats: PlayerStats, delta: StatDelta): PlayerStats {
  const out = { ...stats };
  for (const k in delta) {
    const key = k as keyof PlayerStats;
    out[key] = Math.max(STAT_MIN, softCapStat(out[key] + (delta[key] ?? 0)));
  }
  return out;
}

/**
 * Apply a run-scoped TRAINING delta, clamped to [STAT_MIN, MAX_TRAINED_STAT] (pure
 * copy). Training is the only source that may push a skill above the normal 20 cap
 * (up to 30, the S++ ceiling); items and abilities stay capped at 20 via
 * applyStatDelta.
 */
export function applyTrainingDelta(stats: PlayerStats, delta: StatDelta | undefined): PlayerStats {
  if (!delta) return stats;
  const out = { ...stats };
  for (const k in delta) {
    const key = k as keyof PlayerStats;
    out[key] = Math.max(STAT_MIN, Math.min(MAX_TRAINED_STAT, out[key] + (delta[key] ?? 0)));
  }
  return out;
}

/** A player's effective value for one skill, including run-scoped training. */
export function trainedStat(rp: RosterPlayer, key: keyof PlayerStats): number {
  return rp.player.stats[key] + (rp.trainingDelta?.[key] ?? 0);
}

/** Build a full TeamModifier from a partial fragment (abilities supply these). */
export function teamModifierFromPartial(p: Partial<TeamModifier>): TeamModifier {
  return {
    paceBonus: p.paceBonus ?? 0,
    clutchBonus: p.clutchBonus ?? 0,
    defenseBonus: p.defenseBonus ?? 0,
    offenseBonus: p.offenseBonus ?? 0,
    extra: p.extra ? { ...p.extra } : {},
    hooks: p.hooks ? [...p.hooks] : [],
    labels: p.labels ? [...p.labels] : [],
  };
}

/** Scale a TeamModifier fragment's numeric fields and extra deltas by a factor. */
export function scaleTeamModifier(p: Partial<TeamModifier>, factor: number): TeamModifier {
  const extra: StatDelta = {};
  if (p.extra) {
    for (const k in p.extra) {
      const key = k as keyof PlayerStats;
      extra[key] = (p.extra[key] ?? 0) * factor;
    }
  }
  return {
    paceBonus: (p.paceBonus ?? 0) * factor,
    clutchBonus: (p.clutchBonus ?? 0) * factor,
    defenseBonus: (p.defenseBonus ?? 0) * factor,
    offenseBonus: (p.offenseBonus ?? 0) * factor,
    extra,
    // Hooks are applied once regardless of tier (they are conditional rules,
    // not magnitudes), so they are not scaled.
    hooks: p.hooks ? [...p.hooks] : [],
    labels: p.labels ? [...p.labels] : [],
  };
}

/** Merge many TeamModifiers into one (sum fields, concat hooks/labels). */
export function mergeTeamModifiers(mods: readonly TeamModifier[]): TeamModifier {
  const out: TeamModifier = {
    paceBonus: 0,
    clutchBonus: 0,
    defenseBonus: 0,
    offenseBonus: 0,
    extra: {},
    hooks: [],
    labels: [],
  };
  for (const m of mods) {
    out.paceBonus += m.paceBonus;
    out.clutchBonus += m.clutchBonus;
    out.defenseBonus += m.defenseBonus;
    out.offenseBonus += m.offenseBonus;
    out.extra = addStatDelta(out.extra, m.extra);
    if (m.hooks.length) out.hooks = out.hooks.concat(m.hooks);
    if (m.labels.length) out.labels = out.labels.concat(m.labels);
  }
  return out;
}
