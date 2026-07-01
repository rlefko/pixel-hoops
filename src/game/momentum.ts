import { isMadeShot, TOTAL_QUARTERS, type SimEvent, type SimTeamSide } from '@/types/sim';

/**
 * Derives the game's momentum narrative from the event stream: scoring runs,
 * lead changes, crunch time, and the clincher. Pure and deterministic, computed
 * once from the precomputed timeline like `computeHotState` (src/game/streaks.ts);
 * it never changes outcomes, only what the watch chooses to celebrate. Returns
 * per-event info keyed by `seq`.
 */

export interface MomentumInfo {
  /** Unanswered points by `runTeam` up to and including this event. */
  runPts: number;
  /** Side currently on a scoring run (null before anyone scores). */
  runTeam: SimTeamSide | null;
  /** This event pushed the run across a banner threshold (6, 10, 14 unanswered). */
  runMilestone?: number;
  /** This event flipped which side leads (a new leader, not a tie). */
  leadChange: boolean;
  /** Score margin after this event (home - away). */
  margin: number;
  /** Crunch time: Q4, the game close, inside the final stretch of the clock. */
  crunch: boolean;
  /** The winning side's final bucket in a close finish (the game-sealing shot). */
  clincher: boolean;
}

/** Unanswered-point thresholds that earn a "RUN" banner (gated so rarity holds). */
const RUN_MILESTONES = [6, 10, 14];
/** Mirrors CLUTCH_MARGIN in simulation.ts so presentation and sim agree on "close". */
const CRUNCH_MARGIN = 6;
/** Crunch dressing waits for the final 4:00 of Q4 (quarters are 720s). */
const CRUNCH_CLOCK_S = 240;
/** A finishing bucket with the pre-shot margin this tight seals the game. */
const CLINCHER_MARGIN = 3;

/** Seconds left in the quarter from the cosmetic clock label, e.g. "Q4 3:12". */
function remainingSeconds(clock: string): number {
  const match = /(\d+):(\d{2})$/.exec(clock);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function computeMomentum(events: SimEvent[]): Map<number, MomentumInfo> {
  const out = new Map<number, MomentumInfo>();
  const last = events.at(-1);
  const finalMargin = last ? last.homeScore - last.awayScore : 0;
  const winner: SimTeamSide = finalMargin >= 0 ? 'home' : 'away';

  let runPts = 0;
  let runTeam: SimTeamSide | null = null;
  let leader: SimTeamSide | null = null;
  let preMargin = 0;

  for (const e of events) {
    // Scoring runs: unanswered points, ended only by the other side scoring.
    let runMilestone: number | undefined;
    if (e.points > 0) {
      const prevRun = runTeam === e.team ? runPts : 0;
      runTeam = e.team;
      runPts = prevRun + e.points;
      runMilestone = RUN_MILESTONES.find((t) => prevRun < t && runPts >= t);
    }

    // Lead changes: a new leader emerges (ties hold the previous leader).
    const margin = e.homeScore - e.awayScore;
    const side: SimTeamSide | null = margin > 0 ? 'home' : margin < 0 ? 'away' : null;
    const leadChange = side != null && leader != null && side !== leader;
    if (side != null) leader = side;

    const crunch =
      e.quarter === TOTAL_QUARTERS &&
      Math.abs(preMargin) <= CRUNCH_MARGIN &&
      remainingSeconds(e.clock) <= CRUNCH_CLOCK_S;

    // The clincher: the eventual winner's last bucket in a tight finish. The
    // sim's own BUZZER BEATER! callout owns the walk-off, so skip it here.
    const clincher =
      e === last &&
      isMadeShot(e) &&
      e.team === winner &&
      Math.abs(preMargin) <= CLINCHER_MARGIN &&
      e.callout !== 'BUZZER BEATER!';

    out.set(e.seq, { runPts, runTeam, runMilestone, leadChange, margin, crunch, clincher });
    preMargin = margin;
  }

  return out;
}
