import { describe, it, expect } from 'vitest';
import { expandStats, isLegacyStats, type LegacyStats } from '@/game/stat-migration';
import { STAT_KEYS } from '@/types/player';

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

  it('produces all ten ratings, each in [3,10]', () => {
    const s = expandStats({ shooting: 6, speed: 7, athleticism: 4, clutch: 5 }, 'PG');
    for (const key of STAT_KEYS) {
      expect(typeof s[key]).toBe('number');
      expect(s[key]).toBeGreaterThanOrEqual(3);
      expect(s[key]).toBeLessThanOrEqual(10);
    }
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
