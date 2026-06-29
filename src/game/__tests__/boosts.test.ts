import { describe, it, expect } from 'vitest';
import { createRNG } from '@/game/rng';
import {
  BOOST_DEFS,
  BOOST_BY_ID,
  boostsToModifier,
  drawBoostOffers,
  type PassiveBoost,
} from '@/game/boosts';
import type { TeamModifier } from '@/game/effects';
import { RARITY_NET, teamNet, type Rarity } from '@/game/rarity';
import { hookStatKeys, isRealStatKey } from './hook-keys';

/** A boost's static net on the team line. Abstract bonuses fan out: offense/defense
 * hit two stats each, pace/clutch one. Hook-only boosts net 0 (budget-exempt). */
const boostNet = (e: Partial<TeamModifier>): number =>
  teamNet(e.extra) +
  2 * (e.offenseBonus ?? 0) +
  2 * (e.defenseBonus ?? 0) +
  (e.paceBonus ?? 0) +
  (e.clutchBonus ?? 0);

const isHookOnly = (e: Partial<TeamModifier>): boolean =>
  (e.hooks?.length ?? 0) > 0 && boostNet(e) === 0;

describe('boost budget', () => {
  it('every static boost nets exactly its rarity budget (hook-only boosts exempt)', () => {
    for (const d of BOOST_DEFS) {
      if (isHookOnly(d.effect)) continue;
      expect(boostNet(d.effect)).toBe(RARITY_NET[d.rarity]);
    }
  });

  it('has good per-tier variety', () => {
    const count = (r: Rarity) => BOOST_DEFS.filter((d) => d.rarity === r).length;
    expect(count('common')).toBeGreaterThanOrEqual(8);
    expect(count('rare')).toBeGreaterThanOrEqual(6);
    expect(count('epic')).toBeGreaterThanOrEqual(5);
    expect(count('legendary')).toBeGreaterThanOrEqual(4);
  });

  it('has unique ids', () => {
    const ids = BOOST_DEFS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only references real stat keys (team extra and hooks)', () => {
    for (const d of BOOST_DEFS) {
      for (const k of Object.keys(d.effect.extra ?? {})) expect(isRealStatKey(k)).toBe(true);
      for (const h of d.effect.hooks ?? []) {
        for (const k of hookStatKeys(h)) expect(isRealStatKey(k)).toBe(true);
        if (h.kind === 'hotHand') expect(h.halfLife).toBeGreaterThan(0);
        if (h.kind === 'whenTrailing') expect(h.marginBehind).toBeGreaterThan(0);
        if (h.kind === 'whenLeading') expect(h.marginAhead).toBeGreaterThan(0);
      }
    }
  });
});

describe('boost drafting', () => {
  it('is deterministic and offers three distinct choices', () => {
    const a = drawBoostOffers([], createRNG('b1'));
    const b = drawBoostOffers([], createRNG('b1'));
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
    const ids = a.map((o) => o.defId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never offers a boost the player already owns', () => {
    const owned: PassiveBoost[] = [{ id: 'splash-brothers' }, { id: 'lockdown' }];
    for (let s = 0; s < 80; s++) {
      const offers = drawBoostOffers(owned, createRNG(`o-${s}`));
      for (const o of offers) {
        expect(o.defId).not.toBe('splash-brothers');
        expect(o.defId).not.toBe('lockdown');
      }
    }
  });

  it('every offered id resolves to a real boost def', () => {
    for (let s = 0; s < 40; s++) {
      for (const o of drawBoostOffers([], createRNG(`r-${s}`))) {
        expect(BOOST_BY_ID[o.defId]).toBeDefined();
      }
    }
  });

  it('skews common: legendary boosts are rare across many draws', () => {
    let common = 0;
    let legendary = 0;
    for (let s = 0; s < 600; s++) {
      for (const o of drawBoostOffers([], createRNG(`dist-${s}`))) {
        const r = BOOST_BY_ID[o.defId].rarity;
        if (r === 'common') common += 1;
        if (r === 'legendary') legendary += 1;
      }
    }
    expect(common).toBeGreaterThan(legendary * 5);
  });
});

describe('boostsToModifier', () => {
  it('folds a boost effect into the team modifier', () => {
    const mod = boostsToModifier([{ id: 'splash-brothers' }]);
    expect(mod.extra.outside).toBe(1);
  });

  it('sums multiple boosts', () => {
    const mod = boostsToModifier([{ id: 'splash-brothers' }, { id: 'sharpshooting' }]);
    expect(mod.extra.outside).toBe(3); // 1 + 2
  });

  it('skips unknown ids', () => {
    expect(boostsToModifier([{ id: 'does-not-exist' }]).extra).toEqual({});
  });
});

describe('boost draft agency (banish + pity)', () => {
  it('never offers a banished boost and still fills the board', () => {
    const banished = new Set(['splash-brothers', 'lockdown', 'sharpshooting', 'closer']);
    for (let s = 0; s < 120; s++) {
      const offers = drawBoostOffers([], createRNG(`ban-${s}`), 3, { banished });
      for (const o of offers) expect(banished.has(o.defId)).toBe(false);
      expect(offers).toHaveLength(3);
      expect(new Set(offers.map((o) => o.defId)).size).toBe(3);
    }
  });

  it('is deterministic with banish + pity options', () => {
    const opts = { banished: new Set(['splash-brothers']), pityOffset: 3 };
    const a = drawBoostOffers([], createRNG('det'), 3, opts);
    const b = drawBoostOffers([], createRNG('det'), 3, opts);
    expect(a).toEqual(b);
  });

  it('raises the epic+ share over a drought but never makes it the norm', () => {
    const epicPlusShare = (pityOffset: number): number => {
      let count = 0;
      const draws = 1500;
      for (let s = 0; s < draws; s++) {
        for (const o of drawBoostOffers([], createRNG(`p-${pityOffset}-${s}`), 3, { pityOffset })) {
          const r = BOOST_BY_ID[o.defId].rarity;
          if (r === 'epic' || r === 'legendary') count += 1;
        }
      }
      return count / (draws * 3);
    };
    const cold = epicPlusShare(0);
    const hot = epicPlusShare(4);
    expect(hot).toBeGreaterThan(cold);
    expect(hot).toBeLessThan(0.5);
  });
});
