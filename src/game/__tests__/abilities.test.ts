import { describe, it, expect } from 'vitest';
import { ABILITIES, getAbility } from '@/game/abilities';
import { NBA_PLAYERS, NBA_LEGENDS, NBA_POOL, NBA_TEAMS } from '@/data/nba';
import { STAT_KEYS } from '@/types/player';
import { CLASS_ORDER } from '@/game/classes';

describe('legendary dataset + abilities', () => {
  it('has 40 legends, all legendary with an ability', () => {
    expect(NBA_LEGENDS).toHaveLength(40);
    expect(NBA_PLAYERS).toBe(NBA_LEGENDS); // back-compat alias is the legend pool
    for (const p of NBA_LEGENDS) {
      expect(p.legendary).toBe(true);
      expect(typeof p.ability).toBe('string');
      // Re-fetched current-player legends (Chris Paul, Ja Morant, ...) sit below
      // 90, so the floor is the real elite band, not a flat 90+.
      expect(p.overall).toBeGreaterThanOrEqual(76);
    }
  });

  it('has a large class pool: real current players, classes C-S, no ability, ratings 6..20', () => {
    expect(NBA_POOL.length).toBeGreaterThanOrEqual(300);
    for (const p of NBA_POOL) {
      expect(p.legendary).toBeFalsy();
      expect(p.ability).toBeUndefined();
      expect(p.era).toBe('modern');
      // Reals are C/B/A/S (D is procedural, S+ is the legend tier).
      expect(['C', 'B', 'A', 'S']).toContain(p.originalClass);
      expect(CLASS_ORDER).toContain(p.originalClass);
      const stats = p.stats as unknown as Record<string, number>;
      for (const key of STAT_KEYS) {
        expect(stats[key]).toBeGreaterThanOrEqual(6);
        expect(stats[key]).toBeLessThanOrEqual(20);
      }
    }
  });

  it('keeps the legend and class pools disjoint and globally unique by slug', () => {
    const legendSlugs = new Set(NBA_LEGENDS.map((p) => p.slug));
    for (const p of NBA_POOL) expect(legendSlugs.has(p.slug)).toBe(false);
    const allSlugs = [...NBA_LEGENDS, ...NBA_POOL].map((p) => p.slug);
    expect(new Set(allSlugs).size).toBe(allSlugs.length);
  });

  it('covers all 30 teams: each has >=1 legend and several pool players across all positions', () => {
    for (const team of NBA_TEAMS) {
      const legends = NBA_LEGENDS.filter((p) => p.teamAbbr === team.abbreviation);
      const roster = NBA_POOL.filter((p) => p.teamAbbr === team.abbreviation);
      expect(legends.length, `legend for ${team.abbreviation}`).toBeGreaterThanOrEqual(1);
      expect(roster.length, `pool for ${team.abbreviation}`).toBeGreaterThanOrEqual(5);
      expect(new Set(roster.map((p) => p.position)).size).toBe(5);
    }
  });

  it('every referenced ability id exists in the registry', () => {
    for (const p of NBA_PLAYERS) {
      expect(getAbility(p.ability)).toBeDefined();
      expect(ABILITIES[p.ability!].id).toBe(p.ability);
    }
  });

  it('every legend carries the full ten ratings in the 6..24 elite band (not the legacy shape)', () => {
    for (const p of NBA_PLAYERS) {
      const stats = p.stats as unknown as Record<string, number>;
      // Re-rated, not legacy: the new shape has `outside`, not `shooting`.
      expect(stats.outside).toBeTypeOf('number');
      expect(stats.shooting).toBeUndefined();
      for (const key of STAT_KEYS) {
        expect(stats[key]).toBeGreaterThanOrEqual(6);
        expect(stats[key]).toBeLessThanOrEqual(24);
      }
    }
  });

  it('getAbility is undefined for missing/blank ids', () => {
    expect(getAbility(undefined)).toBeUndefined();
    expect(getAbility('not-an-ability')).toBeUndefined();
  });
});
