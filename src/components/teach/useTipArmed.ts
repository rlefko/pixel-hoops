import { useState } from 'react';
import { useHomeRoster } from '@/context/HomeRosterContext';
import { tipSeen, type TipId } from '@/game/teach';

/**
 * Whether a one-shot teach beat is still owed, captured ONCE at mount: the
 * beat stamps itself seen the moment it shows, and that stamp must never hide
 * the instance the player is currently reading (nor pop a host's swapped-in
 * fallback copy mid-view). A missing roster or ledger reads as seen, so a
 * veteran can never arm a beat.
 */
export function useTipArmed(tip: TipId): boolean {
  const { homeRoster } = useHomeRoster();
  const [armed] = useState(() => homeRoster != null && !tipSeen(homeRoster.teach, tip));
  return armed;
}
