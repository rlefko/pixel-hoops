import { describe, it, expect } from 'vitest';
import {
  FAVOR_CHAMPION_BONUS,
  FAVOR_PER_COPY,
  FAVOR_REACH_UP_DAMP,
  FAVOR_RESIDUAL_COIN_RATE,
  FAVOR_WIN_POINTS,
  addFavor,
  cashOutFavor,
  favorConvertible,
  favorToCopies,
  settleFavorEarned,
} from '@/game/favor';
import { COPIES_TO_OWN } from '@/game/collection';
import { difficultyMods, DIFFICULTIES } from '@/game/difficulty-mode';
import { CLASS_ORDER } from '@/game/ratings';

describe('favor constants', () => {
  it('win points escalate with opponent tier and the championship pays the spike', () => {
    expect(FAVOR_WIN_POINTS.game).toBeLessThan(FAVOR_WIN_POINTS.elite);
    expect(FAVOR_WIN_POINTS.elite).toBeLessThan(FAVOR_WIN_POINTS.boss);
    expect(FAVOR_CHAMPION_BONUS).toBeGreaterThan(FAVOR_WIN_POINTS.boss);
  });

  it('per-copy thresholds scale with rarity where favor converts', () => {
    expect(FAVOR_PER_COPY.C).toBeLessThan(FAVOR_PER_COPY.B);
    expect(FAVOR_PER_COPY.B).toBeLessThan(FAVOR_PER_COPY.A);
    expect(FAVOR_PER_COPY.A).toBeLessThan(FAVOR_PER_COPY.S);
  });

  it('legends never convert (one copy owns them; favor only steers the reveal)', () => {
    expect(favorConvertible('S+')).toBe(false);
    expect(favorConvertible('S++')).toBe(false);
    expect(favorConvertible('D')).toBe(false);
    for (const cls of ['C', 'B', 'A', 'S'] as const) expect(favorConvertible(cls)).toBe(true);
  });

  it('favorMul climbs with difficulty', () => {
    const muls = DIFFICULTIES.map((d) => difficultyMods(d).favorMul);
    for (let i = 1; i < muls.length; i++) expect(muls[i]).toBeGreaterThan(muls[i - 1]);
    expect(muls[0]).toBe(1.0);
  });
});

describe('the single-run leak invariant', () => {
  it('a maximal below-ladder run converts at most ONE above-class copy', () => {
    // The structural no-leak proof: the biggest favor a reach-up player can bank from
    // one run (every game won with them fielded from map one, championship included,
    // on insane) stays under two favor-copies, so one deposit copy plus at most one
    // favor copy can never reach the A threshold of four.
    const maxBase =
      11 * FAVOR_WIN_POINTS.game + // regular wins across a full run
      6 * FAVOR_WIN_POINTS.elite + // a heavy elite draw
      7 * FAVOR_WIN_POINTS.boss + // every boss
      FAVOR_CHAMPION_BONUS;
    const worst = settleFavorEarned(maxBase, difficultyMods('insane').favorMul, true);
    const { copies } = favorToCopies(worst, 'A');
    expect(copies).toBeLessThanOrEqual(1);
    expect(1 + copies).toBeLessThan(COPIES_TO_OWN.A);
  });

  it('an at-class dedicated hard clear banks roughly one A copy', () => {
    // Calibration anchor: fielded from map one through a hard clear, an A recruit's
    // favor lands at one copy plus a visible remainder (the "almost theirs" meter).
    const base =
      11 * FAVOR_WIN_POINTS.game +
      4 * FAVOR_WIN_POINTS.elite +
      7 * FAVOR_WIN_POINTS.boss +
      FAVOR_CHAMPION_BONUS;
    const earned = settleFavorEarned(base, difficultyMods('hard').favorMul, false);
    const { copies, remainder } = favorToCopies(earned, 'A');
    expect(copies).toBe(1);
    expect(remainder).toBeGreaterThan(0);
  });
});

describe('favor math', () => {
  it('settleFavorEarned rounds, scales, and damps reach-ups by half', () => {
    expect(settleFavorEarned(10, 1.5, false)).toBe(15);
    expect(settleFavorEarned(10, 1.5, true)).toBe(Math.round(10 * 1.5 * FAVOR_REACH_UP_DAMP));
    expect(settleFavorEarned(0, 2.0, false)).toBe(0);
    expect(settleFavorEarned(-5, 2.0, false)).toBe(0);
  });

  it('favorToCopies splits whole copies from the remainder', () => {
    expect(favorToCopies(0, 'A')).toEqual({ copies: 0, remainder: 0 });
    expect(favorToCopies(39, 'A')).toEqual({ copies: 0, remainder: 39 });
    expect(favorToCopies(40, 'A')).toEqual({ copies: 1, remainder: 0 });
    expect(favorToCopies(95, 'A')).toEqual({ copies: 2, remainder: 15 });
    expect(favorToCopies(500, 'S+')).toEqual({ copies: 0, remainder: 500 });
  });

  it('cashOutFavor drops the entry in place and pays coins at the residual rate', () => {
    const ledger = { 'Signed Chase|PG': 12, 'Other Chase|SG': 5 };
    expect(cashOutFavor(ledger, 'Signed Chase|PG')).toBe(12 * FAVOR_RESIDUAL_COIN_RATE);
    expect(ledger['Signed Chase|PG']).toBeUndefined();
    expect(ledger['Other Chase|SG']).toBe(5);
    expect(cashOutFavor(ledger, 'Nobody|C')).toBe(0);
  });

  it('addFavor is immutable and a no-op reference on empty input', () => {
    const ledger = { 'a|PG': 3 };
    expect(addFavor(ledger, [], 5)).toBe(ledger);
    expect(addFavor(ledger, ['a|PG'], 0)).toBe(ledger);
    const next = addFavor(ledger, ['a|PG', 'b|SG'], 2);
    expect(next).not.toBe(ledger);
    expect(next).toEqual({ 'a|PG': 5, 'b|SG': 2 });
    expect(ledger).toEqual({ 'a|PG': 3 });
  });

  it('defines a per-copy value for every class', () => {
    for (const cls of CLASS_ORDER) expect(FAVOR_PER_COPY[cls]).toBeGreaterThanOrEqual(0);
  });
});
