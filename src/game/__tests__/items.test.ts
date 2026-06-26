import { describe, it, expect } from 'vitest';
import { createRNG } from '@/game/rng';
import { ITEM_BY_ID, ITEM_DEFS, itemDelta, rollDrop, rollBoostStock } from '@/game/items';
import { RARITY_NET, individualNet, type Rarity } from '@/game/rarity';

describe('item budget', () => {
  it('every item nets exactly its rarity budget (effect plus downside)', () => {
    for (const d of ITEM_DEFS) {
      expect(individualNet(itemDelta(d))).toBe(RARITY_NET[d.rarity]);
    }
  });

  it('has good per-tier variety', () => {
    const count = (r: Rarity) => ITEM_DEFS.filter((d) => d.rarity === r).length;
    expect(count('common')).toBeGreaterThanOrEqual(8);
    expect(count('rare')).toBeGreaterThanOrEqual(8);
    expect(count('epic')).toBeGreaterThanOrEqual(6);
    expect(count('legendary')).toBeGreaterThanOrEqual(5);
  });

  it('itemDelta folds a downside into the net effect', () => {
    expect(itemDelta(ITEM_BY_ID['heavy-hitter-vest'])).toEqual({ inside: 8, athleticism: -3 });
    expect(itemDelta(ITEM_BY_ID['sniper-scope'])).toEqual({ outside: 4, perimeterD: -2 });
    expect(itemDelta(ITEM_BY_ID['grip-tape'])).toEqual({ outside: 1 });
  });

  it('every item id is unique and indexed', () => {
    expect(Object.keys(ITEM_BY_ID)).toHaveLength(ITEM_DEFS.length);
  });
});

describe('item drops', () => {
  it('rollBoostStock is deterministic, sized, and distinct', () => {
    const a = rollBoostStock(createRNG('boost-1'));
    const b = rollBoostStock(createRNG('boost-1'));
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id));
    expect(a).toHaveLength(3);
    expect(new Set(a.map((i) => i.id)).size).toBe(3);
  });

  it('only bosses drop gear; elites and other nodes drop nothing', () => {
    expect(rollDrop('game', createRNG('d'))).toBeNull();
    expect(rollDrop('rest', createRNG('d'))).toBeNull();
    expect(rollDrop('elite', createRNG('d'))).toBeNull();
  });

  it('a boss always drops a rare / epic / legendary, never a common', () => {
    for (let s = 0; s < 200; s++) {
      const drop = rollDrop('boss', createRNG(`boss-${s}`));
      expect(drop).not.toBeNull();
      expect(['rare', 'epic', 'legendary']).toContain(drop!.rarity);
    }
  });
});
