import { describe, it, expect } from 'vitest';
import { gameScore, mvpIndex } from '@/game/box-score';
import type { BoxLine } from '@/types/sim';

/** A box line with sensible zeros, overridden per test. */
function line(over: Partial<BoxLine>): BoxLine {
  return {
    name: 'Player',
    slot: 'PG',
    starter: true,
    pts: 0,
    fgm: 0,
    fga: 0,
    tpm: 0,
    tpa: 0,
    reb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    seconds: 600,
    energy: 100,
    load: 0,
    ...over,
  };
}

describe('gameScore', () => {
  it('matches the adapted Hollinger formula', () => {
    // 28 + 0.4*10 - 0.7*18 + 0.3*9 + 0.7*7 + 2 + 0.7*1 - 3
    const l = line({ pts: 28, fgm: 10, fga: 18, reb: 9, ast: 7, stl: 2, blk: 1, tov: 3 });
    expect(gameScore(l)).toBeCloseTo(28 + 4 - 12.6 + 2.7 + 4.9 + 2 + 0.7 - 3, 6);
  });

  it('penalizes inefficient, turnover-heavy volume', () => {
    const chucker = line({ pts: 20, fgm: 8, fga: 25, tov: 6 });
    const efficient = line({ pts: 18, fgm: 7, fga: 10, reb: 8, ast: 6, stl: 2 });
    expect(gameScore(efficient)).toBeGreaterThan(gameScore(chucker));
  });
});

describe('mvpIndex', () => {
  it('crowns the highest game score, not the top scorer', () => {
    const lines = [
      line({ name: 'Chucker', pts: 30, fgm: 12, fga: 30, tov: 5 }),
      line({ name: 'Floor General', pts: 18, fgm: 7, fga: 11, reb: 9, ast: 11, stl: 3 }),
    ];
    expect(mvpIndex(lines)).toBe(1);
  });

  it('ignores players who never checked in', () => {
    const lines = [
      line({ name: 'Starter', pts: 12, fgm: 5, fga: 10, reb: 4, ast: 3 }),
      line({ name: 'DNP', pts: 0, seconds: 0 }),
    ];
    expect(mvpIndex(lines)).toBe(0);
  });

  it('returns -1 when nobody played', () => {
    expect(mvpIndex([line({ seconds: 0 }), line({ seconds: 0 })])).toBe(-1);
    expect(mvpIndex([])).toBe(-1);
  });
});
