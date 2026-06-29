import { describe, it, expect } from 'vitest';
import {
  summarizeSetBonus,
  setHintForOffer,
  boostFamilyLabels,
  itemFamilyLabels,
} from '@/components/run/set-ui';
import { SET_DEFS } from '@/game/sets';
import { createRNG } from '@/game/rng';
import { createPlayer } from '@/types/player';
import type { RosterPlayer } from '@/types/roster';

describe('summarizeSetBonus', () => {
  it('renders pace and extra stats compactly', () => {
    expect(summarizeSetBonus({ paceBonus: 2, extra: { athleticism: 1 } })).toBe('+2 pace, +1 ath');
    expect(summarizeSetBonus({ extra: { perimeterD: 2, interiorD: 2 } })).toBe('+2 perD, +2 intD');
    expect(summarizeSetBonus({ extra: { outside: 3 } })).toBe('+3 out');
    expect(summarizeSetBonus({})).toBe('');
  });

  it('summarizes every shipped set bonus to a non-empty string', () => {
    for (const def of SET_DEFS) expect(summarizeSetBonus(def.bonus), def.id).not.toBe('');
  });
});

describe('family labels', () => {
  it('maps a boost or item id to its family display name', () => {
    expect(boostFamilyLabels('seven-seconds')).toContain('Run & Gun');
    expect(itemFamilyLabels('grip-tape')).toContain('Shooter');
    expect(boostFamilyLabels('closer')).toEqual([]); // not in a family
  });
});

describe('setHintForOffer', () => {
  const player = (item?: string): RosterPlayer => ({
    player: createPlayer('P', 'small-forward', createRNG('p').int),
    position: 'SF',
    item: item ? { defId: item } : undefined,
  });

  it('appends the set effect when an offer advances a set', () => {
    // Two run-and-gun boosts owned; a third completes Track Meet.
    const hint = setHintForOffer('run-and-gun', [{ id: 'seven-seconds' }, { id: 'fast-break' }], [player()]);
    expect(hint).toContain('Track Meet');
    expect(hint).toContain('(+2 pace, +1 ath)');
  });

  it('returns null for an offer that touches no set', () => {
    expect(setHintForOffer('closer', [], [player()])).toBeNull();
  });
});
