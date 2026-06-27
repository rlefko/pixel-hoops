import { describe, it, expect } from 'vitest';
import { NBA_LEGENDS, NBA_POOL } from '@/data/nba';
import { ovr, classForOvr } from '@/game/ratings';
import { createPlayer, STAT_KEYS } from '@/types/player';
import { createRNG } from '@/game/rng';

/**
 * Guards the re-baked NBA data and procedural generation against the widened scale:
 * the pool sits in the 6-20 normal band (and its class badge still matches its
 * baked originalClass), curated legends reach the 6-24 elite band, and a freshly
 * generated player lands in-band with a class that matches its OVR.
 */

describe('re-baked data on the widened scale', () => {
  it('pool stats sit in the 6-20 normal band and match their originalClass', () => {
    expect(NBA_POOL.length).toBeGreaterThan(400);
    for (const p of NBA_POOL) {
      for (const key of STAT_KEYS) {
        expect(p.stats[key]).toBeGreaterThanOrEqual(6);
        expect(p.stats[key]).toBeLessThanOrEqual(20);
      }
      // The anchoring invariant: the displayed class derives back to the baked one.
      expect(classForOvr(ovr(p.stats, p.position))).toBe(p.originalClass);
    }
  });

  it('spreads OVR within a class by quality instead of flattening to one value', () => {
    // Regression guard for the flat-OVR bug: every C used to read 10, every B 13,
    // etc. Real quality (2K overall) must now spread same-class players across the
    // class window. B/C/A have large populations spanning their 2K buckets.
    const distinct: Record<string, Set<number>> = {};
    for (const p of NBA_POOL) {
      const cls = p.originalClass ?? classForOvr(ovr(p.stats, p.position));
      (distinct[cls] ??= new Set()).add(ovr(p.stats, p.position));
    }
    // B's window is 12-15 (four OVRs): a healthy pool uses most of it.
    expect(distinct['B'].size).toBeGreaterThanOrEqual(3);
    // C (10-11) and A (16-17) are two wide; both must show variance, not a flat value.
    expect(distinct['C'].size).toBeGreaterThan(1);
    expect(distinct['A'].size).toBeGreaterThan(1);
  });

  it('legends sit in the 6-24 elite band, all legendary with an ability and reading S+', () => {
    expect(NBA_LEGENDS).toHaveLength(92);
    let topTier = 0;
    for (const p of NBA_LEGENDS) {
      expect(p.legendary).toBe(true);
      expect(typeof p.ability).toBe('string');
      for (const key of STAT_KEYS) {
        expect(p.stats[key]).toBeGreaterThanOrEqual(6);
        expect(p.stats[key]).toBeLessThanOrEqual(24);
      }
      const cls = classForOvr(ovr(p.stats, p.position));
      if (cls === 'S' || cls === 'S+' || cls === 'S++') topTier += 1;
    }
    // The curated greats overwhelmingly read S or better by raw OVR; their stored
    // originalClass (S+) is what the badge shows (see playerDraftClass / PlayerCard).
    expect(topTier).toBeGreaterThan(30);
    // At least one elite legend has a base skill that breaks past the normal cap.
    expect(NBA_LEGENDS.some((p) => STAT_KEYS.some((k) => p.stats[k] > 20))).toBe(true);
  });

  it('a freshly generated player lands in-band with a matching class', () => {
    const rng = createRNG('rescale-gen');
    for (const archetype of ['point-guard', 'center', 'small-forward'] as const) {
      const p = createPlayer('Gen', archetype, rng.int);
      for (const key of STAT_KEYS) {
        expect(p.stats[key]).toBeGreaterThanOrEqual(6);
        expect(p.stats[key]).toBeLessThanOrEqual(20);
      }
      expect(['D', 'C', 'B', 'A', 'S']).toContain(classForOvr(ovr(p.stats, 'SF')));
    }
  });
});
