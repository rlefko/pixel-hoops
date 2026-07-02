import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useHomeRoster } from '@/context/HomeRosterContext';
import { hubDeltas, stampHubSeen } from '@/game/home-roster';
import { haptics } from '@/feel';

/**
 * The hub's "since you left" beat. On each focus it captures the earned deltas
 * (coins/crests/copies vs the hubSeen ledger) exactly once, acknowledges the
 * coins (the hub is the surface that shows them; crests and copies clear when
 * their own screens are viewed), and runs the reveal timer: the hub lands fully
 * static and tappable, then ~250ms later the chips cascade in and the pill
 * climbs. One `haptics.light()` per reveal with any delta — the beat's only
 * haptic (the pill's small-tier TickCounter adds no haptic of its own).
 *
 * HomeScreen stays mounted under pushed screens (freezeOnBlur), so everything
 * keys on FOCUS, not mount; the blur cleanup re-arms the next return.
 */

const HOLD_MS = 250;

const NO_DELTAS = { coins: 0, crests: 0, copies: 0 };

export function useHubDeltas(): {
  deltas: { coins: number; crests: number; copies: number };
  /** What the coin pill should display before the reveal beat (the old balance). */
  baselineCoins: number;
  /** Flips true HOLD_MS after focus: chips cascade and the pill starts climbing. */
  revealed: boolean;
} {
  const { homeRoster, loaded, saveHomeRoster } = useHomeRoster();
  const [deltas, setDeltas] = useState(NO_DELTAS);
  const [baseline, setBaseline] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);

  // Latest values behind refs so the focus callback stays identity-stable: the
  // effect then runs only on true focus/blur, never on the stamp's own re-render.
  const homeRef = useRef(homeRoster);
  homeRef.current = homeRoster;
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  const saveRef = useRef(saveHomeRoster);
  saveRef.current = saveHomeRoster;

  const capturedRef = useRef(false);
  const focusedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const maybeCapture = useCallback(() => {
    if (capturedRef.current || !focusedRef.current) return;
    const home = homeRef.current;
    if (!loadedRef.current || !home) return;
    capturedRef.current = true;
    const d = hubDeltas(home);
    setDeltas(d);
    setBaseline(home.coins - d.coins);
    // Acknowledge the coins now (same-reference guard makes a quiet return a
    // no-op); the write goes through the debounced writer, never a tap path.
    const stamped = stampHubSeen(home, { coins: home.coins });
    if (stamped !== home) saveRef.current(stamped);
    timerRef.current = setTimeout(() => {
      setRevealed(true);
      if (d.coins > 0 || d.crests > 0 || d.copies > 0) haptics.light();
    }, HOLD_MS);
  }, []);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      maybeCapture();
      return () => {
        focusedRef.current = false;
        capturedRef.current = false;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        setRevealed(false);
        setDeltas(NO_DELTAS);
        setBaseline(null);
      };
    }, [maybeCapture])
  );

  // Cold start: the first focus can fire before the roster hydrates; capture the
  // moment it lands.
  useEffect(() => {
    if (loaded) maybeCapture();
  }, [loaded, maybeCapture]);

  // Before the capture commits, derive the old balance straight from the (still
  // unstamped) ledger, so the pill never flashes the new total for a frame.
  const pendingCoins = useMemo(
    () => (homeRoster ? hubDeltas(homeRoster).coins : 0),
    [homeRoster]
  );
  const baselineCoins = baseline ?? (homeRoster ? homeRoster.coins - pendingCoins : 0);

  return { deltas, baselineCoins, revealed };
}
