import { describe, it, expect } from 'vitest';
import {
  GACHA_ABILITIES,
  GACHA_MACHINES,
  getGachaAbility,
  pullMachine,
  type AbilityRarity,
} from '@/game/abilities-gacha';
import { createRNG } from '@/game/rng';
import type { StatDelta } from '@/game/effects';
import type { PlayerStats } from '@/types/player';

const sum = (d?: StatDelta): number =>
  d ? Object.values(d).reduce((a, b) => a + (b ?? 0), 0) : 0;
const negatives = (d?: StatDelta): number =>
  d ? Object.values(d).filter((v) => (v ?? 0) < 0).length : 0;
const positives = (d?: StatDelta): number =>
  d ? Object.values(d).filter((v) => (v ?? 0) > 0).length : 0;

describe('gacha ability power bands', () => {
  it('commons are one +1 boost and one -1 drawback', () => {
    const commons = GACHA_ABILITIES.filter((a) => a.rarity === 'common');
    expect(commons.length).toBeGreaterThanOrEqual(12);
    for (const a of commons) {
      expect(a.teamAura).toBeUndefined();
      expect(positives(a.selfDelta)).toBe(1);
      expect(negatives(a.selfDelta)).toBe(1);
      expect(sum(a.selfDelta)).toBe(0); // net-zero: a real trade-off
    }
  });

  it('rares are a net +2 player boost OR a team boost with a -1 drawback', () => {
    const rares = GACHA_ABILITIES.filter((a) => a.rarity === 'rare');
    expect(rares.length).toBeGreaterThanOrEqual(8);
    for (const a of rares) {
      if (a.teamAura) {
        expect(negatives(a.selfDelta)).toBe(1); // a team boost pays a personal cost
      } else {
        expect(sum(a.selfDelta)).toBe(2);
        expect(negatives(a.selfDelta)).toBe(0);
      }
    }
  });

  it('legendaries have no drawback', () => {
    const legendaries = GACHA_ABILITIES.filter((a) => a.rarity === 'legendary');
    expect(legendaries.length).toBeGreaterThanOrEqual(5);
    for (const a of legendaries) {
      expect(negatives(a.selfDelta)).toBe(0);
      const teamNeg = a.teamAura
        ? (['offenseBonus', 'defenseBonus', 'paceBonus', 'clutchBonus'] as const).some(
            (k) => (a.teamAura?.[k] ?? 0) < 0
          ) || negatives(a.teamAura.extra) > 0
        : false;
      expect(teamNeg).toBe(false);
      // Either a +2 player boost or a team aura.
      expect(sum(a.selfDelta) === 2 || !!a.teamAura).toBe(true);
    }
  });

  it('only references real stat keys', () => {
    const keys = new Set<keyof PlayerStats>([
      'inside', 'outside', 'playmaking', 'perimeterD', 'interiorD',
      'athleticism', 'iq', 'clutch', 'stamina', 'durability',
    ]);
    for (const a of GACHA_ABILITIES) {
      for (const k of Object.keys(a.selfDelta ?? {})) expect(keys.has(k as keyof PlayerStats)).toBe(true);
    }
  });
});

describe('gacha machines', () => {
  it('prices match the spec (100 / 1,000 / 10,000)', () => {
    expect(GACHA_MACHINES.common.cost).toBe(100);
    expect(GACHA_MACHINES.rare.cost).toBe(1000);
    expect(GACHA_MACHINES.legendary.cost).toBe(10000);
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

  it('the rare/legendary machines hit their headline rarity ~10% of the time', () => {
    const rate = (machine: 'rare' | 'legendary', top: AbilityRarity): number => {
      const n = 4000;
      let hits = 0;
      for (let s = 0; s < n; s++) if (pullMachine(machine, createRNG(`${machine}-${s}`)).rarity === top) hits += 1;
      return hits / n;
    };
    expect(rate('rare', 'rare')).toBeGreaterThan(0.06);
    expect(rate('rare', 'rare')).toBeLessThan(0.15);
    expect(rate('legendary', 'legendary')).toBeGreaterThan(0.06);
    expect(rate('legendary', 'legendary')).toBeLessThan(0.15);
  });
});
