import type { QuarterResult } from './game-state';
import type { Position } from './roster';

/**
 * The auto-sim contract. `simulateGame` (src/game/simulation.ts) plays a full
 * game possession-by-possession and returns an ordered list of {@link SimEvent}s
 * the UI replays quickly with juice (count-up scores, screen shake, callouts).
 *
 * Separating simulation (instant, pure, deterministic) from presentation (timed,
 * juicy) is what makes the new loop both snappy and skippable.
 */

/** The kind of play a possession produced. */
export type SimActionId =
  | 'three'
  | 'midrange'
  | 'drive'
  | 'dunk'
  | 'layup'
  | 'steal'
  | 'block'
  | 'rebound';

/** The five offensive actions a possession can choose (a shot is always taken). */
export type OffActionId = 'three' | 'midrange' | 'drive' | 'layup' | 'dunk';

/** home = the player's team, away = the opponent. */
export type SimTeamSide = 'home' | 'away';

/**
 * One atomic moment in the game: enough to drive play-by-play + score + juice.
 * `action` is the attempt (what was tried); `result` is the outcome (what
 * happened). The simulation is responsible for keeping the two consistent.
 */
export interface SimEvent {
  /** Monotonic index for stable replay ordering and React keys. */
  seq: number;
  /** Cosmetic game clock, e.g. "Q2 6:24" (derived from possession count). */
  clock: string;
  /** Quarter 1..4. */
  quarter: number;
  /** Which side the possession belonged to. */
  team: SimTeamSide;
  /** Attributed player name for the play-by-play line. */
  scorerName: string;
  /** Attributed player position. */
  scorerPosition: Position;
  /** The action attempted. */
  action: SimActionId;
  /** Outcome label (reuses the existing card-game result union). */
  result: QuarterResult;
  /** Points scored on this possession (0..3). */
  points: number;
  /** Running home score AFTER this event. */
  homeScore: number;
  /** Running away score AFTER this event. */
  awayScore: number;
  /** Success rate used for this possession (0..100), for the rate flash. */
  successRate: number;
  /** Big plays (dunks, threes, clutch buckets, steals) get shake + flash + haptic. */
  isBigPlay: boolean;
  /** Optional arcade callout overlay, e.g. "SWISH!", "REJECTED!", "AND-ONE!". */
  callout?: string;
  /** Full play-by-play line, e.g. "Jonez drains a three!". */
  text: string;
}

export interface SimResult {
  events: SimEvent[];
  finalHome: number;
  finalAway: number;
  winner: SimTeamSide;
  /** Echoed seed, so a result can be re-simulated identically. */
  seed: number | string;
}

/** A made basket (points scored): a successful shot or an and-one. */
export function isMadeShot(e: SimEvent): boolean {
  return e.result === 'score' || e.result === 'and-one';
}
