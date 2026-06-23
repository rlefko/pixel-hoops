import { describe, it, expect } from 'vitest';
import { off, def, ovr, tierFor } from '@/game/ratings';
import type { PlayerStats } from '@/types/player';

/** A flat base-5 line; spread-and-override to probe one rating at a time. */
const BASE: PlayerStats = {
  inside: 5,
  outside: 5,
  playmaking: 5,
  perimeterD: 5,
  interiorD: 5,
  athleticism: 5,
  iq: 5,
  clutch: 5,
  stamina: 5,
  durability: 5,
};

describe('derived ratings', () => {
  it('keeps composites on the 3-10 surface scale for in-range inputs', () => {
    for (const s of [BASE, { ...BASE, outside: 10, inside: 10 }, { ...BASE, perimeterD: 3 }]) {
      expect(off(s)).toBeGreaterThanOrEqual(3);
      expect(off(s)).toBeLessThanOrEqual(10);
      expect(def(s)).toBeGreaterThanOrEqual(3);
      expect(def(s)).toBeLessThanOrEqual(10);
    }
  });

  it('OFF rises with scoring, DEF rises with defense', () => {
    expect(off({ ...BASE, outside: 10, inside: 10 })).toBeGreaterThan(off(BASE));
    expect(def({ ...BASE, perimeterD: 10, interiorD: 10 })).toBeGreaterThan(def(BASE));
    // A pure shooter does not inflate the defensive composite.
    expect(def({ ...BASE, outside: 10 })).toBe(def(BASE));
  });

  it('weights OVR by position: a rim anchor helps a center more than a point guard', () => {
    const anchor = { ...BASE, interiorD: 10, inside: 10 };
    const centerGain = ovr(anchor, 'C') - ovr(BASE, 'C');
    const guardGain = ovr(anchor, 'PG') - ovr(BASE, 'PG');
    expect(centerGain).toBeGreaterThan(guardGain);

    const creator = { ...BASE, playmaking: 10, outside: 10 };
    const pgGain = ovr(creator, 'PG') - ovr(BASE, 'PG');
    const cGain = ovr(creator, 'C') - ovr(BASE, 'C');
    expect(pgGain).toBeGreaterThan(cGain);
  });

  it('maps OVR to coarse tiers', () => {
    expect(tierFor(10).key).toBe('elite');
    expect(tierFor(8).key).toBe('gold');
    expect(tierFor(6).key).toBe('silver');
    expect(tierFor(4).key).toBe('bronze');
  });
});
