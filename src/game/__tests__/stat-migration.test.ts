import { describe, it, expect } from 'vitest';
import {
  backfillPlayStyleStats,
  expandStats,
  isLegacyStats,
  type LegacyStats,
} from '@/game/stat-migration';
import { PLAYSTYLE_STAT_KEYS, STAT_KEYS, type PlayerStats } from '@/types/player';

const MJ: LegacyStats = { shooting: 9, speed: 9, athleticism: 10, clutch: 10 };

describe('isLegacyStats', () => {
  it('recognizes a legacy four-stat line', () => {
    expect(isLegacyStats(MJ)).toBe(true);
  });

  it('rejects an already-expanded ten-rating line', () => {
    expect(isLegacyStats(expandStats(MJ, 'SG'))).toBe(false);
  });

  it('rejects garbage', () => {
    expect(isLegacyStats(null)).toBe(false);
    expect(isLegacyStats({})).toBe(false);
    expect(isLegacyStats({ shooting: 5 })).toBe(false); // missing speed
  });
});

describe('expandStats', () => {
  it('is deterministic and RNG-free', () => {
    expect(expandStats(MJ, 'SG')).toEqual(expandStats(MJ, 'SG'));
  });

  it('produces all fourteen ratings (incl. play-style), each in [3,10]', () => {
    const s = expandStats({ shooting: 6, speed: 7, athleticism: 4, clutch: 5 }, 'PG');
    for (const key of STAT_KEYS) {
      expect(typeof s[key]).toBe('number');
      expect(s[key]).toBeGreaterThanOrEqual(3);
      expect(s[key]).toBeLessThanOrEqual(10);
    }
  });

  it('gives a legacy big interior play-style and a legacy guard steals', () => {
    const athletic: LegacyStats = { shooting: 6, speed: 9, athleticism: 9, clutch: 5 };
    const big = expandStats(athletic, 'C');
    const guard = expandStats(athletic, 'PG');
    expect(big.blocking).toBeGreaterThan(guard.blocking);
    expect(big.rebounding).toBeGreaterThan(guard.rebounding);
    expect(big.strength).toBeGreaterThan(guard.strength);
    expect(guard.stealing).toBeGreaterThan(big.stealing);
  });
});

describe('backfillPlayStyleStats', () => {
  const baked: PlayerStats = {
    inside: 18, outside: 8, playmaking: 9, perimeterD: 12, interiorD: 18,
    athleticism: 14, iq: 13, clutch: 12, stamina: 14, durability: 14,
  } as unknown as PlayerStats; // a line baked before the expansion (no play-style keys)

  it('fills missing play-style keys into the 6-20 band, position-aware', () => {
    const filled = backfillPlayStyleStats(baked, 'C');
    for (const key of PLAYSTYLE_STAT_KEYS) {
      expect(filled[key]).toBeGreaterThanOrEqual(6);
      expect(filled[key]).toBeLessThanOrEqual(20);
    }
    // A big interior line backfills high blocking/rebounding.
    expect(filled.blocking).toBeGreaterThanOrEqual(14);
    expect(filled.rebounding).toBeGreaterThanOrEqual(14);
  });

  it('leaves already-present play-style values untouched (idempotent)', () => {
    const complete: PlayerStats = { ...baked, blocking: 17, stealing: 9, strength: 16, rebounding: 17 };
    expect(backfillPlayStyleStats(complete, 'C')).toEqual(complete);
  });

  it('maps an elite legacy line to elite ratings', () => {
    const s = expandStats(MJ, 'SG');
    expect(s.outside).toBe(9); // inherits shooting
    expect(s.athleticism).toBe(10);
    expect(s.clutch).toBe(10);
    expect(s.inside).toBeGreaterThanOrEqual(9);
    expect(s.stamina).toBe(5); // neutral default, no source
  });

  it('routes speed to playmaking for guards and blends it for bigs', () => {
    const legacy: LegacyStats = { shooting: 4, speed: 9, athleticism: 6, clutch: 5 };
    expect(expandStats(legacy, 'PG').playmaking).toBe(9);
    expect(expandStats(legacy, 'C').playmaking).toBeLessThan(9);
  });
});
