import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Tracks foreground inactivity. Returns `idle` (true once no `bump()` has fired for
 * `ms`) and the `bump` to call on user activity (wire it to a screen's `onTouchStart`).
 * Used to quiet idle attract loops when the player is just looking at a screen, so the
 * UI-thread breathe/glow loops stop draining battery; they resume on the next touch.
 *
 * `bump` is stable and only flips `idle` on a real transition, so rapid touches during
 * active use never spam re-renders. The timer is cleared on unmount.
 */
export function useIdle(ms: number): { idle: boolean; bump: () => void } {
  const [idle, setIdle] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bump = useCallback(() => {
    setIdle(false); // no-op re-render when already active (React bails on equal state)
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setIdle(true), ms);
  }, [ms]);

  useEffect(() => {
    bump(); // arm on mount
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [bump]);

  return { idle, bump };
}
