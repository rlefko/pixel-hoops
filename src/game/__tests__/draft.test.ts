import { describe, it, expect } from 'vitest';
import {
  draftPoints,
  draftCostFor,
  isDraftable,
  evaluateDraft,
  canConfirmDraft,
  suggestDraft,
  playerDraftClass,
  MAX_DRAFT_ROTATION,
} from '@/game/draft';
import { createPlayer } from '@/types/player';
import { ARCHETYPE_POSITION, type RosterPlayer } from '@/types/roster';
import { anchorStatsToClass, type PlayerClass } from '@/game/classes';
import { ovr, classForOvr } from '@/game/ratings';
import { createRNG } from '@/game/rng';

/** A roster player anchored to a class, for cost tests. */
function player(name: string, cls: PlayerClass, legendary = false): RosterPlayer {
  const archetype = 'small-forward';
  const position = ARCHETYPE_POSITION[archetype];
  const base = createPlayer(name, archetype, createRNG(name).int);
  return {
    player: { ...base, stats: anchorStatsToClass(base.stats, cls, position) },
    position,
    originalClass: cls,
    legendary: legendary || undefined,
  };
}

describe('draft costs', () => {
  it('charges 0 below the ladder, 1 at it, 2 one above, bars higher', () => {
    expect(draftCostFor(player('d', 'D'), 'C')).toBe(0);
    expect(draftCostFor(player('c', 'C'), 'C')).toBe(1);
    expect(draftCostFor(player('b', 'B'), 'C')).toBe(2);
    expect(draftCostFor(player('a', 'A'), 'C')).toBeNull();
    expect(isDraftable(player('a', 'A'), 'C')).toBe(false);
  });

  it('always charges 2 for legendaries', () => {
    expect(draftCostFor(player('legend', 'S+', true), 'C')).toBe(2);
    expect(draftCostFor(player('legend', 'S+', true), 'S')).toBe(2);
  });

  it('reads a player class from originalClass', () => {
    expect(playerDraftClass(player('x', 'B'))).toBe('B');
  });

  it('costs an upgraded player by its ORIGINAL class, not the upgraded one', () => {
    // A C-class player whose locker-room upgrades pushed their OVR into B territory.
    const c = player('upgraded', 'C');
    const upgraded: RosterPlayer = {
      ...c,
      player: {
        ...c.player,
        stats: { ...c.player.stats, inside: 10, outside: 10, playmaking: 10, iq: 9 },
      },
    };
    expect(classForOvr(ovr(upgraded.player.stats, upgraded.position))).not.toBe('C');
    expect(playerDraftClass(upgraded)).toBe('C'); // draft class stays original
    expect(draftCostFor(upgraded, 'C')).toBe(1); // a C on the C ladder, not 2
  });
});

describe('draft budget + confirmation', () => {
  const rotation = [
    player('d1', 'D'), player('d2', 'D'), player('d3', 'D'),
    player('c1', 'C'), player('c2', 'C'),
  ];

  it('evaluates spend against the difficulty budget', () => {
    // 3 D (free) + 2 C (1 each) = 2 points.
    const state = evaluateDraft(rotation, 'C', 'easy');
    expect(state.spent).toBe(2);
    expect(state.budget).toBe(draftPoints('easy'));
    expect(state.over).toBe(false);
  });

  it('rejects over-budget, too-strong, or too-small rotations', () => {
    expect(canConfirmDraft(rotation, 'C', 'easy').ok).toBe(true);
    // Insane = 0 points; any C (cost 1) is over budget.
    expect(canConfirmDraft(rotation, 'C', 'insane').ok).toBe(false);
    // A too-strong pick (A on a C ladder) is barred.
    expect(canConfirmDraft([...rotation, player('a', 'A')], 'C', 'easy').ok).toBe(false);
    // Fewer than five is invalid.
    expect(canConfirmDraft(rotation.slice(0, 4), 'C', 'easy').ok).toBe(false);
  });

  it('suggestDraft returns a valid 5-8 rotation within budget', () => {
    const pool = [
      ...Array.from({ length: 6 }, (_, i) => player(`d${i}`, 'D')),
      ...Array.from({ length: 4 }, (_, i) => player(`c${i}`, 'C')),
      ...Array.from({ length: 2 }, (_, i) => player(`b${i}`, 'B')),
    ];
    const picked = suggestDraft(pool, 'C', 'easy');
    expect(picked.length).toBeGreaterThanOrEqual(5);
    expect(picked.length).toBeLessThanOrEqual(MAX_DRAFT_ROTATION);
    expect(canConfirmDraft(picked, 'C', 'easy').ok).toBe(true);
  });
});
