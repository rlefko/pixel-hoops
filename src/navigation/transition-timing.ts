/**
 * Dev-only transition instrumentation, the navigation counterpart of
 * src/game/dev-timing.ts. The arcade wipe holds its cover through the double-rAF
 * afterCommit window, so any JS work in the destination's mount extends the
 * covered dwell 1:1 past the designed hold; this formatter makes that dwell
 * visible in the dev console. Pure and clock-free so it unit-tests under
 * vitest's node environment; TransitionProvider stamps the marks and warns.
 */

/**
 * Warn when commit+paint (action dispatched -> destination painted) eats this
 * long. The designed window is the double-rAF (~2 frames, ~33ms); 100ms means
 * the destination's mount ate four-plus extra frames of covered dwell.
 */
export const TRANSITION_DWELL_WARN_MS = 100;

/**
 * performance.now() stamps for one full wipe. `held` is when the ceremony's
 * settlement hold resolved; transitions without a hold stamp it equal to
 * `actionDone`, so the hold segment reads 0 and a deliberate ceremony hold is
 * never misreported as slow commit+paint.
 */
export interface TransitionMarks {
  coverStart: number;
  covered: number;
  actionDone: number;
  held: number;
  painted: number;
  revealed: number;
}

/** Null under budget; otherwise the one-line `[nav] slow transition` warning. */
export function formatSlowTransition(label: string, m: TransitionMarks): string | null {
  const commitPaint = m.painted - m.held;
  if (commitPaint < TRANSITION_DWELL_WARN_MS) return null;
  const cover = m.covered - m.coverStart;
  const action = m.actionDone - m.covered;
  const hold = m.held - m.actionDone;
  const reveal = m.revealed - m.painted;
  const total = m.revealed - m.coverStart;
  const holdNote = hold > 0 ? `, hold ${hold.toFixed(1)}ms` : '';
  return (
    `[nav] slow transition ${label}: commit+paint ${commitPaint.toFixed(1)}ms ` +
    `(cover ${cover.toFixed(1)}ms, action ${action.toFixed(1)}ms${holdNote}, ` +
    `reveal ${reveal.toFixed(1)}ms, total ${total.toFixed(1)}ms)`
  );
}
