import { palette } from '@/theme';
import { classForOvr, type PlayerClass } from '@/game/ratings';

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

/**
 * Color a stat/rating value by the class band it falls into. Stats share the OVR's
 * 6-30 scale, so the same ladder that grades a player grades each number: a weak
 * stat reads dim, an elite one glows, and the color always matches the tier badge.
 */
export function statColor(value: number): string {
  return CLASS_COLOR[classForOvr(value)];
}

/** Draft cost (0/1/2) -> badge color: free / at-class / premium. */
export const DRAFT_COST_COLOR: Record<number, string> = {
  0: palette.steelBlue,
  1: palette.gold,
  2: palette.orange,
};
