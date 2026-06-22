/**
 * The pre-game "game plan" is where player agency lives in the auto-sim model:
 * instead of playing a card every possession, you set how the team plays, then
 * watch the simulation resolve it. These inputs bias the sim's pace and action
 * selection (see src/game/simulation.ts).
 */

/** More pace means more possessions and more variance. */
export type Pace = 'slow' | 'balanced' | 'fast';

/** Where the offense leans, or whether to prioritize defense. */
export type Focus = 'inside' | 'outside' | 'balanced' | 'lockdown';

export interface GamePlan {
  pace: Pace;
  focus: Focus;
  /** Starter index (0..4) to feed extra usage, or null for an even share. */
  starPlayerIndex: number | null;
}

export const DEFAULT_GAME_PLAN: GamePlan = {
  pace: 'balanced',
  focus: 'balanced',
  starPlayerIndex: null,
};
