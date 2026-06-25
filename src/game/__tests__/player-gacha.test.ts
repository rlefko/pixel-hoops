import { describe, it, expect } from 'vitest';
import {
  PLAYER_MACHINES,
  PLAYER_GACHA_TIERS,
  REFUND_RATIO,
  tierPool,
  tierCounts,
  pullPlayer,
  type PlayerGachaTier,
} from '@/game/player-gacha';
import { createRNG } from '@/game/rng';

const keysOf = (tier: PlayerGachaTier): string[] =>
  tierPool(tier).map((rp) => `${rp.name}|${rp.position}`);

describe('player scouting machines', () => {
  it('prices match the spec (250 / 500 / 1,000 / 2,500 / 10,000)', () => {
    expect(PLAYER_MACHINES.C.cost).toBe(250);
    expect(PLAYER_MACHINES.B.cost).toBe(500);
    expect(PLAYER_MACHINES.A.cost).toBe(1000);
    expect(PLAYER_MACHINES.S.cost).toBe(2500);
    expect(PLAYER_MACHINES.legendary.cost).toBe(10000);
  });

  it('every tier draws from a non-empty pool', () => {
    for (const tier of PLAYER_GACHA_TIERS) expect(tierPool(tier).length).toBeGreaterThan(0);
  });

  it('class machines only dispense players of their class; the legendary machine only legends', () => {
    for (const tier of ['C', 'B', 'A', 'S'] as const) {
      for (let s = 0; s < 40; s++) {
        const { player, isDupe } = pullPlayer(tier, new Set(), createRNG(`${tier}-${s}`));
        expect(isDupe).toBe(false);
        expect(player.legendary).toBe(false);
        expect(player.originalClass).toBe(tier);
      }
    }
    for (let s = 0; s < 40; s++) {
      const { player } = pullPlayer('legendary', new Set(), createRNG(`L-${s}`));
      expect(player.legendary).toBe(true);
      expect(player.originalClass).toBe('S+');
    }
  });
});

describe('collection mode', () => {
  it('never returns a player you already own while un-owned players remain', () => {
    const all = keysOf('S');
    const lastKey = all[all.length - 1];
    const ownedAllButOne = new Set(all.slice(0, -1)); // own every S except the last
    for (let s = 0; s < 60; s++) {
      const { player, isDupe } = pullPlayer('S', ownedAllButOne, createRNG(`s-${s}`));
      expect(isDupe).toBe(false);
      expect(`${player.player.name}|${player.position}`).toBe(lastKey);
    }
  });

  it('returns a repeat with a half-price refund once the tier is fully collected', () => {
    for (const tier of PLAYER_GACHA_TIERS) {
      const owned = new Set(keysOf(tier));
      const { isDupe, cost, refund } = pullPlayer(tier, owned, createRNG(`dupe-${tier}`));
      expect(isDupe).toBe(true);
      expect(cost).toBe(PLAYER_MACHINES[tier].cost);
      expect(refund).toBe(Math.floor(cost * REFUND_RATIO));
    }
    expect(REFUND_RATIO).toBe(0.5);
  });

  it('is deterministic from its seed', () => {
    const a = pullPlayer('A', new Set(), createRNG('same'));
    const b = pullPlayer('A', new Set(), createRNG('same'));
    expect(a).toEqual(b);
  });
});

describe('tierCounts', () => {
  it('reports owned/total and completion', () => {
    const empty = tierCounts('A', new Set());
    expect(empty.owned).toBe(0);
    expect(empty.total).toBe(tierPool('A').length);
    expect(empty.complete).toBe(false);

    const full = tierCounts('A', new Set(keysOf('A')));
    expect(full.owned).toBe(full.total);
    expect(full.complete).toBe(true);
  });
});
