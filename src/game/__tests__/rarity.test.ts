import { describe, it, expect } from 'vitest';
import {
  RARITY_NET,
  RARITY_ORDER,
  individualNet,
  rollBossRarity,
  rollRarity,
  weightedNet,
  type Rarity,
} from '@/game/rarity';
import { createRNG } from '@/game/rng';

describe('rarity budget', () => {
  it('matches the spec (+1 / +2 / +3 / +5)', () => {
    expect(RARITY_NET).toEqual({ common: 1, rare: 2, epic: 3, legendary: 5 });
  });

  it('individualNet is a sign-aware sum', () => {
    expect(individualNet({ outside: 4, perimeterD: -2 })).toBe(2);
    expect(individualNet(undefined)).toBe(0);
  });

  it('weightedNet counts team-aggregate deltas x3', () => {
    expect(weightedNet({ inside: 3 }, undefined)).toBe(3);
    expect(weightedNet(undefined, { outside: 1 })).toBe(3); // 1 team point = 3 budget
    expect(weightedNet({ stamina: -1 }, { outside: 2 })).toBe(5); // -1 + 2*3
  });
});

describe('rarity rolls', () => {
  const distribution = (roll: (rng: ReturnType<typeof createRNG>) => Rarity, prefix: string) => {
    const n = 40000;
    const counts: Record<Rarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
    for (let s = 0; s < n; s++) counts[roll(createRNG(`${prefix}-${s}`))] += 1;
    return { counts, n };
  };

  it('rollRarity is ~74 / 20 / 5 / 1', () => {
    const { counts, n } = distribution(rollRarity, 'r');
    expect(counts.common / n).toBeGreaterThan(0.70);
    expect(counts.common / n).toBeLessThan(0.78);
    expect(counts.rare / n).toBeGreaterThan(0.17);
    expect(counts.rare / n).toBeLessThan(0.23);
    expect(counts.epic / n).toBeGreaterThan(0.03);
    expect(counts.epic / n).toBeLessThan(0.07);
    expect(counts.legendary / n).toBeGreaterThan(0.004);
    expect(counts.legendary / n).toBeLessThan(0.02);
  });

  it('rollBossRarity is ~75 / 20 / 5 and never common', () => {
    const { counts, n } = distribution(rollBossRarity, 'b');
    expect(counts.common).toBe(0);
    expect(counts.rare / n).toBeGreaterThan(0.70);
    expect(counts.rare / n).toBeLessThan(0.80);
    expect(counts.epic / n).toBeGreaterThan(0.16);
    expect(counts.epic / n).toBeLessThan(0.24);
    expect(counts.legendary / n).toBeGreaterThan(0.03);
    expect(counts.legendary / n).toBeLessThan(0.07);
  });

  it('orders the ladder ascending', () => {
    expect(RARITY_ORDER).toEqual(['common', 'rare', 'epic', 'legendary']);
  });

  it('a difficulty rarityBonus shifts common into epic+legendary, monotonically', () => {
    const epicPlus = (bonus: number) => {
      const { counts, n } = distribution((rng) => rollRarity(rng, 0, bonus), `rb-${bonus}`);
      return (counts.epic + counts.legendary) / n;
    };
    // The shipped difficulty bonuses (easy 0, medium 2, hard 4, insane 6).
    const shares = [0, 2, 4, 6].map(epicPlus);
    for (let i = 1; i < shares.length; i++) expect(shares[i]).toBeGreaterThan(shares[i - 1]);
    // Insane roughly triples easy's epic+ share without becoming the norm.
    expect(shares[3]).toBeGreaterThan(0.14);
    expect(shares[3]).toBeLessThan(0.24);
  });

  it('rarityBonus composes with pity instead of eating it', () => {
    const { counts, n } = distribution((rng) => rollRarity(rng, 4, 6), 'rbp');
    // Max pity (+12) on top of insane's bonus (+6): epic+ climbs well past either alone.
    expect((counts.epic + counts.legendary) / n).toBeGreaterThan(0.3);
    expect(counts.common).toBeGreaterThan(0); // the common floor holds
  });

  it('a bossRarityBonus shifts rare into epic+legendary and still never drops common', () => {
    const epicPlus = (bonus: number) => {
      const { counts, n } = distribution((rng) => rollBossRarity(rng, bonus), `bb-${bonus}`);
      expect(counts.common).toBe(0);
      return (counts.epic + counts.legendary) / n;
    };
    // The shipped boss bonuses (easy 0, medium 4, hard 9, insane 15).
    const shares = [0, 4, 9, 15].map(epicPlus);
    for (let i = 1; i < shares.length; i++) expect(shares[i]).toBeGreaterThan(shares[i - 1]);
    // Insane bosses drop epic+ a bit over half the time: the jackpot tier.
    expect(shares[3]).toBeGreaterThan(0.5);
    expect(shares[3]).toBeLessThan(0.62);
  });
});
