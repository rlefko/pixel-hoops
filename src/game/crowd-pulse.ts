import { isMadeShot, type SimEvent } from '@/types/sim';
import type { MomentumInfo } from './momentum';

/**
 * Plans the watch's crowd beats — the edge pulses and the apron crowd's big
 * reactions — once per timeline, in the mold of `computeMomentum` and
 * `computeHotState` (pure, deterministic, presentation only). Precomputing the
 * plan is what enforces the per-game budget: the juice callbacks just look up
 * their seq instead of deciding ad hoc, so a wild game can never strobe.
 *
 * Honesty rule, baked in here so tests pin it: the crowd is the PLAYER's crowd.
 * Big and peak beats fire only for home-team plays; an opponent walk-off gets
 * silence (the existing neutral shake/flash still land — the crowd's quiet is
 * the read of a loss). Quarter breaks and crunch lead changes stay neutral:
 * they announce game state, not a play.
 */

export type CrowdPulseTier = 'small' | 'big' | 'peak';
export type CrowdPulseKind = 'winner' | 'bigPlay' | 'leadChange' | 'quarterBreak';

export interface CrowdPulsePlan {
  tier: CrowdPulseTier;
  kind: CrowdPulseKind;
}

/** Hard cap on crowd beats per game: 1 peak + 3 quarter breaks + 4 big plays. */
export const CROWD_PULSE_BUDGET = 8;

export function computeCrowdPulses(
  events: SimEvent[],
  momentum: Map<number, MomentumInfo>
): Map<number, CrowdPulsePlan> {
  const plan = new Map<number, CrowdPulsePlan>();

  // The peak: the home side's walk-off (the sim's buzzer-beater or the derived
  // clincher — mutually exclusive, and only ever the final event, so at most
  // one per game).
  for (const e of events) {
    const m = momentum.get(e.seq);
    if (e.team === 'home' && (e.callout === 'BUZZER BEATER!' || m?.clincher)) {
      plan.set(e.seq, { tier: 'peak', kind: 'winner' });
    }
  }

  // Quarter chapter beats: the first event of each new quarter (three per game).
  for (let i = 1; i < events.length; i++) {
    const e = events[i];
    if (e.quarter > events[i - 1].quarter && !plan.has(e.seq)) {
      plan.set(e.seq, { tier: 'small', kind: 'quarterBreak' });
    }
  }

  // Big plays: the first home dunk / and-one / clutch three of each quarter, so
  // the crowd answers the loudest play of each act without turning every basket
  // into a roar. A candidate that already owns a beat keeps the bigger tier.
  const bigQuarters = new Set<number>();
  for (const e of events) {
    if (bigQuarters.has(e.quarter)) continue;
    if (e.team !== 'home' || !isMadeShot(e)) continue;
    const big =
      e.action === 'dunk' ||
      e.result === 'and-one' ||
      (e.action === 'three' && e.isBigPlay);
    if (!big) continue;
    bigQuarters.add(e.quarter);
    const existing = plan.get(e.seq);
    if (existing == null || existing.tier === 'small') {
      plan.set(e.seq, { tier: 'big', kind: 'bigPlay' });
    }
  }

  // Crunch-time lead changes fill whatever budget is left (blowouts leave none
  // to fill and quiet games stay quiet — the budget is a cap, not a quota).
  for (const e of events) {
    if (plan.size >= CROWD_PULSE_BUDGET) break;
    const m = momentum.get(e.seq);
    if (m?.leadChange && m.crunch && !plan.has(e.seq)) {
      plan.set(e.seq, { tier: 'small', kind: 'leadChange' });
    }
  }

  return plan;
}
