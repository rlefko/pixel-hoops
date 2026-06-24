import type { RosterPlayer } from '@/types/roster';
import { ovrRaw } from './ratings';
import { clamp } from './stat-scaling';

/**
 * The starting-five salary cap: the team-building constraint that keeps the game
 * honest across runs. Each player costs a CONVEX function of their OVR, so five
 * maxed-out studs never fit the cap while a balanced mix does. You pick your five
 * under the cap before each run, which prevents simply fielding every upgraded
 * superstar at once. The cap grows slowly with the earned League tier (permanent
 * power raises the floor) but never enough to field a five of 10-OVR players.
 *
 * Pure and deterministic (ovrRaw has no RNG), so the budget is replay-safe.
 */

/** Run-1 cap. A rookie five of real free agents fits with room; stacking
 * several upgraded studs does not. */
const BUDGET_BASE = 40;
/** Each unlocked League tier raises the cap a little (earned power). */
const BUDGET_PER_TIER = 4;
/** Floor (vestigial: the cap only grows with tier, never below the base). */
const BUDGET_FLOOR = 30;
/** Hard ceiling so meta growth never trivializes roster construction. */
const BUDGET_MAX = 80;

/** Costs are flat below this OVR and rise convexly above it. */
const COST_PIVOT = 5;
/** Convexity: a maxed stud costs many times a role player. */
const COST_POW = 1.9;

/**
 * A player's salary cost from their raw OVR. Roughly: OVR 5 ~ 1, 7 ~ 5, 8 ~ 9,
 * 9 ~ 15, 10 ~ 22. Uses ovrRaw (unrounded) so cost is monotonic and two close
 * players do not tie after rounding.
 */
export function playerCost(rp: RosterPlayer): number {
  const ovr = ovrRaw(rp.player.stats, rp.position);
  return Math.round(1 + Math.pow(Math.max(0, ovr - COST_PIVOT), COST_POW));
}

/** Total salary of a starting five (the bench is free). */
export function lineupCost(starters: RosterPlayer[]): number {
  return starters.reduce((sum, rp) => sum + playerCost(rp), 0);
}

/**
 * The cheapest legal five buildable from a pool (the five lowest-cost players).
 * Used as a grace floor: a five at this cost is always confirmable even if it is
 * over the cap, so a pool of nothing-but-expensive players never soft-locks the
 * pre-run picker. In normal play the pool has cheaper options and this never binds.
 */
export function cheapestFiveCost(pool: RosterPlayer[]): number {
  return [...pool]
    .map(playerCost)
    .sort((a, b) => a - b)
    .slice(0, 5)
    .reduce((sum, c) => sum + c, 0);
}

/** The salary cap at a given League tier: grows slowly with earned progress. */
export function budgetFor(leagueTier: number): number {
  return clamp(BUDGET_BASE + BUDGET_PER_TIER * Math.max(0, leagueTier), BUDGET_FLOOR, BUDGET_MAX);
}

export interface BudgetState {
  used: number;
  cap: number;
  remaining: number;
  over: boolean;
}

/** Evaluate a starting five against a cap, for the picker's meter and gating. */
export function evaluateLineupBudget(starters: RosterPlayer[], cap: number): BudgetState {
  const used = lineupCost(starters);
  return { used, cap, remaining: cap - used, over: used > cap };
}
