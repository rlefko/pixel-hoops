import { describe, it, expect } from 'vitest';
import {
  EMPTY_TEAM_MODIFIER,
  addStatDelta,
  applyStatDelta,
  hasDelta,
  mergeTeamModifiers,
  scaleTeamModifier,
  teamModifierFromPartial,
} from '@/game/effects';
import type { PlayerStats } from '@/types/player';

const baseStats: PlayerStats = {
  inside: 5, outside: 5, playmaking: 5, perimeterD: 5, interiorD: 5,
  athleticism: 5, iq: 5, clutch: 5, stamina: 5, durability: 5,
};

describe('effects: stat deltas', () => {
  it('addStatDelta sums entries without mutating inputs', () => {
    const a = { outside: 1 };
    const b = { outside: 2, inside: 1 };
    expect(addStatDelta(a, b)).toEqual({ outside: 3, inside: 1 });
    expect(a).toEqual({ outside: 1 });
  });

  it('applyStatDelta clamps to 3..10 and returns a copy', () => {
    const out = applyStatDelta(baseStats, { outside: 4, perimeterD: -4 });
    expect(out.outside).toBe(9);
    expect(out.perimeterD).toBe(3); // clamped at floor
    expect(baseStats.outside).toBe(5); // unchanged
    const maxed = applyStatDelta({ ...baseStats, inside: 9 }, { inside: 5 });
    expect(maxed.inside).toBe(10); // clamped at ceiling
  });

  it('hasDelta detects non-zero entries', () => {
    expect(hasDelta({})).toBe(false);
    expect(hasDelta({ outside: 0 })).toBe(false);
    expect(hasDelta({ outside: 1 })).toBe(true);
  });
});

describe('effects: team modifiers', () => {
  it('mergeTeamModifiers sums fields and concats hooks/labels', () => {
    const a = teamModifierFromPartial({ offenseBonus: 1, extra: { outside: 1 }, labels: ['A'] });
    const b = teamModifierFromPartial({
      offenseBonus: 0.5,
      extra: { outside: 1, inside: 2 },
      hooks: [{ kind: 'paceClutch', minPace: 7, clutchAdd: 2 }],
      labels: ['B'],
    });
    const m = mergeTeamModifiers([a, b]);
    expect(m.offenseBonus).toBe(1.5);
    expect(m.extra).toEqual({ outside: 2, inside: 2 });
    expect(m.hooks).toHaveLength(1);
    expect(m.labels).toEqual(['A', 'B']);
  });

  it('an empty merge equals the empty modifier (identity)', () => {
    expect(mergeTeamModifiers([EMPTY_TEAM_MODIFIER])).toEqual(EMPTY_TEAM_MODIFIER);
    expect(mergeTeamModifiers([])).toEqual(EMPTY_TEAM_MODIFIER);
  });

  it('scaleTeamModifier multiplies magnitudes but applies hooks once', () => {
    const scaled = scaleTeamModifier(
      { offenseBonus: 1, extra: { outside: 1 }, hooks: [{ kind: 'quarterDelta', quarter: 4, delta: { outside: 1 } }] },
      3
    );
    expect(scaled.offenseBonus).toBe(3);
    expect(scaled.extra).toEqual({ outside: 3 });
    expect(scaled.hooks).toHaveLength(1); // not tripled
  });
});
