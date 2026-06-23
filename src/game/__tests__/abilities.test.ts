import { describe, it, expect } from 'vitest';
import { ABILITIES, getAbility } from '@/game/abilities';
import { NBA_PLAYERS } from '@/data/nba';
import { STAT_KEYS } from '@/types/player';

describe('legendary dataset + abilities', () => {
  it('has 24 real players, all legendary with an ability', () => {
    expect(NBA_PLAYERS).toHaveLength(24);
    for (const p of NBA_PLAYERS) {
      expect(p.legendary).toBe(true);
      expect(typeof p.ability).toBe('string');
      expect(p.overall).toBeGreaterThanOrEqual(90);
    }
  });

  it('every referenced ability id exists in the registry', () => {
    for (const p of NBA_PLAYERS) {
      expect(getAbility(p.ability)).toBeDefined();
      expect(ABILITIES[p.ability!].id).toBe(p.ability);
    }
  });

  it('every player carries the full ten ratings in 3..10 (not the legacy shape)', () => {
    for (const p of NBA_PLAYERS) {
      const stats = p.stats as unknown as Record<string, number>;
      // Re-rated, not legacy: the new shape has `outside`, not `shooting`.
      expect(stats.outside).toBeTypeOf('number');
      expect(stats.shooting).toBeUndefined();
      for (const key of STAT_KEYS) {
        expect(stats[key]).toBeGreaterThanOrEqual(3);
        expect(stats[key]).toBeLessThanOrEqual(10);
      }
    }
  });

  it('getAbility is undefined for missing/blank ids', () => {
    expect(getAbility(undefined)).toBeUndefined();
    expect(getAbility('not-an-ability')).toBeUndefined();
  });
});
