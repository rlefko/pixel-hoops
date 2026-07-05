import type { Position } from '@/types/roster';
import type { SimTeamSide } from '@/types/sim';

/**
 * Tiny pure court-math helpers shared by the choreography planner and the play
 * templates, so neither duplicates the other. No React, no reanimated, no court
 * size baked in beyond fractions (0..1) — safe to import from Node tests.
 */

/** A fractional court position (0..1 on each axis). */
export interface Frac {
  x: number;
  y: number;
}

/** `${side}-${position}`, e.g. 'home-PG'. Identifies a sprite on the floor. */
export type SpriteKey = `${SimTeamSide}-${Position}`;

export function spriteKey(side: SimTeamSide, position: Position): SpriteKey {
  return `${side}-${position}`;
}

/** Resolve a court fraction (0..1) to pixels for the measured floor. */
export function fracToPx(f: Frac, width: number, height: number): { x: number; y: number } {
  return { x: f.x * width, y: f.y * height };
}

export function lerpFrac(a: Frac, b: Frac, t: number): Frac {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Keep a court fraction off the exact baselines/sidelines. */
export function clampToCourt(v: number): number {
  return Math.max(0.04, Math.min(0.96, v));
}

/**
 * Ensure a list of `{atMs}` items is strictly increasing in time (interpolate
 * requires it): nudge any tie or reversal forward by 1ms.
 */
export function strictlyIncreasingByMs<T extends { atMs: number }>(items: T[]): T[] {
  for (let i = 1; i < items.length; i++) {
    if (items[i].atMs <= items[i - 1].atMs) items[i] = { ...items[i], atMs: items[i - 1].atMs + 1 };
  }
  return items;
}
