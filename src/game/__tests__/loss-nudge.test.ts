import { describe, it, expect } from 'vitest';
import {
  LOSS_NUDGE_LINES,
  classifyRotationShape,
  lossNudgeLine,
  type LineupShape,
} from '@/game/loss-nudge';
import { LOSS_NUDGE_STREAK, emptyTeach, type TeachLedger } from '@/game/teach';
import {
  DIFFICULTIES,
  LADDER_CLASSES,
  cellKey,
  type Difficulty,
  type LadderClass,
} from '@/game/difficulty-mode';
import { nameKey, type Position } from '@/types/roster';

/** A slot-ordered rotation of playerKeys, one per given position. */
function rot(...positions: Position[]): string[] {
  return positions.map((pos, i) => nameKey(`Player ${i}`, pos));
}

/** A full rosterMemory with every difficulty present (matching HomeRoster's
 * shape) and the given cells filled in. */
function memory(
  cells: Partial<Record<Difficulty, Partial<Record<LadderClass, string[]>>>> = {}
): Record<Difficulty, Partial<Record<LadderClass, string[]>>> {
  const base = {} as Record<Difficulty, Partial<Record<LadderClass, string[]>>>;
  for (const d of DIFFICULTIES) base[d] = {};
  return { ...base, ...cells };
}

/** A ledger with a live loss streak at (difficulty, class). */
function streaking(
  difficulty: Difficulty,
  ladderClass: LadderClass,
  count = LOSS_NUDGE_STREAK
): TeachLedger {
  return { ...emptyTeach(), lossStreak: { cell: cellKey(difficulty, ladderClass), count } };
}

describe('classifyRotationShape', () => {
  it('reads three at one exact position as stacked, beating the guard-heavy read', () => {
    // 3 PG + 1 SG is also four guards; the sharper one-position signal wins.
    expect(classifyRotationShape(rot('PG', 'PG', 'PG', 'SG', 'C'))).toBe('stacked');
  });

  it('reads three guards across PG and SG as guard-heavy', () => {
    expect(classifyRotationShape(rot('PG', 'PG', 'SG', 'SF', 'C'))).toBe('guardHeavy');
  });

  it('reads three bigs across PF and C as big-heavy', () => {
    expect(classifyRotationShape(rot('PG', 'SF', 'PF', 'PF', 'C'))).toBe('bigHeavy');
  });

  it('reads one of each position as balanced', () => {
    expect(classifyRotationShape(rot('PG', 'SG', 'SF', 'PF', 'C'))).toBe('balanced');
  });

  it('only the first five keys shape the read; the bench never does', () => {
    const withBench = [...rot('PG', 'SG', 'SF', 'PF', 'C'), ...rot('PG', 'PG', 'PG')];
    expect(classifyRotationShape(withBench)).toBe('balanced');
  });

  it('a doubled wing with no heavy lean falls through to default', () => {
    // Two SF: not stacked, not guard- or big-heavy, not five distinct.
    expect(classifyRotationShape(rot('PG', 'SG', 'SF', 'SF', 'PF'))).toBe('default');
  });

  it('an unreadable key drops the count below five and forces default', () => {
    const rotation = ['garbage-no-separator', ...rot('PG', 'PG', 'PG', 'SG')];
    expect(classifyRotationShape(rotation)).toBe('default');
    // A separator with a bogus position segment is just as unreadable.
    expect(classifyRotationShape(['Someone|XX', ...rot('PG', 'PG', 'PG', 'SG')])).toBe('default');
  });

  it('a short rotation cannot field a five and reads default', () => {
    expect(classifyRotationShape(rot('PG', 'PG', 'PG'))).toBe('default');
    expect(classifyRotationShape([])).toBe('default');
  });
});

describe('lossNudgeLine gating', () => {
  const guardFive = rot('PG', 'PG', 'SG', 'SF', 'C');

  it('stays silent under the streak threshold', () => {
    const teach = streaking('easy', 'C', LOSS_NUDGE_STREAK - 1);
    expect(lossNudgeLine(teach, memory({ easy: { C: guardFive } }), 'easy', 'C')).toBeNull();
  });

  it('stays silent when the streak lives on another cell', () => {
    const teach = streaking('easy', 'C');
    const mem = memory({ easy: { C: guardFive } });
    expect(lossNudgeLine(teach, mem, 'medium', 'C')).toBeNull();
    expect(lossNudgeLine(teach, mem, 'easy', 'B')).toBeNull();
  });

  it('stays silent for a missing ledger (a veteran save is graduated)', () => {
    expect(lossNudgeLine(undefined, memory({ easy: { C: guardFive } }), 'easy', 'C')).toBeNull();
  });

  it('speaks at exactly the threshold with the remembered rotation shape', () => {
    const teach = streaking('easy', 'C');
    const line = lossNudgeLine(teach, memory({ easy: { C: guardFive } }), 'easy', 'C');
    expect(line).toBe(LOSS_NUDGE_LINES.guardHeavy);
  });
});

describe('lossNudgeLine rotation source', () => {
  it('walks down to the nearest lower ladder class, matching the draft pre-fill', () => {
    const teach = streaking('easy', 'B');
    const mem = memory({ easy: { C: rot('PG', 'SF', 'PF', 'PF', 'C') } });
    expect(lossNudgeLine(teach, mem, 'easy', 'B')).toBe(LOSS_NUDGE_LINES.bigHeavy);
  });

  it('skips a remembered cell that cannot field a five and keeps walking down', () => {
    const teach = streaking('easy', 'B');
    const mem = memory({
      easy: { B: rot('PG', 'SG'), C: rot('PG', 'PG', 'SG', 'SF', 'C') },
    });
    expect(lossNudgeLine(teach, mem, 'easy', 'B')).toBe(LOSS_NUDGE_LINES.guardHeavy);
  });

  it('never reads across difficulties; a foreign rotation leaves the default line', () => {
    const teach = streaking('easy', 'B');
    const mem = memory({ medium: { C: rot('PG', 'SG', 'SF', 'PF', 'C') } });
    expect(lossNudgeLine(teach, mem, 'easy', 'B')).toBe(LOSS_NUDGE_LINES.default);
  });

  it('still speaks with no memory at all: the streak is real, the shape is not', () => {
    const teach = streaking('hard', 'A');
    expect(lossNudgeLine(teach, memory(), 'hard', 'A')).toBe(LOSS_NUDGE_LINES.default);
  });
});

describe('coach copy table', () => {
  it('covers every shape with a non-empty line and no em dash', () => {
    const shapes: LineupShape[] = ['guardHeavy', 'bigHeavy', 'stacked', 'balanced', 'default'];
    expect(Object.keys(LOSS_NUDGE_LINES).sort()).toEqual([...shapes].sort());
    for (const shape of shapes) {
      const line = LOSS_NUDGE_LINES[shape];
      expect(line.length, shape).toBeGreaterThan(0);
      expect(line, shape).not.toMatch(/—/);
    }
  });

  it('exercises the down-ladder walk from the top rung without crossing rungs above', () => {
    // Streak at the top of the ladder, memory only at the bottom: the walk
    // spans the full LADDER_CLASSES range.
    const top = LADDER_CLASSES[LADDER_CLASSES.length - 1];
    const teach = streaking('easy', top);
    const mem = memory({ easy: { C: rot('PG', 'SG', 'SF', 'PF', 'C') } });
    expect(lossNudgeLine(teach, mem, 'easy', top)).toBe(LOSS_NUDGE_LINES.balanced);
  });
});
