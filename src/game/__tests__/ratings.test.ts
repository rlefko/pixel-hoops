import { describe, it, expect } from 'vitest';
import { off, def, ovr, tierFor } from '@/game/ratings';
import type { PlayerStats } from '@/types/player';

/** A flat base-10 line; spread-and-override to probe one rating at a time. */
const BASE: PlayerStats = {
  inside: 10,
  outside: 10,
  playmaking: 10,
  perimeterD: 10,
  interiorD: 10,
  athleticism: 10,
  iq: 10,
  clutch: 10,
  stamina: 10,
  durability: 10,
  blocking: 10,
  stealing: 10,
  strength: 10,
  rebounding: 10,
};

describe('derived ratings', () => {
  it('keeps composites on the 6-20 surface scale for in-range inputs', () => {
    for (const s of [BASE, { ...BASE, outside: 20, inside: 20 }, { ...BASE, perimeterD: 6 }]) {
      expect(off(s)).toBeGreaterThanOrEqual(6);
      expect(off(s)).toBeLessThanOrEqual(20);
      expect(def(s)).toBeGreaterThanOrEqual(6);
      expect(def(s)).toBeLessThanOrEqual(20);
    }
  });

  it('OFF rises with scoring, DEF rises with defense', () => {
    expect(off({ ...BASE, outside: 20, inside: 20 })).toBeGreaterThan(off(BASE));
    expect(def({ ...BASE, perimeterD: 20, interiorD: 20 })).toBeGreaterThan(def(BASE));
    // A pure shooter does not inflate the defensive composite.
    expect(def({ ...BASE, outside: 20 })).toBe(def(BASE));
  });

  it('weights OVR by position: a rim anchor helps a center more than a point guard', () => {
    const anchor = { ...BASE, interiorD: 20, inside: 20 };
    const centerGain = ovr(anchor, 'C') - ovr(BASE, 'C');
    const guardGain = ovr(anchor, 'PG') - ovr(BASE, 'PG');
    expect(centerGain).toBeGreaterThan(guardGain);

    const creator = { ...BASE, playmaking: 20, outside: 20 };
    const pgGain = ovr(creator, 'PG') - ovr(BASE, 'PG');
    const cGain = ovr(creator, 'C') - ovr(BASE, 'C');
    expect(pgGain).toBeGreaterThan(cGain);
  });

  it('maps OVR to coarse class tiers (D/C/B/A/S/S+/S++)', () => {
    expect(tierFor(26).label).toBe('S++');
    expect(tierFor(22).label).toBe('S+');
    expect(tierFor(18).label).toBe('S');
    expect(tierFor(16).label).toBe('A');
    expect(tierFor(12).label).toBe('B');
    expect(tierFor(10).label).toBe('C');
    expect(tierFor(8).label).toBe('D');
    expect(tierFor(18).key).toBe('elite');
    expect(tierFor(16).key).toBe('gold');
    expect(tierFor(12).key).toBe('silver');
    expect(tierFor(10).key).toBe('bronze');
    expect(tierFor(8).key).toBe('rookie');
  });
});
