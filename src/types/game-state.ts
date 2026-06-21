import type { Player } from './player';
import type { CardId, GameCard } from './card';

// --- Constants ---

/** Total number of quarters in a basketball game. */
export const TOTAL_Quarters = 4;

/** Maximum energy pool available at the start of each game. */
export const MAX_ENERGY = 10;

/** Energy regenerated per quarter (when drawing a new card). */
export const ENERGY_PER_QUARTER = 2;

/** Cards drawn into the opening hand at tournament start. */
export const HAND_SIZE = 4;

/** Points awarded when And-One carries momentum into next quarter. */
export const AND_ONE_POINTS = 1;

// --- Outcome types ---

/** The visual result of a resolved quarter interaction. */
export type QuarterResult =
  | 'score'         // Successful offensive play → points scored
  | 'miss'          // Offensive play failed → no points
  | 'steal'         // Defensive steal (flips possession momentum)
  | 'turnover'      // Turnover → opponent loses the ball without scoring
  | 'block'         // Shot blocked → no points, crowd goes wild
  | 'and-one';      // Successful play carries momentum to next quarter

// --- Quarter resolution record ---

export interface QuarterOutcome {
  /** The offensive card played by the player. */
  yourCard: CardId;
  /** The defensive card played by the opponent AI. */
  opponentCard: CardId;
  /** Calculated success rate before RNG roll (0–100). */
  successRate: number;
  /** Whether the RNG roll succeeded against the success rate. */
  succeeded: boolean;
  /** Visual outcome type shown to the player. */
  result: QuarterResult;
  /** Points added to the player's score this quarter. */
  pointsAwarded: number;
  /** Points awarded to the opponent this quarter (from a defensive miscue). */
  opponentPoints: number;
}

// --- Full game state ---

export interface GameState {
  /** The player's roster athlete. */
  player: Player;
  /** The current tournament opponent. */
  opponent: Player;
  /** Remaining cards in the draw pile (after hand was dealt). */
  deck: GameCard[];
  /** Cards currently visible to the player (up to HAND_SIZE). */
  hand: GameCard[];
  /** Current energy pool available for power plays. */
  energy: number;
  /** Current quarter being played (1-based: 1–4). */
  currentQuarter: number;
  /** The player's cumulative score. */
  yourScore: number;
  /** The opponent's cumulative score. */
  opponentScore: number;
  /** Whether the game is actively being played (not started or finished). */
  isPlaying: boolean;
  /** Whether the final result overlay should be shown. */
  gameOver: boolean;
  /** Ordered history of all quarter resolutions so far. */
  outcomes: QuarterOutcome[];
  /** The player's selected card ready to play (null until tapped). */
  selectedCardUuid: string | null;
  /** Whether a resolution animation is currently displaying (blocking input). */
  resolving: boolean;
}

// --- Result types ---

/** Whether the player won or lost the tournament game. */
export type TournamentResult = 'victory' | 'defeat';

/** Data shown on the post-game summary screen. */
export interface GameResult {
  result: TournamentResult;
  /** [player score, opponent score] after 4 quarters. */
  finalScore: [number, number];
  /** Full quarter-by-quarter outcome history. */
  outcomes: QuarterOutcome[];
  /** Opponent recruited to the roster if they were defeated (permadeath roguelike). */
  recruitedOpponent?: Player;
}
