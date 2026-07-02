/**
 * Dev-only reducer instrumentation. The run machine executes synchronously inside
 * React's dispatch, so a slow action blocks the tap that triggered it; this wrapper
 * makes any action that overruns a frame visible in the dev console (and costs
 * nothing in release, where the caller wires the bare reducer instead). Pure and
 * injectable so it unit-tests under vitest's node environment.
 */

/** One 60fps frame: a reducer action at or over this budget will drop frames. */
export const SLOW_ACTION_MS = 16;

export function withSlowActionWarning<S, A extends { type: string }>(
  reducer: (state: S, action: A) => S,
  now: () => number = () => performance.now(),
  warn: (message: string) => void = console.warn
): (state: S, action: A) => S {
  return (state, action) => {
    const start = now();
    const next = reducer(state, action);
    const ms = now() - start;
    if (ms >= SLOW_ACTION_MS) warn(`[run] slow action ${action.type}: ${ms.toFixed(1)}ms`);
    return next;
  };
}
