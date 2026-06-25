import { SKILL_STAT_KEYS, type PlayerStats } from '@/types/player';
import type { Position } from '@/types/roster';
import { CLASS_ORDER, classForOvr, ovr, ovrRaw, type PlayerClass } from './ratings';
import { STAT_ELITE_MAX, STAT_MIN, STAT_NORMAL_MAX, clamp, getStatRangeForLevel } from './stat-scaling';

/**
 * The class system's scaling + draft helpers. Builds on the pure class labels in
 * ratings.ts (PlayerClass / classForOvr) and the difficulty bands in
 * stat-scaling.ts to give ONE source of truth for: the in-game OVR "level" each
 * class centers on, how to place any stat line into a class band while preserving
 * its shape (anchorStatsToClass, shared by the real-player bake and procedural
 * generation), and the points cost of drafting a class relative to a ladder.
 *
 * Pure and deterministic. Re-uses ratings.ovrRaw and stat-scaling, so a class
 * badge, an opponent's scaled stats, and a draft cost all agree.
 */

export { CLASS_ORDER, classForOvr, type PlayerClass } from './ratings';

/**
 * The in-game OVR each class centers on (also the "difficulty level" fed to the
 * opponent/recruit scalers). Lines up with classForOvr's thresholds: D=6-9, C=10,
 * B=12-15, A=16, S=18-21, S+=legendary, S++=apex.
 */
const CLASS_LEVEL: Record<PlayerClass, number> = {
  D: 8.0,
  C: 10.0,
  B: 13.0,
  A: 16.0,
  S: 19.0,
  'S+': 22.0,
  'S++': 26.0,
};

/** The scaling level a class centers on. */
export function classLevel(cls: PlayerClass): number {
  return CLASS_LEVEL[cls];
}

/** The class a (possibly fractional) scaling level reads as. Inverse of classLevel. */
export function levelToClass(level: number): PlayerClass {
  return classForOvr(Math.round(level));
}

/** The expected stat band [min,max] for a class (the class level's difficulty band). */
export function classToBand(cls: PlayerClass): { min: number; max: number } {
  return getStatRangeForLevel(classLevel(cls));
}

/** Index of a class in the ladder (D=0 .. S+=5); -1 if unknown. */
function classIndex(cls: PlayerClass): number {
  return CLASS_ORDER.indexOf(cls);
}

/** Negative if a is lower than b, positive if higher, 0 if equal. */
export function compareClass(a: PlayerClass, b: PlayerClass): number {
  return classIndex(a) - classIndex(b);
}

/** The class `steps` rungs above `cls`, clamped to the ladder ends. */
export function classShift(cls: PlayerClass, steps: number): PlayerClass {
  const i = clamp(classIndex(cls) + steps, 0, CLASS_ORDER.length - 1);
  return CLASS_ORDER[i];
}

/**
 * Place a stat line into a class's band while preserving its shape. The line is
 * shifted as a whole so its position-weighted OVR lands on the class level, then
 * each skill is clamped to the normal band; the player's relative strengths (a
 * shooter's outside lead, a big's interior lead) are kept. Condition ratings
 * (stamina/durability) pass through: they are not part of OVR and not a class.
 *
 * Used by BOTH the real-player bake (scripts/fetch-nba.ts) and procedural
 * generation (tournament.generatePlayerOfClass), so real and fake players of the
 * same class read the same on the surface.
 */
export function anchorStatsToClass(
  shape: PlayerStats,
  cls: PlayerClass,
  position: Position
): PlayerStats {
  const delta = classLevel(cls) - ovrRaw(shape, position);
  let out: PlayerStats = { ...shape };
  for (const key of SKILL_STAT_KEYS) {
    out[key] = clamp(Math.round(shape[key] + delta), STAT_MIN, STAT_NORMAL_MAX);
  }
  // Per-skill rounding/clamping can leave the rounded OVR just outside the target
  // class. Nudge the whole line by 1 (preserving shape) until classForOvr(ovr)
  // lands exactly on the class, so the badge never disagrees with the player's
  // class (and a fresh player never shows a spurious upgrade arrow). One integer
  // step moves OVR ~1 (about one class) and the class windows are centered on
  // classLevel, so this converges in a couple of steps; bounded as a safety net.
  for (let guard = 0; guard < 12; guard++) {
    const current = classForOvr(ovr(out, position));
    if (current === cls) break;
    const step = compareClass(cls, current) > 0 ? 1 : -1; // need higher? +1 : lower? -1
    const next: PlayerStats = { ...out };
    let moved = false;
    for (const key of SKILL_STAT_KEYS) {
      const v = clamp(out[key] + step, STAT_MIN, STAT_NORMAL_MAX);
      if (v !== out[key]) moved = true;
      next[key] = v;
    }
    if (!moved) break; // pinned at the floor/ceiling; cannot get closer
    out = next;
  }
  return out;
}

/**
 * Scale a curated legend's stat line toward a target difficulty level, preserving its
 * specialized shape. A boss legend is fielded a notch above the boss's other starters,
 * but is NEVER buffed above its natural ability, so it grows with the run and reaches
 * full all-time-great power only on the late maps / top ladders (where targetLevel
 * meets or exceeds its natural OVR), instead of being an unscaled wall on map 1. Skills
 * clamp to [STAT_MIN, STAT_ELITE_MAX] (the elite cap, so a full-power legend keeps its
 * peaks); condition ratings (stamina/durability) pass through, like anchorStatsToClass.
 */
export function scaleLegendToLevel(
  shape: PlayerStats,
  position: Position,
  targetLevel: number
): PlayerStats {
  const natural = ovrRaw(shape, position);
  const delta = Math.min(natural, targetLevel) - natural; // <= 0: scale down only, never buff
  const out: PlayerStats = { ...shape };
  for (const key of SKILL_STAT_KEYS) {
    out[key] = clamp(Math.round(shape[key] + delta), STAT_MIN, STAT_ELITE_MAX);
  }
  return out;
}

/**
 * The draft point cost of a player of `playerClass` on a `ladderClass` ladder, or
 * null when the player is too strong to draft. Below the ladder is free, at the
 * ladder costs 1, one class above costs 2, and anything higher is barred.
 * Legendaries are the exception: always draftable and always cost 2.
 */
export function classCost(
  playerClass: PlayerClass,
  ladderClass: PlayerClass,
  legendary = false
): number | null {
  if (legendary) return 2;
  const d = classIndex(playerClass) - classIndex(ladderClass);
  if (d < 0) return 0;
  if (d === 0) return 1;
  if (d === 1) return 2;
  return null;
}
