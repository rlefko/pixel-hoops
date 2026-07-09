import { useMemo, useRef, useState } from 'react';
import { useHomeRoster } from '@/context/HomeRosterContext';
import { hubDeltas, stampHubSeen } from '@/game/home-roster';
import { useFocusCapture } from '@/hooks/useFocusCapture';
import { haptics } from '@/feel';

/**
 * The hub's "since you left" beat (capture-once-per-focus via
 * useFocusCapture). On each focus it captures the earned deltas
 * (coins/crests/copies vs the hubSeen ledger) exactly once, acknowledges the
 * coins (the hub is the surface that shows them; crests and copies clear when
 * their own screens are viewed), and runs the reveal timer: the hub lands fully
 * static and tappable, then ~250ms later the chips cascade in and the pill
 * climbs. One `haptics.light()` per reveal with any delta — the beat's only
 * haptic (the pill's small-tier TickCounter adds no haptic of its own).
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
  const { homeRoster, hubSeenVersion } = useHomeRoster();

  // Stable ref so the useMemo only depends on hubSeenVersion (not the volatile
  // homeRoster reference that changes on every saveHomeRoster).
  const homeRosterRef = useRef(homeRoster);
  homeRosterRef.current = homeRoster;
  const [deltas, setDeltas] = useState(NO_DELTAS);
  const [baseline, setBaseline] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);

  useFocusCapture(
    ({ home, save }) => {
      const d = hubDeltas(home);
      setDeltas(d);
      setBaseline(home.coins - d.coins);
      // Acknowledge the coins now (same-reference guard makes a quiet return a
      // no-op); the write goes through the debounced writer, never a tap path.
      const stamped = stampHubSeen(home, { coins: home.coins });
      if (stamped !== home) save(stamped);
      const timer = setTimeout(() => {
        setRevealed(true);
        if (d.coins > 0 || d.crests > 0 || d.copies > 0) haptics.light();
      }, HOLD_MS);
      return () => clearTimeout(timer);
    },
    () => {
      setRevealed(false);
      setDeltas(NO_DELTAS);
      setBaseline(null);
    }
  );

  // Before the capture commits, derive the old balance straight from the (still
  // unstamped) ledger, so the pill never flashes the new total for a frame.
  // Only recompute when hubSeen changes — the ref gives us the latest roster
  // without making the memo depend on the volatile homeRoster reference.
  const pendingCoins = useMemo(
    () => (homeRosterRef.current ? hubDeltas(homeRosterRef.current).coins : 0),
    [hubSeenVersion]
  );
  const baselineCoins = baseline ?? (homeRoster ? homeRoster.coins - pendingCoins : 0);

  return { deltas, baselineCoins, revealed };
}
