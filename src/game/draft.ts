import { POSITIONS, nameKey, type Position, type RosterPlayer } from '@/types/roster';
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

/** Draft points granted for a difficulty (easy 8 / medium 5 / hard 3 / insane 2). */
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

/** Slot-ordered starting five (index 0 = PG slot ... 4 = C slot) plus bench. */
export interface Loadout {
  starters: RosterPlayer[];
  bench: RosterPlayer[];
}

/** Stable identity used to match a loadout against the owned collection. */
function key(rp: RosterPlayer): string {
  return nameKey(rp.player.name, rp.position);
}

/**
 * Whether a position-slot loadout may start a run: exactly five starters, 5-8
 * total, every pick draftable, no duplicates, and total spend within the budget.
 */
export function canConfirmLoadout(
  starters: readonly RosterPlayer[],
  bench: readonly RosterPlayer[],
  ladderClass: LadderClass,
  difficulty: Difficulty
): { ok: boolean; reason?: string } {
  if (starters.length !== MIN_ROTATION) return { ok: false, reason: 'Fill all five starting slots' };
  const all = [...starters, ...bench];
  if (all.length > MAX_DRAFT_ROTATION) {
    return { ok: false, reason: `Rotation is capped at ${MAX_DRAFT_ROTATION}` };
  }
  if (new Set(all.map(key)).size !== all.length) return { ok: false, reason: 'Duplicate pick' };
  if (all.some((rp) => !isDraftable(rp, ladderClass))) {
    return { ok: false, reason: 'A pick is too strong for this ladder' };
  }
  if (draftSpend(all, ladderClass) > draftPoints(difficulty)) {
    return { ok: false, reason: 'Over the draft point budget' };
  }
  return { ok: true };
}

/**
 * The default pre-run loadout: restore the previous run's lineup (`lastRotation`,
 * slot-ordered) when every player is still owned and the loadout is legal; else
 * build a fresh one by filling each position slot with the best affordable player
 * of that natural position (falling back to any draftable for an empty slot), then
 * the best affordable bench, all within the point budget. Players keep their
 * natural-position slot so the run starts correctly slotted.
 */
export function defaultLoadout(
  available: readonly RosterPlayer[],
  ladderClass: LadderClass,
  difficulty: Difficulty,
  lastRotation?: readonly string[]
): Loadout {
  const byKey = new Map(available.map((p) => [key(p), p]));

  if (lastRotation && lastRotation.length >= MIN_ROTATION) {
    const restored = lastRotation.map((k) => byKey.get(k)).filter((p): p is RosterPlayer => !!p);
    if (restored.length === lastRotation.length) {
      const starters = restored.slice(0, MIN_ROTATION);
      const bench = restored.slice(MIN_ROTATION);
      if (canConfirmLoadout(starters, bench, ladderClass, difficulty).ok) return { starters, bench };
    }
  }

  const budget = draftPoints(difficulty);
  const draftable = available.filter((p) => isDraftable(p, ladderClass));
  const cost = (p: RosterPlayer): number => draftCostFor(p, ladderClass) ?? Infinity;
  // Strongest first (spend the budget on quality), cheaper breaking OVR ties.
  const byValue = (a: RosterPlayer, b: RosterPlayer): number =>
    ovrRaw(b.player.stats, b.position) - ovrRaw(a.player.stats, a.position) || cost(a) - cost(b);

  const used = new Set<RosterPlayer>();
  let spent = 0;
  const take = (p: RosterPlayer): void => {
    used.add(p);
    spent += cost(p);
  };
  const bestAffordable = (pool: RosterPlayer[]): RosterPlayer | undefined =>
    pool.filter((p) => !used.has(p) && spent + cost(p) <= budget).sort(byValue)[0];

  const starters: (RosterPlayer | null)[] = POSITIONS.map(() => null);
  // Pass 1: best affordable player at each slot's natural position.
  POSITIONS.forEach((slot: Position, i) => {
    const pick = bestAffordable(draftable.filter((p) => p.position === slot));
    if (pick) {
      starters[i] = pick;
      take(pick);
    }
  });
  // Pass 2: fill any still-empty slot with any affordable draftable player.
  POSITIONS.forEach((_, i) => {
    if (starters[i]) return;
    const pick = bestAffordable(draftable);
    if (pick) {
      starters[i] = pick;
      take(pick);
    }
  });
  // Bench: up to three more affordable players.
  const bench: RosterPlayer[] = [];
  while (bench.length < MAX_DRAFT_ROTATION - MIN_ROTATION) {
    const pick = bestAffordable(draftable);
    if (!pick) break;
    bench.push(pick);
    take(pick);
  }
  return { starters: starters.filter((p): p is RosterPlayer => !!p), bench };
}
