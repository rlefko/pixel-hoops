import { describe, expect, it } from 'vitest';
import {
  TRANSITION_DWELL_WARN_MS,
  formatSlowTransition,
  type TransitionMarks,
} from '@/navigation/transition-timing';

/** Marks for a wipe whose commit+paint window is `commitPaint` ms, hold `hold` ms. */
function marks(commitPaint: number, hold = 0): TransitionMarks {
  const coverStart = 1000;
  const covered = coverStart + 180;
  const actionDone = covered + 2;
  const held = actionDone + hold;
  const painted = held + commitPaint;
  return { coverStart, covered, actionDone, held, painted, revealed: painted + 180 };
}

describe('formatSlowTransition', () => {
  it('stays silent when commit+paint is under the budget', () => {
    expect(formatSlowTransition('/locker', marks(TRANSITION_DWELL_WARN_MS - 1))).toBeNull();
  });

  it('warns with every segment when commit+paint overruns', () => {
    const msg = formatSlowTransition('/locker', marks(150));
    expect(msg).toBe(
      '[nav] slow transition /locker: commit+paint 150.0ms ' +
        '(cover 180.0ms, action 2.0ms, reveal 180.0ms, total 512.0ms)'
    );
  });

  it('reports a ceremony hold separately instead of blaming commit+paint', () => {
    // A 900ms deliberate hold with a fast commit stays silent...
    expect(formatSlowTransition('ceremony:CHAMPIONSHIP', marks(30, 900))).toBeNull();
    // ...and when the commit is genuinely slow, the hold reads as its own segment.
    const msg = formatSlowTransition('ceremony:CHAMPIONSHIP', marks(120, 900));
    expect(msg).toContain('commit+paint 120.0ms');
    expect(msg).toContain('hold 900.0ms');
  });
});
