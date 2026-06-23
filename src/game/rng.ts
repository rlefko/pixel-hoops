/**
 * Seedable pseudo-random number generator.
 *
 * The auto-sim engine must be reproducible: the same seed has to produce the
 * exact same game timeline so a run can be replayed, fast-forwarded, or
 * debugged deterministically. The sim path threads an `RNG` everywhere so it
 * never depends on global `Math.random()`.
 *
 * Algorithm: mulberry32 (a fast, well-distributed 32-bit PRNG) seeded either
 * from a number or from a string hashed with FNV-1a.
 */

export interface RNG {
  /** Float in [0, 1). Drop-in replacement for `Math.random()`. */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** True with the given probability (0..1). */
  chance(probability: number): boolean;
  /** Roll against a 0..100 success rate (the seeded analog of resolution.roll). */
  rollPercent(successRate: number): boolean;
  /** Uniformly pick one item from a non-empty list. */
  pick<T>(items: readonly T[]): T;
  /** Pick from `[item, weight]` pairs proportional to weight. */
  weightedPick<T>(entries: readonly (readonly [T, number])[]): T;
  /** Current internal state, for snapshotting / debugging. */
  getState(): number;
}

/** Hash a string seed to a 32-bit unsigned integer (FNV-1a). */
export function hashSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Create a seeded RNG. Same seed always yields the same sequence. */
export function createRNG(seed: number | string): RNG {
  // Avoid a zero state (mulberry32 degenerates); fall back to 1.
  let state = (typeof seed === 'string' ? hashSeed(seed) : seed >>> 0) || 1;

  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Seeded analog of `randomInt` in src/types/player.ts (uses next() not Math.random).
  function int(min: number, max: number): number {
    return Math.floor(next() * (max - min + 1)) + min;
  }

  function chance(probability: number): boolean {
    return next() < probability;
  }

  function rollPercent(successRate: number): boolean {
    return next() * 100 < successRate;
  }

  function pick<T>(items: readonly T[]): T {
    return items[Math.floor(next() * items.length)];
  }

  function weightedPick<T>(entries: readonly (readonly [T, number])[]): T {
    let total = 0;
    for (const [, weight] of entries) total += weight;
    let roll = next() * total;
    for (const [item, weight] of entries) {
      roll -= weight;
      if (roll < 0) return item;
    }
    return entries[entries.length - 1][0];
  }

  function getState(): number {
    return state;
  }

  return { next, int, chance, rollPercent, pick, weightedPick, getState };
}

/**
 * Derive a stable child seed from a parent seed plus a label (e.g. a map node
 * id). Lets a run seed produce per-game seeds that stay identical on replay.
 */
export function deriveSeed(parent: number | string, label: string): number {
  const base = typeof parent === 'string' ? hashSeed(parent) : parent >>> 0;
  return (base ^ hashSeed(label)) >>> 0;
}
