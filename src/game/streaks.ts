import { isMadeShot, type SimEvent } from '@/types/sim';

/**
 * Derives an NBA-Jam-style hot hand from the event stream. Pure and
 * deterministic, computed once from the precomputed timeline (it does not change
 * outcomes, only presentation). A scorer's consecutive makes are tracked: at two
 * straight they are "heating up", at three-plus they are "on fire" until their
 * next miss. Returns per-event info keyed by `seq`: who is currently hot (for the
 * sprite aura) and whether this event just crossed a threshold (for the callout).
 */

export interface HotInfo {
  /** `${team}-${position}` keys of players currently on fire (3+ straight makes). */
  hotKeys: string[];
  /** `${team}-${position}` keys of players heating up (exactly 2 straight makes). */
  warmKeys: string[];
  /** This event's scorer just reached three straight: the ignite moment. */
  igniting: boolean;
  /** This event's scorer just reached two straight: heating up. */
  heating: boolean;
}

const HEATING = 2;
const ON_FIRE = 3;

export function computeHotState(events: SimEvent[]): Map<number, HotInfo> {
  const streak = new Map<string, number>(); // scorer name -> consecutive makes
  const keyOf = new Map<string, string>(); // scorer name -> `${team}-${position}`
  const hot = new Set<string>(); // scorer names currently on fire
  const warm = new Set<string>(); // scorer names heating up (exactly 2 straight)
  const out = new Map<number, HotInfo>();

  for (const e of events) {
    keyOf.set(e.scorerName, `${e.team}-${e.scorerPosition}`);
    let igniting = false;
    let heating = false;
    if (isMadeShot(e)) {
      const n = (streak.get(e.scorerName) ?? 0) + 1;
      streak.set(e.scorerName, n);
      heating = n === HEATING;
      igniting = n === ON_FIRE;
      if (n >= ON_FIRE) hot.add(e.scorerName);
      if (n === HEATING) warm.add(e.scorerName);
      else warm.delete(e.scorerName);
    } else {
      streak.set(e.scorerName, 0);
      hot.delete(e.scorerName);
      warm.delete(e.scorerName);
    }
    const keysFor = (names: Set<string>): string[] => {
      const keys: string[] = [];
      for (const name of names) {
        const k = keyOf.get(name);
        if (k) keys.push(k);
      }
      return keys;
    };
    out.set(e.seq, { hotKeys: keysFor(hot), warmKeys: keysFor(warm), igniting, heating });
  }

  return out;
}
