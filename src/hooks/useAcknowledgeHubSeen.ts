import { useEffect, useRef, useState } from 'react';
import { useHomeRoster } from '@/context/HomeRosterContext';
import { stampHubSeen, type HomeRoster, type HubSeen } from '@/game/home-roster';

/**
 * Acknowledge part of the hubSeen ledger on viewing the screen that owns it —
 * the delta-badge contract: clear on VIEW, never on badge tap. Waits for the
 * roster to hydrate (a cold-start deep link can mount these screens before the
 * save loads), stamps exactly once per mount, and returns the roster AS IT WAS
 * at acknowledgment time (pre-stamp), so a caller can read what was new (the
 * Hall of Fame's crest ceremony) without racing its own stamp. The
 * same-reference guard makes a nothing-changed stamp a no-op, and the write
 * goes through the debounced writer, never a tap path.
 */
export function useAcknowledgeHubSeen(
  makePatch: (home: HomeRoster) => Partial<HubSeen>
): HomeRoster | null {
  const { homeRoster, loaded, saveHomeRoster } = useHomeRoster();
  const [seenAt, setSeenAt] = useState<HomeRoster | null>(null);
  const makeRef = useRef(makePatch);
  makeRef.current = makePatch;
  const stampedRef = useRef(false);
  useEffect(() => {
    if (stampedRef.current || !loaded || !homeRoster) return;
    stampedRef.current = true;
    setSeenAt(homeRoster);
    const stamped = stampHubSeen(homeRoster, makeRef.current(homeRoster));
    if (stamped !== homeRoster) saveHomeRoster(stamped);
  }, [loaded, homeRoster, saveHomeRoster]);
  return seenAt;
}
