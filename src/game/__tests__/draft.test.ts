import { describe, it, expect } from 'vitest';
import {
  draftPoints,
  draftCostFor,
  isDraftable,
  evaluateDraft,
  canConfirmLoadout,
  defaultLoadout,
  playerDraftClass,
  MAX_DRAFT_ROTATION,
} from '@/game/draft';
import { createPlayer } from '@/types/player';
import {
  ARCHETYPE_POSITION,
  POSITION_ARCHETYPE,
  POSITIONS,
  type Position,
  type RosterPlayer,
} from '@/types/roster';
import { anchorStatsToClass, type PlayerClass } from '@/game/classes';
import { ovr, classForOvr } from '@/game/ratings';
import { createRNG } from '@/game/rng';

/** A roster player anchored to a class at a position, for cost/loadout tests. */
function playerAt(name: string, cls: PlayerClass, position: Position, legendary = false): RosterPlayer {
  const archetype = POSITION_ARCHETYPE[position];
  const base = createPlayer(name, archetype, createRNG(name).int);
  return {
    player: { ...base, stats: anchorStatsToClass(base.stats, cls, position) },
    position,
    originalClass: cls,
    legendary: legendary || undefined,
  };
}

/** A small-forward roster player anchored to a class (cost tests). */
function player(name: string, cls: PlayerClass, legendary = false): RosterPlayer {
  return playerAt(name, cls, ARCHETYPE_POSITION['small-forward'], legendary);
}

/** One player per position at a class, plus extras, for loadout tests. */
function poolOfClass(cls: PlayerClass, prefix = ''): RosterPlayer[] {
  return POSITIONS.map((pos) => playerAt(`${prefix}${cls}-${pos}`, cls, pos));
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
        stats: { ...c.player.stats, inside: 20, outside: 20, playmaking: 20, iq: 18 },
      },
    };
    expect(classForOvr(ovr(upgraded.player.stats, upgraded.position))).not.toBe('C');
    expect(playerDraftClass(upgraded)).toBe('C'); // draft class stays original
    expect(draftCostFor(upgraded, 'C')).toBe(1); // a C on the C ladder, not 2
  });
});

describe('draft budget + loadout', () => {
  const starters = poolOfClass('C'); // one C at each position (1 point each = 5)

  it('evaluates spend against the difficulty budget', () => {
    const state = evaluateDraft(starters, 'C', 'easy');
    expect(state.spent).toBe(5); // five C players, 1 point each
    expect(state.budget).toBe(draftPoints('easy'));
    expect(state.over).toBe(false);
  });

  it('canConfirmLoadout requires five starters, draftable picks, and budget', () => {
    expect(canConfirmLoadout(starters, [], 'C', 'easy').ok).toBe(true);
    // Five C players (5 points) exceed the 2-point hard budget.
    expect(canConfirmLoadout(starters, [], 'C', 'hard').ok).toBe(false);
    // A too-strong bench pick (A on a C ladder) is barred.
    expect(canConfirmLoadout(starters, [playerAt('a', 'A', 'PG')], 'C', 'easy').ok).toBe(false);
    // Fewer than five starters is invalid.
    expect(canConfirmLoadout(starters.slice(0, 4), [], 'C', 'easy').ok).toBe(false);
    // More than eight total is invalid.
    expect(canConfirmLoadout(starters, poolOfClass('D', 'x'), 'C', 'easy').ok).toBe(false);
  });

  it('defaultLoadout fills one slot per position within budget', () => {
    const pool = [...poolOfClass('D'), ...poolOfClass('C'), ...poolOfClass('B')];
    const { starters: s, bench } = defaultLoadout(pool, 'C', 'easy');
    expect(s).toHaveLength(5);
    expect(s.map((p) => p.position)).toEqual([...POSITIONS]); // slot-ordered by position
    expect(s.length + bench.length).toBeLessThanOrEqual(MAX_DRAFT_ROTATION);
    expect(canConfirmLoadout(s, bench, 'C', 'easy').ok).toBe(true);
  });

  it('defaultLoadout restores a still-owned, affordable lastRotation', () => {
    const want = poolOfClass('D'); // the exact players to restore (all free on C)
    const lastRotation = want.map((p) => `${p.player.name}|${p.position}`);
    const pool = [...want, ...poolOfClass('C')]; // collection contains the same identities
    const { starters: s } = defaultLoadout(pool, 'C', 'easy', lastRotation);
    expect(s.map((p) => `${p.player.name}|${p.position}`)).toEqual(lastRotation.slice(0, 5));
  });
});

describe('one legend per rotation', () => {
  // Five starters: a legend plus four free below-ladder players (spend 2, well inside easy's 8),
  // so only the LEGEND COUNT can push a loadout illegal here, not the budget.
  const legend1 = playerAt('legend-one', 'S+', 'PG', true);
  const fillers = POSITIONS.slice(1).map((pos) => playerAt(`d-${pos}`, 'D', pos));
  const oneLegendFive = [legend1, ...fillers];

  it('accepts a single reach-up legend on a low ladder', () => {
    expect(oneLegendFive).toHaveLength(5);
    expect(canConfirmLoadout(oneLegendFive, [], 'C', 'easy').ok).toBe(true);
  });

  it('rejects two reach-up legends on a low ladder', () => {
    const legend2 = playerAt('legend-two', 'S+', 'SG', true);
    const result = canConfirmLoadout(oneLegendFive, [legend2], 'C', 'easy');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('One legend per rotation');
  });

  it('does NOT cap native legends on the S+ ladder (they are the ladder class)', () => {
    // Five S+ legends on the S+ ladder cost 2 each (10) -- over easy's 8, so pare to four
    // legends + one free below-ladder filler: legal, proving the cap does not fire here.
    const legends = POSITIONS.slice(0, 4).map((pos) => playerAt(`sp-${pos}`, 'S+', pos, true));
    const filler = playerAt('a-c', 'A', 'C'); // A is below the S+ ladder -> free
    expect(canConfirmLoadout([...legends, filler], [], 'S+', 'easy').ok).toBe(true);
  });
});
