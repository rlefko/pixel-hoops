import { isMadeShot, type SimEvent } from '@/types/sim';
import type { Contest } from './types';

/**
 * Outcome interpretation: reads the recorded possession and derives the presentation
 * knobs that must stay faithful to the statistical result. Migrated verbatim from the
 * retired playTemplates.ts (no behavior change) so the "how guarded / was it a break"
 * reads exactly as before. Pure and Node-safe; never mutates the sim.
 */

/**
 * A live-ball turnover the other way runs a break; a defensive rebound runs one
 * about a third of the time; a made basket must be inbounded (half-court).
 */
export function deriveTransition(event: SimEvent, prev?: SimEvent): boolean {
  if (!prev) return false;
  const flipped = prev.team !== event.team;
  if (flipped && (prev.result === 'steal' || prev.result === 'turnover')) return true;
  if (flipped && (prev.result === 'miss' || prev.result === 'block')) return event.seq % 3 === 0;
  return false;
}

/** How guarded the shot reads (tunes only the defender's arrival, never the outcome). */
export function deriveContest(event: SimEvent): Contest {
  if (event.result === 'block') return 'contested';
  if (!isMadeShot(event) && event.isBigPlay) return 'contested';
  if (event.successRate <= 40) return 'contested';
  if (!!event.assist && isMadeShot(event)) return 'open';
  return event.successRate >= 60 ? 'open' : 'contested';
}
