import { describe, it, expect } from 'vitest';
import { createRNG } from '@/game/rng';
import {
  BOOST_BY_ID,
  boostsToModifier,
  drawBoostOffers,
  type PassiveBoost,
} from '@/game/boosts';

describe('boost drafting', () => {
  it('is deterministic and offers up to three distinct choices', () => {
    const a = drawBoostOffers(3, [], createRNG('b1'));
    const b = drawBoostOffers(3, [], createRNG('b1'));
    expect(a).toEqual(b);
    expect(a.length).toBeLessThanOrEqual(3);
    const ids = a.map((o) => (o.kind === 'new' ? o.defId : o.id));
    expect(new Set(ids).size).toBe(ids.length); // distinct
  });

  it('round-gates offers (capstones never appear early)', () => {
    const r1 = drawBoostOffers(1, [], createRNG('r1'));
    for (const o of r1) {
      const id = o.kind === 'new' ? o.defId : o.id;
      expect(BOOST_BY_ID[id].minRound).toBeLessThanOrEqual(1);
      expect(BOOST_BY_ID[id].rarity).not.toBe('capstone');
    }
  });

  it('offers an owned boost as a one-tier upgrade, never a duplicate "new"', () => {
    const owned: PassiveBoost[] = [{ id: 'splash-brothers', tier: 1 }];
    // Sweep seeds: any time splash-brothers surfaces, it must be a tierUp.
    for (let s = 0; s < 50; s++) {
      const offers = drawBoostOffers(3, owned, createRNG(`tu-${s}`));
      for (const o of offers) {
        if (o.kind === 'new') expect(o.defId).not.toBe('splash-brothers');
        if (o.kind === 'tierUp' && o.id === 'splash-brothers') expect(o.toTier).toBe(2);
      }
    }
  });

  it('never offers an owned boost that is already at max tier', () => {
    const owned: PassiveBoost[] = [{ id: 'heat-check', tier: 1 }]; // maxTier 1
    for (let s = 0; s < 50; s++) {
      const offers = drawBoostOffers(5, owned, createRNG(`mx-${s}`));
      for (const o of offers) {
        const id = o.kind === 'new' ? o.defId : o.id;
        expect(id).not.toBe('heat-check');
      }
    }
  });

  it('boostsToModifier scales magnitudes by tier', () => {
    const t1 = boostsToModifier([{ id: 'splash-brothers', tier: 1 }]);
    const t3 = boostsToModifier([{ id: 'splash-brothers', tier: 3 }]);
    expect(t1.extra.outside).toBe(1);
    expect(t3.extra.outside).toBe(3);
  });

  it('capstones only appear once their requirement is met', () => {
    // Pace-and-Space needs one Outside + one Transition boost owned.
    const without = Array.from({ length: 30 }, (_, s) =>
      drawBoostOffers(5, [{ id: 'splash-brothers', tier: 1 }], createRNG(`c-${s}`))
    ).flat();
    expect(without.some((o) => (o.kind === 'new' ? o.defId : o.id) === 'pace-and-space')).toBe(false);

    const withDuo = Array.from({ length: 60 }, (_, s) =>
      drawBoostOffers(
        5,
        [
          { id: 'splash-brothers', tier: 1 },
          { id: 'seven-seconds', tier: 1 },
        ],
        createRNG(`d-${s}`)
      )
    ).flat();
    expect(withDuo.some((o) => (o.kind === 'new' ? o.defId : o.id) === 'pace-and-space')).toBe(true);
  });
});
