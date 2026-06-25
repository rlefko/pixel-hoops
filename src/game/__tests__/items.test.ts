import { describe, it, expect } from 'vitest';
import { createRNG } from '@/game/rng';
import {
  ITEM_BY_ID,
  ITEM_DEFS,
  itemDelta,
  rollDrop,
  rollBoostStock,
} from '@/game/items';

describe('items', () => {
  it('rollBoostStock is deterministic, sized, distinct, and never a boss relic', () => {
    const a = rollBoostStock(3, createRNG('boost-1'));
    const b = rollBoostStock(3, createRNG('boost-1'));
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id));
    expect(a).toHaveLength(3);
    expect(new Set(a.map((i) => i.id)).size).toBe(3);
    for (const item of a) expect(item.rarity).not.toBe('boss');
  });

  it('rollDrop yields items only at elite/boss nodes', () => {
    expect(rollDrop('game', 5, createRNG('d'))).toBeNull();
    expect(rollDrop('rest', 5, createRNG('d'))).toBeNull();
    expect(rollDrop('elite', 5, createRNG('d'))).not.toBeNull();
    const bossDrop = rollDrop('boss', 7, createRNG('d'));
    expect(bossDrop).not.toBeNull();
    expect(['rare', 'boss']).toContain(bossDrop!.rarity);
  });

  it('itemDelta folds a boss relic and a rare downside into the net effect', () => {
    const vest = ITEM_BY_ID['heavy-hitter-vest'];
    expect(itemDelta(vest)).toEqual({ inside: 8, athleticism: -4 });
    // Rares now carry a small off-stat downside so a maxed roster reads spiky.
    const scope = ITEM_BY_ID['sniper-scope'];
    expect(itemDelta(scope)).toEqual({ outside: 6, perimeterD: -2 });
    // Commons span a textured +1 / +2 / +3 rather than a uniform +2.
    const common = ITEM_BY_ID['grip-tape'];
    expect(itemDelta(common)).toEqual({ outside: 3 });
  });

  it('a hot jackpot roll never lets an elite drop a boss relic, and stays deterministic', () => {
    // The crit can bump an elite drop up to rare, but boss relics stay boss-exclusive.
    for (let s = 0; s < 200; s++) {
      const drop = rollDrop('elite', 6, createRNG(`elite-${s}`));
      expect(drop).not.toBeNull();
      expect(drop!.rarity).not.toBe('boss');
    }
    // The jackpot roll draws from the seeded RNG, so stock stays replay-stable.
    const a = rollBoostStock(4, createRNG('hot')).map((i) => i.id);
    const b = rollBoostStock(4, createRNG('hot')).map((i) => i.id);
    expect(a).toEqual(b);
  });

  it('every item id is unique and indexed', () => {
    expect(Object.keys(ITEM_BY_ID)).toHaveLength(ITEM_DEFS.length);
  });
});
