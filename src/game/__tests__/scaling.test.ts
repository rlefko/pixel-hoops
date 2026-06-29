import { describe, it, expect } from 'vitest';
import {
  resolveScaling,
  scalingStacks,
  type RunCounters,
  type ScalingSpec,
  type TeamModifier,
} from '@/game/effects';
import { BOOST_BY_ID, BOOST_DEFS, boostsToModifier } from '@/game/boosts';
import { ITEM_DEFS } from '@/game/items';
import { RARITY_NET, individualNet } from '@/game/rarity';

const counters = (over: Partial<RunCounters> = {}): RunCounters => ({
  wins: 0,
  mapIndex: 0,
  forgivenLosses: 0,
  ...over,
});

/** The static-net of a resolved team modifier (the boost-budget convention). */
const teamNetOf = (m: TeamModifier): number =>
  individualNet(m.extra) + 2 * m.offenseBonus + 2 * m.defenseBonus + m.paceBonus + m.clutchBonus;

describe('scalingStacks', () => {
  it('is zero at game one and grows by floor(counter / every), capped at maxStacks', () => {
    const spec: ScalingSpec = { per: 'win', every: 2, perStack: { extra: { outside: 1 } }, maxStacks: 3 };
    expect(scalingStacks(spec, counters({ wins: 0 }))).toBe(0);
    expect(scalingStacks(spec, counters({ wins: 1 }))).toBe(0); // below the first step
    expect(scalingStacks(spec, counters({ wins: 2 }))).toBe(1);
    expect(scalingStacks(spec, counters({ wins: 5 }))).toBe(2);
    expect(scalingStacks(spec, counters({ wins: 99 }))).toBe(3); // hard cap holds
  });

  it('per:map reads the map index instead of wins', () => {
    const spec: ScalingSpec = { per: 'map', perStack: { extra: { interiorD: 1 } }, maxStacks: 4 };
    expect(scalingStacks(spec, counters({ wins: 9, mapIndex: 2 }))).toBe(2);
  });

  it('a greedy scaler keeps its stacks on a clean run and wipes them after a timeout', () => {
    const spec = BOOST_BY_ID['killer-instinct'].scaling as ScalingSpec;
    expect(scalingStacks(spec, counters({ wins: 5 }))).toBe(5);
    expect(scalingStacks(spec, counters({ wins: 5, forgivenLosses: 1 }))).toBe(0);
  });
});

describe('resolveScaling', () => {
  it('scales numeric fields and extra deltas by the stack count', () => {
    const spec: ScalingSpec = { per: 'win', perStack: { paceBonus: 1, extra: { outside: 1 } }, maxStacks: 4 };
    const mod = resolveScaling(spec, counters({ wins: 3 }));
    expect(mod.paceBonus).toBe(3);
    expect(mod.extra.outside).toBe(3);
  });

  it('never multiplies hooks (a conditional rule is applied once, not per stack)', () => {
    const spec: ScalingSpec = {
      per: 'win',
      perStack: { extra: { outside: 1 }, hooks: [{ kind: 'paceClutch', minPace: 10, clutchAdd: 2 }] },
      maxStacks: 3,
    };
    const mod = resolveScaling(spec, counters({ wins: 3 }));
    expect(mod.extra.outside).toBe(3);
    expect(mod.hooks).toHaveLength(1);
  });

  it('returns an empty modifier at zero stacks', () => {
    const spec: ScalingSpec = { per: 'win', perStack: { extra: { outside: 1 } }, maxStacks: 2 };
    expect(teamNetOf(resolveScaling(spec, counters({ wins: 0 })))).toBe(0);
  });
});

describe('scaling content budget', () => {
  // A late-run snapshot: enough wins/maps to max every shipped scaler.
  const late = counters({ wins: 20, mapIndex: 6 });

  it('every scaling boost keeps its static rarity budget on the floor', () => {
    for (const d of BOOST_DEFS) {
      if (!d.scaling) continue;
      // The floor (no counters) must still equal the rarity net (it is not hook-only).
      const floor = boostsToModifier([{ id: d.id }]);
      expect(teamNetOf(floor)).toBe(RARITY_NET[d.rarity]);
    }
  });

  it('caps a scaling ramp near twice the base (greedy scalers may run hotter)', () => {
    for (const d of BOOST_DEFS) {
      if (!d.scaling) continue;
      const ramp = teamNetOf(resolveScaling(d.scaling, late));
      const bound = (d.scaling.greedy ? 5 : 2) * RARITY_NET[d.rarity];
      expect(ramp).toBeGreaterThan(0); // it actually grows
      expect(ramp).toBeLessThanOrEqual(bound);
    }
  });

  it('every scaling item ramp stays bounded', () => {
    for (const d of ITEM_DEFS) {
      if (!d.scaling) continue;
      const ramp = teamNetOf(resolveScaling(d.scaling, late));
      expect(ramp).toBeGreaterThan(0);
      expect(ramp).toBeLessThanOrEqual(2 * RARITY_NET[d.rarity]);
    }
  });
});

describe('boostsToModifier scaling', () => {
  it('folds the floor only without counters, and floor + ramp with them', () => {
    expect(boostsToModifier([{ id: 'momentum' }]).extra.outside).toBe(1); // floor only
    // momentum: +1 floor, +1 every 2 wins (cap 2). At 4 wins that is +2 ramp -> +3.
    const ramped = boostsToModifier([{ id: 'momentum' }], counters({ wins: 4 }));
    expect(ramped.extra.outside).toBe(3);
  });

  it('is deterministic for the same boosts and counters', () => {
    const c = counters({ wins: 6, mapIndex: 3 });
    expect(boostsToModifier([{ id: 'dynasty' }], c)).toEqual(boostsToModifier([{ id: 'dynasty' }], c));
  });
});
