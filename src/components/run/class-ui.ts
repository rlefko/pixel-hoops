import { palette } from '@/theme';
import type { PlayerClass } from '@/game/ratings';

/** Class -> badge color, matching PlayerCard's tier palette so power reads at a glance. */
export const CLASS_COLOR: Record<PlayerClass, string> = {
  D: palette.inkDim,
  C: palette.steelBlue,
  B: palette.makeGreen,
  A: palette.gold,
  S: palette.flame,
  'S+': palette.orange,
  'S++': palette.gold,
};

/** Draft cost (0/1/2) -> badge color: free / at-class / premium. */
export const DRAFT_COST_COLOR: Record<number, string> = {
  0: palette.steelBlue,
  1: palette.gold,
  2: palette.orange,
};
