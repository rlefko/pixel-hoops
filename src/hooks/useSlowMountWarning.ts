import { useEffect, useRef } from 'react';

/**
 * The covered-dwell budget a pushed hub screen's mount may add. Mount work
 * extends the wipe's full-cover dwell 1:1 on top of the designed double-rAF +
 * 80ms label hold (nothing is absorbed), so "one hold's worth" of extra dwell
 * is the most a mount may cost before the transition reads as a stall. Dev
 * numbers run 10-50x release; treat warnings as a ranking, not an absolute.
 */
export const SLOW_MOUNT_MS = 80;

/**
 * Dev-only first-mount cost attribution, the per-screen counterpart of the
 * transition tracer in src/navigation/transition-timing.ts: the tracer says a
 * dwell was slow, this says which screen's mount ate it. Measures first render
 * start to the first passive effect (the closest cheap proxy for mount cost
 * without a Profiler) and warns once. A complete no-op in release.
 */
export function useSlowMountWarning(name: string, budgetMs: number = SLOW_MOUNT_MS): void {
  const startRef = useRef(__DEV__ ? performance.now() : 0);
  useEffect(() => {
    if (!__DEV__ || startRef.current === 0) return;
    const ms = performance.now() - startRef.current;
    startRef.current = 0; // report once
    if (ms >= budgetMs) {
      console.warn(`[nav] slow mount ${name}: ${ms.toFixed(1)}ms (budget ${budgetMs}ms)`);
    }
    // One-shot mount measurement: name/budget are fixed at the call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
