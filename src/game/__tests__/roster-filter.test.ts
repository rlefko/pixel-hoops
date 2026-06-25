import { describe, it, expect } from 'vitest';
import {
  effectiveOvr,
  compareByRatingDesc,
  availableClasses,
  availablePositions,
} from '@/game/roster-filter';
import { isDraftable } from '@/game/draft';
import { totalUpgrades, type HomeRoster } from '@/game/home-roster';
import { anchorStatsToClass, type PlayerClass } from '@/game/classes';
import { createRNG } from '@/game/rng';
import { createPlayer } from '@/types/player';
import { POSITION_ARCHETYPE, type Position, type RosterPlayer } from '@/types/roster';

/** A roster player anchored to a class at a position (mirrors draft.test.ts). */
function playerAt(name: string, cls: PlayerClass, position: Position, legendary = false): RosterPlayer {
  const base = createPlayer(name, POSITION_ARCHETYPE[position], createRNG(name).int);
  return {
    player: { ...base, stats: anchorStatsToClass(base.stats, cls, position) },
    position,
    originalClass: cls,
    legendary: legendary || undefined,
  };
}

describe('compareByRatingDesc', () => {
  it('orders by effective rating, highest first', () => {
    const low = playerAt('low', 'D', 'SF');
    const high = playerAt('high', 'B', 'SF');
    expect(effectiveOvr(high)).toBeGreaterThan(effectiveOvr(low));
    expect([low, high].sort(compareByRatingDesc())[0]).toBe(high);
  });

  it('breaks rating ties by upgrades applied, then by name', () => {
    const a = playerAt('Zed', 'C', 'PG');
    // Same stats + position => identical effective OVR; only name/upgrades differ.
    const b: RosterPlayer = { ...a, player: { ...a.player, name: 'Abe' } };
    expect(effectiveOvr(a)).toBe(effectiveOvr(b));

    const counts: Record<string, number> = { Zed: 3, Abe: 0 };
    const upgradesOf = (rp: RosterPlayer) => counts[rp.player.name] ?? 0;
    // More upgrades wins the tie even though "Zed" sorts later by name.
    expect([b, a].sort(compareByRatingDesc(upgradesOf))[0]).toBe(a);
    // With no upgrade lookup, ties fall back to name order ("Abe" before "Zed").
    expect([a, b].sort(compareByRatingDesc())[0]).toBe(b);
  });
});

describe('availableClasses / availablePositions', () => {
  const pool = [
    playerAt('d-pg', 'D', 'PG'),
    playerAt('c-sf', 'C', 'SF'),
    playerAt('a-c', 'A', 'C'),
  ];

  it('lists every class/position present when no selectable filter is given', () => {
    expect(availableClasses(pool)).toEqual(new Set<PlayerClass>(['D', 'C', 'A']));
    expect(availablePositions(pool)).toEqual(new Set<Position>(['PG', 'SF', 'C']));
  });

  it('drops classes/positions whose only players are barred for the draft', () => {
    // On a C ladder the A-class center is barred (2 above), so class A and
    // position C grey out.
    const selectable = (rp: RosterPlayer) => isDraftable(rp, 'C');
    expect(availableClasses(pool, selectable)).toEqual(new Set<PlayerClass>(['D', 'C']));
    expect(availablePositions(pool, selectable)).toEqual(new Set<Position>(['PG', 'SF']));

    // A draftable legendary keeps its class (and its position) enabled.
    const withLegend = [...pool, playerAt('legend', 'S+', 'C', true)];
    expect(availableClasses(withLegend, selectable)).toEqual(new Set<PlayerClass>(['D', 'C', 'S+']));
    expect(availablePositions(withLegend, selectable)).toEqual(new Set<Position>(['PG', 'SF', 'C']));
  });
});

describe('totalUpgrades', () => {
  it('sums the per-stat upgrade ledger for a player', () => {
    const rp = playerAt('Buyer', 'C', 'SG');
    const home = { upgrades: { 'Buyer|SG': { inside: 2, outside: 3 } } } as unknown as HomeRoster;
    expect(totalUpgrades(home, rp)).toBe(5);
  });

  it('returns 0 when the player has no ledger entry', () => {
    const rp = playerAt('Fresh', 'C', 'SG');
    const home = { upgrades: {} } as unknown as HomeRoster;
    expect(totalUpgrades(home, rp)).toBe(0);
  });
});
