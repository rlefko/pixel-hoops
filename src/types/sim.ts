import type { Position } from './roster';

/**
 * The auto-sim contract. `simulateGame` (src/game/simulation.ts) plays a full
 * game possession-by-possession and returns an ordered list of {@link SimEvent}s
 * the UI replays quickly with juice (count-up scores, screen shake, callouts).
 *
 * Separating simulation (instant, pure, deterministic) from presentation (timed,
 * juicy) is what makes the new loop both snappy and skippable.
 */

/** Total number of quarters in a basketball game. */
export const TOTAL_QUARTERS = 4;

/** The visual result of a resolved possession. */
export type QuarterResult =
  | 'score'         // Successful offensive play → points scored
  | 'miss'          // Offensive play failed → no points
  | 'steal'         // Defensive steal (flips possession momentum)
  | 'turnover'      // Turnover → offense loses the ball without scoring
  | 'block'         // Shot blocked → no points, crowd goes wild
  | 'and-one';      // Successful play plus the foul, carries momentum

/** The kind of play a possession produced. */
export type SimActionId =
  | 'three'
  | 'midrange'
  | 'drive'
  | 'dunk'
  | 'layup'
  | 'post'
  | 'steal'
  | 'block'
  | 'rebound';

/** The six offensive actions a possession can choose (a shot is always taken).
 * `post` is the back-to-the-basket interior attempt that lets post scorers and
 * bully-ball read as a distinct identity from rim-running and jump shooting. */
export type OffActionId = 'three' | 'midrange' | 'drive' | 'layup' | 'dunk' | 'post';

/** home = the player's team, away = the opponent. */
export type SimTeamSide = 'home' | 'away';

/** The five on the floor for one side at an instant: court slot -> player name. */
export type OnCourtFive = Record<Position, string>;

/** Both sides' on-court fives at an event, so the watch renders the right sprites. */
export interface OnCourtSnapshot {
  home: OnCourtFive;
  away: OnCourtFive;
}

/** A substitution: who left and entered a given court slot (drives the watch). */
export interface SimSub {
  team: SimTeamSide;
  slot: Position;
  outName: string;
  inName: string;
}

/** One player's accumulated line for the post-game box score. */
export interface BoxLine {
  name: string;
  /** Court slot the player last occupied. */
  slot: Position;
  starter: boolean;
  pts: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  /** Seconds played (minutes = seconds / 60). */
  seconds: number;
  /** Energy remaining at game end (0..100). */
  energy: number;
  /** Accumulated fatigue load, used by the run layer's injury roll. */
  load: number;
}

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
  /** Outcome label for this possession. */
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
  /** Both sides' on-court fives at this moment (the watch reads sprites here). */
  onCourt: OnCourtSnapshot;
  /** Substitutions that happened just before this possession (for the watch). */
  subs?: SimSub[];
}

export interface SimResult {
  events: SimEvent[];
  finalHome: number;
  finalAway: number;
  winner: SimTeamSide;
  /** Per-player box score for both sides (starters first, then bench). */
  box: { home: BoxLine[]; away: BoxLine[] };
  /** Echoed seed, so a result can be re-simulated identically. */
  seed: number | string;
}

/** A made basket (points scored): a successful shot or an and-one. */
export function isMadeShot(e: SimEvent): boolean {
  return e.result === 'score' || e.result === 'and-one';
}
