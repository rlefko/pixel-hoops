import { describe, it, expect } from 'vitest';
import {
  GACHA_ABILITIES,
  GACHA_MACHINES,
  getGachaAbility,
  pullMachine,
} from '@/game/abilities-gacha';
import { RARITY_NET, weightedNet, type Rarity } from '@/game/rarity';
import { createRNG } from '@/game/rng';
import type { PlayerStats } from '@/types/player';

const STAT_KEYS = new Set<keyof PlayerStats>([
  'inside', 'outside', 'playmaking', 'perimeterD', 'interiorD',
  'athleticism', 'iq', 'clutch', 'stamina', 'durability',
]);

describe('gacha ability budget', () => {
  it('every ability spends exactly its rarity net budget (team deltas count x3)', () => {
    for (const a of GACHA_ABILITIES) {
      // Team effects are expressed only via teamAura.extra so the x3 accounting is
      // exact; the abstract bonuses are reserved for legend signatures.
      expect(a.teamAura?.offenseBonus ?? 0).toBe(0);
      expect(a.teamAura?.defenseBonus ?? 0).toBe(0);
      expect(a.teamAura?.paceBonus ?? 0).toBe(0);
      expect(a.teamAura?.clutchBonus ?? 0).toBe(0);
      expect(weightedNet(a.selfDelta, a.teamAura?.extra)).toBe(RARITY_NET[a.rarity]);
    }
  });

  it('has good per-tier variety', () => {
    const count = (r: Rarity) => GACHA_ABILITIES.filter((a) => a.rarity === r).length;
    expect(count('common')).toBeGreaterThanOrEqual(12);
    expect(count('rare')).toBeGreaterThanOrEqual(10);
    expect(count('epic')).toBeGreaterThanOrEqual(8);
    expect(count('legendary')).toBeGreaterThanOrEqual(6);
  });

  it('only references real stat keys', () => {
    for (const a of GACHA_ABILITIES) {
      for (const k of Object.keys(a.selfDelta ?? {})) expect(STAT_KEYS.has(k as keyof PlayerStats)).toBe(true);
      for (const k of Object.keys(a.teamAura?.extra ?? {})) expect(STAT_KEYS.has(k as keyof PlayerStats)).toBe(true);
    }
  });

  it('has unique ids', () => {
    const ids = GACHA_ABILITIES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('gacha machines', () => {
  it('prices match the spec (500 / 1,000 / 5,000 / 10,000)', () => {
    expect(GACHA_MACHINES.common.cost).toBe(500);
    expect(GACHA_MACHINES.rare.cost).toBe(1000);
    expect(GACHA_MACHINES.epic.cost).toBe(5000);
    expect(GACHA_MACHINES.legendary.cost).toBe(10000);
  });

  it('floors step down the ladder (rare->common, epic->rare, legendary->epic)', () => {
    expect(GACHA_MACHINES.rare.baseRarity).toBe('common');
    expect(GACHA_MACHINES.epic.baseRarity).toBe('rare');
    expect(GACHA_MACHINES.legendary.baseRarity).toBe('epic');
  });

  it('pullMachine is deterministic from its seed', () => {
    const a = pullMachine('legendary', createRNG('p'));
    const b = pullMachine('legendary', createRNG('p'));
    expect(a).toEqual(b);
    expect(getGachaAbility(a.id)).toBeDefined();
  });

  it('the common machine only dispenses commons', () => {
    for (let s = 0; s < 50; s++) {
      expect(pullMachine('common', createRNG(`c-${s}`)).rarity).toBe('common');
    }
  });

  it('each machine dispenses only its headline or floor rarity', () => {
    const allowed: Record<'rare' | 'epic' | 'legendary', Rarity[]> = {
      rare: ['rare', 'common'],
      epic: ['epic', 'rare'],
      legendary: ['legendary', 'epic'],
    };
    for (const machine of ['rare', 'epic', 'legendary'] as const) {
      for (let s = 0; s < 60; s++) {
        expect(allowed[machine]).toContain(pullMachine(machine, createRNG(`${machine}-${s}`)).rarity);
      }
    }
  });

  it('the headline rarity hits ~10% of the time', () => {
    const rate = (machine: 'rare' | 'epic' | 'legendary', top: Rarity): number => {
      const n = 4000;
      let hits = 0;
      for (let s = 0; s < n; s++) if (pullMachine(machine, createRNG(`${machine}-${s}`)).rarity === top) hits += 1;
      return hits / n;
    };
    for (const machine of ['rare', 'epic', 'legendary'] as const) {
      expect(rate(machine, machine)).toBeGreaterThan(0.06);
      expect(rate(machine, machine)).toBeLessThan(0.15);
    }
  });
});
