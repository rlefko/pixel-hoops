import { palette } from '@/theme';
import type { Position } from '@/types/roster';

/**
 * The color used for each court-slot chip across the roster UI. Lives in its own
 * module (rather than on a component) so the player card, lineup board, and
 * roster strip can all share it without an import cycle.
 */
export const POSITION_COLOR: Record<Position, string> = {
  PG: palette.steelBlue,
  SG: palette.makeGreenLt,
  SF: palette.gold,
  PF: palette.orange,
  C: palette.missRedLt,
};
