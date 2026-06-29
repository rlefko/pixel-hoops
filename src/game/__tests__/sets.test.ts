import { describe, it, expect } from 'vitest';
import { createRNG } from '@/game/rng';
import { createPlayer } from '@/types/player';
import type { RosterPlayer } from '@/types/roster';
import type { TeamModifier } from '@/game/effects';
import {
  BOOST_FAMILIES,
  ITEM_FAMILIES,
  FAMILY_LABELS,
  SET_DEFS,
  resolveSets,
  type SetProgress,
} from '@/game/sets';
import { BOOST_BY_ID, type PassiveBoost } from '@/game/boosts';
import { ITEM_BY_ID } from '@/game/items';

function player(item?: string): RosterPlayer {
  return {
    player: createPlayer('P', 'small-forward', createRNG('p').int),
    position: 'SF',
    item: item ? { defId: item } : undefined,
  };
}

const boosts = (...ids: string[]): PassiveBoost[] => ids.map((id) => ({ id }));
const progressFor = (p: SetProgress[], id: string): SetProgress => p.find((x) => x.def.id === id)!;
const byLabel = (active: TeamModifier[], name: string): TeamModifier | undefined =>
  active.find((m) => m.labels.includes(name));

describe('set families', () => {
  it('every family member id resolves to a real def', () => {
    for (const tag in BOOST_FAMILIES) {
      for (const id of BOOST_FAMILIES[tag]) expect(BOOST_BY_ID[id], `boost ${id}`).toBeDefined();
    }
    for (const tag in ITEM_FAMILIES) {
      for (const id of ITEM_FAMILIES[tag]) expect(ITEM_BY_ID[id], `item ${id}`).toBeDefined();
    }
  });

  it('every family has a non-empty display label', () => {
    for (const tag in BOOST_FAMILIES) expect(FAMILY_LABELS[tag], tag).toBeTruthy();
    for (const tag in ITEM_FAMILIES) expect(FAMILY_LABELS[tag], tag).toBeTruthy();
  });

  it('every set has unique ids and at least one prerequisite unit', () => {
    const ids = SET_DEFS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Every set needs a positive requirement total, so progress ratios never divide
    // by zero (SetRow relies on this).
    for (const def of SET_DEFS) {
      const need = def.reqs.reduce((n, r) => n + (r.fromBoosts ?? 0) + (r.fromItems ?? 0), 0);
      expect(need, def.id).toBeGreaterThan(0);
    }
  });
});

describe('resolveSets', () => {
  it('does not activate a set whose prerequisites are unmet', () => {
    const { active, progress } = resolveSets([player()], boosts('seven-seconds', 'fast-break'));
    expect(byLabel(active, 'Track Meet')).toBeUndefined();
    const p = progressFor(progress, 'set-track-meet');
    expect(p.have).toBe(2);
    expect(p.need).toBe(3);
    expect(p.met).toBe(false);
  });

  it('activates a three-boost set and folds its bonus', () => {
    const { active, progress } = resolveSets([player()], boosts('seven-seconds', 'fast-break', 'run-and-gun'));
    expect(progressFor(progress, 'set-track-meet').met).toBe(true);
    const mod = byLabel(active, 'Track Meet');
    expect(mod?.paceBonus).toBe(2);
    expect(mod?.extra.athleticism).toBe(1);
  });

  it('activates a mixed boost+item duo (Bombs Away)', () => {
    // Needs a splash boost AND a shooter item; neither alone is enough.
    expect(byLabel(resolveSets([player('grip-tape')], boosts('splash-brothers')).active, 'Bombs Away')).toBeDefined();
    expect(byLabel(resolveSets([player('grip-tape')], []).active, 'Bombs Away')).toBeUndefined();
    expect(byLabel(resolveSets([player()], boosts('splash-brothers')).active, 'Bombs Away')).toBeUndefined();
  });

  it('requires DIFFERENT players for a distinct-player duo (Lob City)', () => {
    // A passer plus a rim runner, on two different players.
    const met = resolveSets([player('playmaker-gloves'), player('track-spikes')], []);
    expect(byLabel(met.active, 'Lob City')).toBeDefined();
    // Only one of the two tags present: not met.
    const partial = resolveSets([player('playmaker-gloves')], []);
    expect(byLabel(partial.active, 'Lob City')).toBeUndefined();
    expect(progressFor(partial.progress, 'set-lob-city').have).toBe(1);
  });

  it('needs two distinct anchors for Rim Wall', () => {
    expect(byLabel(resolveSets([player('anchor-brace')], []).active, 'Rim Wall')).toBeUndefined();
    const both = resolveSets([player('anchor-brace'), player('rim-protector-pads')], []);
    expect(byLabel(both.active, 'Rim Wall')?.extra.interiorD).toBe(3);
  });
});
