import { useCallback, useEffect, useRef } from 'react';
import { sfx } from './audio';
import { useFeelSettings } from './FeelSettingsContext';
import type { Rarity } from '@/game/rarity';

/**
 * The anticipation half of a hidden reveal (a gacha pull, the legend flip): a
 * short hold with the windup sting before the payoff lands. The hold scales with
 * the STAKES of the pull (the machine's tier), because the wind-up is where the
 * dopamine lives; the payoff itself should still scale with the actual result.
 * Commons land instantly (never make a routine pull wait) and reduced motion
 * skips the hold entirely. Extracted from LegendRevealView so every reveal
 * shares one choreography.
 */

const HOLD_MS: Record<Rarity, number> = { common: 0, rare: 120, epic: 200, legendary: 280 };

export function useStagedReveal() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<(() => void) | null>(null);
  const { reducedMotion } = useFeelSettings();

  /** Land the pending reveal now (also the tap-to-skip path). Safe when idle. */
  const skip = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const fn = pending.current;
    pending.current = null;
    fn?.();
  }, []);

  useEffect(() => () => {
    // Unmounting drops the pending payoff (its screen is gone); just stop the timer.
    if (timer.current) clearTimeout(timer.current);
  }, []);

  /** Stage `onReveal` behind a stakes-scaled hold, with the windup sting. */
  const stage = useCallback(
    (stakes: Rarity, onReveal: () => void) => {
      skip(); // flush any in-flight reveal so rapid pulls never swallow one
      const hold = reducedMotion ? 0 : HOLD_MS[stakes];
      if (hold <= 0) {
        onReveal();
        return;
      }
      sfx.gachaWindup();
      pending.current = onReveal;
      timer.current = setTimeout(skip, hold);
    },
    [skip, reducedMotion]
  );

  return { stage, skip };
}
