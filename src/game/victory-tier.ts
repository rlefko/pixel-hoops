import { palette } from '@/theme/palette';
import type { Difficulty, LadderClass } from './difficulty-mode';

/**
 * Maps a won run's (difficulty x ladder class) to a celebration tier, so the
 * victory screen, the Hall of Fame card, and the share text all scale together.
 * Per the addictive blueprint, the juice must scale with the reward and never be
 * a flat beat: a harder championship reads louder (bigger burst, more confetti,
 * a rarer stamp) than an easy one. The single source of truth for that scaling.
 */

export type VictoryTierKey = 'rookie' | 'pro' | 'elite' | 'legend';

export interface VictoryTier {
  key: VictoryTierKey;
  /** Short stamp label shown on the celebration screen and the Hall of Fame card. */
  label: string;
  /** A celebratory emoji for the stamp and the share text. */
  emoji: string;
  /** The palette color the celebration tints toward (border, confetti, stamp). */
  color: string;
  /** Reward-burst intensity passed to useRewardBurst.fire(). */
  burst: 'small' | 'medium' | 'big';
  /** Confetti particle count (ParticleBurst caps this at 24). */
  confetti: number;
  /** The top tier: the rarest treatment plus a sparkle share line. */
  legend: boolean;
}

// Lowest to highest. The chosen tier is the max of the difficulty and ladder ranks,
// so either a brutal difficulty or a high ladder class is enough to earn a louder win.
const TIERS: readonly VictoryTier[] = [
  { key: 'rookie', label: 'ROOKIE', emoji: '🥉', color: palette.orange, burst: 'small', confetti: 10, legend: false },
  { key: 'pro', label: 'PRO', emoji: '⭐', color: palette.steelBlue, burst: 'medium', confetti: 14, legend: false },
  { key: 'elite', label: 'ELITE', emoji: '🔥', color: palette.flame, burst: 'big', confetti: 18, legend: false },
  { key: 'legend', label: 'LEGEND', emoji: '✨', color: palette.gold, burst: 'big', confetti: 24, legend: true },
];

const DIFFICULTY_RANK: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2, insane: 3 };
const LADDER_RANK: Record<LadderClass, number> = { C: 0, B: 1, A: 2, S: 3, 'S+': 3 };

/** The celebration tier for a championship at (difficulty, ladderClass). */
export function victoryTier(difficulty: Difficulty, ladderClass: LadderClass): VictoryTier {
  return TIERS[Math.max(DIFFICULTY_RANK[difficulty], LADDER_RANK[ladderClass])];
}
