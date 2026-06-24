import type { RosterPlayer } from '@/types/roster';
import { classCost, type PlayerClass } from './classes';
import { ovr, ovrRaw, classForOvr } from './ratings';
import { difficultyMods, type Difficulty, type LadderClass } from './difficulty-mode';

/**
 * The pre-run DRAFT, which replaces the salary cap. Before a run you draft a
 * rotation from your owned collection under a difficulty point budget, paying by
 * each player's class relative to the run's ladder class:
 *
 *   below the ladder class -> 0   at the ladder -> 1   one class above -> 2
 *   anything higher is barred; legendaries always cost 2.
 *
 * Two hard rotation caps: at most {@link MAX_DRAFT_ROTATION} (8) players at the
 * draft, and at most {@link MAX_RUN_ROSTER} (12) during the run (recruiting past
 * 12 forces a drop). Pure and deterministic.
 */

/** Players selectable at the draft. */
export const MAX_DRAFT_ROTATION = 8;
/** Players allowed on the squad during a run (recruiting past this forces a drop). */
export const MAX_RUN_ROSTER = 12;
/** A five is the minimum draftable rotation (you must be able to field a lineup). */
const MIN_ROTATION = 5;

/** Draft points granted for a difficulty (easy 8 / medium 5 / hard 2 / insane 0). */
export function draftPoints(difficulty: Difficulty): number {
  return difficultyMods(difficulty).draftPoints;
}

/** A player's intrinsic class for draft/recruit gating (original class, with a
 * derived fallback from base stats for any legacy player that lacks it). */
export function playerDraftClass(rp: RosterPlayer): PlayerClass {
  return rp.originalClass ?? classForOvr(ovr(rp.player.stats, rp.position));
}

/** The point cost to draft a player on a ladder, or null if the player is barred
 * (more than one class above the ladder, and not a legendary). */
export function draftCostFor(rp: RosterPlayer, ladderClass: LadderClass): number | null {
  return classCost(playerDraftClass(rp), ladderClass, rp.legendary ?? false);
}

/** Whether a player may be drafted on a ladder at all. */
export function isDraftable(rp: RosterPlayer, ladderClass: LadderClass): boolean {
  return draftCostFor(rp, ladderClass) !== null;
}

/** Total points spent by a drafted rotation (barred players count as Infinity). */
export function draftSpend(rotation: readonly RosterPlayer[], ladderClass: LadderClass): number {
  let total = 0;
  for (const rp of rotation) {
    const cost = draftCostFor(rp, ladderClass);
    total += cost ?? Infinity;
  }
  return total;
}

export interface DraftState {
  spent: number;
  budget: number;
  remaining: number;
  size: number;
  over: boolean;
}

/** Evaluate a drafted rotation against the difficulty's point budget. */
export function evaluateDraft(
  rotation: readonly RosterPlayer[],
  ladderClass: LadderClass,
  difficulty: Difficulty
): DraftState {
  const budget = draftPoints(difficulty);
  const spent = draftSpend(rotation, ladderClass);
  return {
    spent,
    budget,
    remaining: budget - spent,
    size: rotation.length,
    over: spent > budget,
  };
}

/**
 * Whether a drafted rotation may start a run: 5-8 players, every one draftable,
 * and total spend within the difficulty's budget.
 */
export function canConfirmDraft(
  rotation: readonly RosterPlayer[],
  ladderClass: LadderClass,
  difficulty: Difficulty
): { ok: boolean; reason?: string } {
  if (rotation.length < MIN_ROTATION) return { ok: false, reason: 'Draft at least five players' };
  if (rotation.length > MAX_DRAFT_ROTATION) {
    return { ok: false, reason: `Rotation is capped at ${MAX_DRAFT_ROTATION}` };
  }
  if (rotation.some((rp) => !isDraftable(rp, ladderClass))) {
    return { ok: false, reason: 'A pick is too strong for this ladder' };
  }
  const { over } = evaluateDraft(rotation, ladderClass, difficulty);
  if (over) return { ok: false, reason: 'Over the draft point budget' };
  return { ok: true };
}

/**
 * A sensible default rotation for the draft: greedily fill up to the rotation cap
 * with the cheapest draftable players within the point budget (best OVR breaking
 * cost ties), guaranteeing at least five. The player adjusts from here.
 */
export function suggestDraft(
  available: readonly RosterPlayer[],
  ladderClass: LadderClass,
  difficulty: Difficulty
): RosterPlayer[] {
  const budget = draftPoints(difficulty);
  const draftable = available.filter((p) => isDraftable(p, ladderClass));
  const sorted = [...draftable].sort((a, b) => {
    const ca = draftCostFor(a, ladderClass) ?? Infinity;
    const cb = draftCostFor(b, ladderClass) ?? Infinity;
    if (ca !== cb) return ca - cb;
    return ovrRaw(b.player.stats, b.position) - ovrRaw(a.player.stats, a.position);
  });
  const picked: RosterPlayer[] = [];
  let spent = 0;
  for (const p of sorted) {
    if (picked.length >= MAX_DRAFT_ROTATION) break;
    const c = draftCostFor(p, ladderClass) ?? Infinity;
    if (spent + c <= budget) {
      picked.push(p);
      spent += c;
    }
  }
  // Backfill to five with the cheapest remaining draftable players if needed.
  for (const p of sorted) {
    if (picked.length >= MIN_ROTATION) break;
    if (!picked.includes(p)) picked.push(p);
  }
  return picked.slice(0, MAX_DRAFT_ROTATION);
}
