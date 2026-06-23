import { describe, it, expect } from 'vitest';
import { ABILITIES, getAbility } from '@/game/abilities';
import { NBA_PLAYERS, NBA_LEGENDS, NBA_STARTERS, NBA_TEAMS } from '@/data/nba';
import { STAT_KEYS } from '@/types/player';

describe('legendary dataset + abilities', () => {
  it('has 40 legends, all 90+ legendary with an ability', () => {
    expect(NBA_LEGENDS).toHaveLength(40);
    expect(NBA_PLAYERS).toBe(NBA_LEGENDS); // back-compat alias is the legend pool
    for (const p of NBA_LEGENDS) {
      expect(p.legendary).toBe(true);
      expect(typeof p.ability).toBe('string');
      expect(p.overall).toBeGreaterThanOrEqual(90);
    }
  });

  it('has 150 modern starters: real, sub-90, no ability, ratings in 3..10', () => {
    expect(NBA_STARTERS).toHaveLength(150);
    for (const p of NBA_STARTERS) {
      expect(p.legendary).toBeFalsy();
      expect(p.ability).toBeUndefined();
      expect(p.era).toBe('modern');
      expect(p.overall).toBeGreaterThanOrEqual(70);
      expect(p.overall).toBeLessThan(90);
      const stats = p.stats as unknown as Record<string, number>;
      for (const key of STAT_KEYS) {
        expect(stats[key]).toBeGreaterThanOrEqual(3);
        expect(stats[key]).toBeLessThanOrEqual(10);
      }
    }
  });

  it('keeps the legend and starter pools disjoint and globally unique by slug', () => {
    const legendSlugs = new Set(NBA_LEGENDS.map((p) => p.slug));
    for (const p of NBA_STARTERS) expect(legendSlugs.has(p.slug)).toBe(false);
    const allSlugs = [...NBA_LEGENDS, ...NBA_STARTERS].map((p) => p.slug);
    expect(new Set(allSlugs).size).toBe(allSlugs.length);
  });

  it('covers all 30 teams: each has >=1 legend and a full five of starters', () => {
    for (const team of NBA_TEAMS) {
      const legends = NBA_LEGENDS.filter((p) => p.teamAbbr === team.abbreviation);
      const starters = NBA_STARTERS.filter((p) => p.teamAbbr === team.abbreviation);
      expect(legends.length, `legend for ${team.abbreviation}`).toBeGreaterThanOrEqual(1);
      expect(starters.length, `starters for ${team.abbreviation}`).toBe(5);
      expect(new Set(starters.map((p) => p.position)).size).toBe(5);
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
