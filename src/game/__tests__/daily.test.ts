import { describe, it, expect } from 'vitest';
import {
  DAILY_BOUNTY_COINS,
  dayKey,
  spotlightCell,
  weekKey,
  weeklyProgress,
  WEEKLY_TIERS,
} from '@/game/daily';
import { cellKey, DIFFICULTIES, unlockedClassesFromCells } from '@/game/difficulty-mode';

/** Build a timestamp from LOCAL calendar components, so every assertion holds in
 * any CI timezone (the module's contract is the player's local midnight). */
const local = (y: number, mo: number, d: number, h = 12, mi = 0) =>
  new Date(y, mo - 1, d, h, mi, 0, 0).getTime();

describe('dayKey (local calendar day)', () => {
  it('formats YYYY-MM-DD with zero padding', () => {
    expect(dayKey(local(2026, 7, 1))).toBe('2026-07-01');
    expect(dayKey(local(2026, 11, 9))).toBe('2026-11-09');
  });

  it('splits exactly at local midnight and holds within a day', () => {
    expect(dayKey(local(2026, 6, 30, 23, 59))).toBe('2026-06-30');
    expect(dayKey(local(2026, 7, 1, 0, 0))).toBe('2026-07-01');
    expect(dayKey(local(2026, 7, 1, 1, 0))).toBe(dayKey(local(2026, 7, 1, 23, 0)));
  });

  it('is stable across US DST transitions', () => {
    // Spring forward (2026-03-08) and fall back (2026-11-01): both sides of the
    // shifted hour stay inside their calendar day.
    expect(dayKey(local(2026, 3, 8, 1, 59))).toBe('2026-03-08');
    expect(dayKey(local(2026, 3, 8, 3, 1))).toBe('2026-03-08');
    expect(dayKey(local(2026, 11, 1, 0, 30))).toBe('2026-11-01');
    expect(dayKey(local(2026, 11, 1, 23, 30))).toBe('2026-11-01');
  });
});

describe('weekKey (local Monday)', () => {
  it('maps all seven days to that Monday, Sunday to the PRECEDING Monday', () => {
    // 2026-06-29 is a Monday.
    for (let d = 29; d <= 30; d++) expect(weekKey(local(2026, 6, d))).toBe('2026-06-29');
    for (let d = 1; d <= 5; d++) expect(weekKey(local(2026, 7, d))).toBe('2026-06-29');
    expect(weekKey(local(2026, 7, 5))).toBe('2026-06-29'); // Sunday
    expect(weekKey(local(2026, 7, 6))).toBe('2026-07-06'); // next Monday opens a week
  });

  it('keeps a DST-containing week on one Monday', () => {
    // 2026-03-08 (spring forward) is a Sunday of the week starting 2026-03-02.
    expect(weekKey(local(2026, 3, 8, 3, 30))).toBe('2026-03-02');
    expect(weekKey(local(2026, 3, 2))).toBe('2026-03-02');
  });
});

describe('spotlightCell', () => {
  const day = '2026-07-01';

  it('is deterministic for the same day and cleared set', () => {
    const cells = [cellKey('easy', 'C'), cellKey('easy', 'B')];
    expect(spotlightCell(day, cells)).toEqual(spotlightCell(day, cells));
  });

  it('always lands on a selectable class', () => {
    const sets = [
      [],
      [cellKey('easy', 'C')],
      [cellKey('easy', 'C'), cellKey('medium', 'C'), cellKey('easy', 'B')],
      [cellKey('hard', 'S'), cellKey('insane', 'S')],
    ];
    for (const cells of sets) {
      const unlocked = unlockedClassesFromCells(cells);
      for (let d = 1; d <= 28; d++) {
        const cell = spotlightCell(`2026-07-${String(d).padStart(2, '0')}`, cells);
        expect(unlocked).toContain(cell.ladderClass);
        expect(DIFFICULTIES).toContain(cell.difficulty);
      }
    }
  });

  it('a fresh save always spotlights class C', () => {
    for (let d = 1; d <= 14; d++) {
      expect(spotlightCell(`2026-07-${String(d).padStart(2, '0')}`, []).ladderClass).toBe('C');
    }
  });

  it('rotates: a month of days visits multiple difficulties and classes', () => {
    const cells = [
      cellKey('easy', 'C'),
      cellKey('easy', 'B'),
      cellKey('easy', 'A'),
      cellKey('hard', 'C'),
    ];
    const seen = new Set<string>();
    for (let d = 1; d <= 30; d++) {
      const cell = spotlightCell(`2026-06-${String(d).padStart(2, '0')}`, cells);
      seen.add(`${cell.difficulty}:${cell.ladderClass}`);
    }
    expect(seen.size).toBeGreaterThan(4);
  });

  it('weights hard/insane up once the player has proven themselves there', () => {
    const veteran = [
      cellKey('easy', 'C'),
      cellKey('easy', 'B'),
      cellKey('easy', 'A'),
      cellKey('hard', 'A'),
    ];
    let punishing = 0;
    const days = 200;
    for (let d = 0; d < days; d++) {
      const cell = spotlightCell(`vet-${d}`, veteran);
      if (cell.difficulty === 'hard' || cell.difficulty === 'insane') punishing += 1;
    }
    // Standard weighting is 1/2/3/2: hard+insane = 5/8 of days in expectation.
    expect(punishing / days).toBeGreaterThan(0.5);
    expect(punishing / days).toBeLessThan(0.75);
  });
});

describe('weekly tiers and progress', () => {
  it('tiers ascend in wins and coins, rare ability only at the top', () => {
    for (let i = 1; i < WEEKLY_TIERS.length; i++) {
      expect(WEEKLY_TIERS[i].wins).toBeGreaterThan(WEEKLY_TIERS[i - 1].wins);
      expect(WEEKLY_TIERS[i].coins).toBeGreaterThan(WEEKLY_TIERS[i - 1].coins);
    }
    expect(WEEKLY_TIERS.at(-1)!.abilityRarity).toBe('rare');
    expect(WEEKLY_TIERS.slice(0, -1).every((t) => !t.abilityRarity)).toBe(true);
  });

  it('weeklyProgress zeroes a ledger from another week, keeps the current one', () => {
    const ledger = { week: '2026-06-29', gameWins: 42, claimedTiers: [0, 1] };
    expect(weeklyProgress(ledger, '2026-06-29')).toEqual({ gameWins: 42, claimedTiers: [0, 1] });
    expect(weeklyProgress(ledger, '2026-07-06')).toEqual({ gameWins: 0, claimedTiers: [] });
    expect(weeklyProgress(undefined, '2026-07-06')).toEqual({ gameWins: 0, claimedTiers: [] });
  });

  it('daily bounty coins climb with difficulty', () => {
    expect(DAILY_BOUNTY_COINS.easy).toBeLessThan(DAILY_BOUNTY_COINS.medium);
    expect(DAILY_BOUNTY_COINS.medium).toBeLessThan(DAILY_BOUNTY_COINS.hard);
    expect(DAILY_BOUNTY_COINS.hard).toBeLessThan(DAILY_BOUNTY_COINS.insane);
  });
});
