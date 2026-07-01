import { useEffect, useRef, useState } from 'react';
import { DUR } from './timings';
import { useFeelSettings } from './FeelSettingsContext';

/**
 * Tweens a displayed integer toward its target ("numbers go up"). Runs on the JS
 * thread with requestAnimationFrame and rounds to whole numbers, which both
 * suits rendering text and gives the stepped 8-bit feel. Snaps instantly when
 * reduced motion is on. Returns the value to render. Pass `from` to anchor the
 * FIRST render below the target, so a freshly mounted tally visibly climbs.
 */
export function useCountUp(
  target: number,
  opts?: { durationPerUnit?: number; from?: number }
): number {
  const [display, setDisplay] = useState(opts?.from ?? target);
  const displayRef = useRef(opts?.from ?? target);
  const rafRef = useRef<number | null>(null);
  const { reducedMotion } = useFeelSettings();
  const durationPerUnit = opts?.durationPerUnit ?? 40;

  useEffect(() => {
    const set = (value: number) => {
      displayRef.current = value;
      setDisplay(value);
    };

    const from = displayRef.current;
    if (reducedMotion || from === target) {
      set(target);
      return;
    }

    const delta = Math.abs(target - from);
    const duration = Math.min(600, Math.max(DUR.count, delta * durationPerUnit));
    let startTs: number | null = null;

    const tick = (ts: number) => {
      if (startTs === null) startTs = ts;
      const t = Math.min(1, (ts - startTs) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      set(Math.round(from + (target - from) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, reducedMotion, durationPerUnit]);

  return display;
}
