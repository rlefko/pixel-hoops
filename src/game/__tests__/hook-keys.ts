import type { SimHook } from '@/game/effects';
import type { PlayerStats } from '@/types/player';

/**
 * Shared test helper: the stat keys a SimHook touches, exhaustive over every
 * hook kind. Used by the content budget tests to assert that no hook references
 * a stat that does not exist (a typo guard across items, boosts, and abilities).
 */
export function hookStatKeys(h: SimHook): (keyof PlayerStats)[] {
  switch (h.kind) {
    case 'quarterDelta':
      return Object.keys(h.delta) as (keyof PlayerStats)[];
    case 'tiredBench':
      return Object.keys(h.benchDelta) as (keyof PlayerStats)[];
    case 'opponentRatingMult':
    case 'hotHand':
      return [h.stat];
    case 'whenTrailing':
    case 'whenLeading':
    case 'onResult':
      return Object.keys(h.delta) as (keyof PlayerStats)[];
    case 'paceClutch':
      return [];
  }
}

const STAT_KEYS = new Set<keyof PlayerStats>([
  'inside', 'outside', 'playmaking', 'perimeterD', 'interiorD',
  'athleticism', 'iq', 'clutch', 'stamina', 'durability',
  'blocking', 'stealing', 'strength', 'rebounding',
]);

export function isRealStatKey(k: string): boolean {
  return STAT_KEYS.has(k as keyof PlayerStats);
}
