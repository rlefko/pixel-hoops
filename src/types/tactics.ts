import type { SignatureTemplateId } from '@/game/signature';

/**
 * The game plan carries the sim's tactical inputs. Pace and focus are derived
 * automatically from roster shape (planForRoster) and the equipped coach
 * (planForCoach); the star index is coach-driven. The one player-authored entry
 * is the per-game SHOWCASE call (see src/game/showcase.ts): a deliberate bend
 * toward a chase legend's signature moment, at an honest cost. These inputs bias
 * the sim's pace and action selection (see src/game/simulation.ts).
 */

/** More pace means more possessions and more variance. */
export type Pace = 'slow' | 'balanced' | 'fast';

/** Where the offense leans, or whether to prioritize defense. */
export type Focus = 'inside' | 'outside' | 'balanced' | 'lockdown';

/**
 * The pregame SHOWCASE call: bend the game plan toward one player's signature
 * moment. Keyed by NAME (not slot) so the bend follows the player through
 * substitutions, and gated on-court: benefit and cost both switch off while the
 * showcased player sits. Only ever set on the player's team by the pregame
 * toggle; opponents and every default path leave it absent, which must resolve
 * byte-identically to a plan without the field.
 */
export interface ShowcasePlan {
  playerName: string;
  templateId: SignatureTemplateId;
}

export interface GamePlan {
  pace: Pace;
  focus: Focus;
  /** Starter index (0..4) to feed extra usage, or null for an even share. */
  starPlayerIndex: number | null;
  /** The armed SHOWCASE call, if any (absent = none, the no-op default). */
  showcase?: ShowcasePlan;
}

export const DEFAULT_GAME_PLAN: GamePlan = {
  pace: 'balanced',
  focus: 'balanced',
  starPlayerIndex: null,
};
