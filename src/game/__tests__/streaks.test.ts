import { describe, it, expect } from 'vitest';
import { computeHotState } from '@/game/streaks';
import type { SimEvent, SimTeamSide } from '@/types/sim';
import type { QuarterResult } from '@/types/game-state';
import type { Position } from '@/types/roster';

function ev(
  seq: number,
  scorerName: string,
  team: SimTeamSide,
  position: Position,
  result: QuarterResult
): SimEvent {
  return {
    seq,
    clock: '',
    quarter: 1,
    team,
    scorerName,
    scorerPosition: position,
    action: 'midrange',
    result,
    points: result === 'score' || result === 'and-one' ? 2 : 0,
    homeScore: 0,
    awayScore: 0,
    successRate: 50,
    isBigPlay: false,
    text: '',
  };
}

describe('computeHotState', () => {
  it('ignites a scorer on the third straight make and not before', () => {
    const events = [
      ev(0, 'Ace', 'home', 'PG', 'score'),
      ev(1, 'Ace', 'home', 'PG', 'score'),
      ev(2, 'Ace', 'home', 'PG', 'score'),
    ];
    const hot = computeHotState(events);
    expect(hot.get(0)).toMatchObject({ heating: false, igniting: false, hotKeys: [] });
    expect(hot.get(1)).toMatchObject({ heating: true, igniting: false, hotKeys: [] });
    expect(hot.get(2)).toMatchObject({ heating: false, igniting: true });
    expect(hot.get(2)?.hotKeys).toEqual(['home-PG']);
  });

  it('resets the streak and cools the player on a miss', () => {
    const events = [
      ev(0, 'Ace', 'home', 'PG', 'score'),
      ev(1, 'Ace', 'home', 'PG', 'score'),
      ev(2, 'Ace', 'home', 'PG', 'score'), // on fire
      ev(3, 'Ace', 'home', 'PG', 'miss'), // cools off
      ev(4, 'Ace', 'home', 'PG', 'score'), // streak restarts at 1
    ];
    const hot = computeHotState(events);
    expect(hot.get(2)?.hotKeys).toContain('home-PG');
    expect(hot.get(3)?.hotKeys).toEqual([]);
    expect(hot.get(4)).toMatchObject({ heating: false, igniting: false, hotKeys: [] });
  });

  it('keeps a hot player on fire across another player possessions', () => {
    const events = [
      ev(0, 'Ace', 'home', 'PG', 'score'),
      ev(1, 'Ace', 'home', 'PG', 'score'),
      ev(2, 'Ace', 'home', 'PG', 'score'), // Ace on fire
      ev(3, 'Foe', 'away', 'SG', 'score'), // an unrelated bucket
      ev(4, 'Foe', 'away', 'SG', 'miss'),
    ];
    const hot = computeHotState(events);
    expect(hot.get(3)?.hotKeys).toContain('home-PG');
    expect(hot.get(4)?.hotKeys).toContain('home-PG');
  });

  it('blocks count as a miss so the streak restarts from zero', () => {
    const events = [
      ev(0, 'Ace', 'home', 'PG', 'score'),
      ev(1, 'Ace', 'home', 'PG', 'score'),
      ev(2, 'Ace', 'home', 'PG', 'block'), // a stuffed shot resets the streak
      ev(3, 'Ace', 'home', 'PG', 'score'), // restart: 1
      ev(4, 'Ace', 'home', 'PG', 'score'), // 2 -> heating, NOT on fire (proves reset)
    ];
    const hot = computeHotState(events);
    expect(hot.get(2)?.hotKeys).toEqual([]);
    expect(hot.get(4)).toMatchObject({ heating: true, igniting: false });
    expect(hot.get(4)?.hotKeys).toEqual([]);
  });
});
