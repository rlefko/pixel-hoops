import { palette } from '@/theme';
import type { MapNodeType } from '@/types/run-map';

/** Per-node-type glyph, color, and label for the run map and node screens. */
export const NODE_META: Record<
  MapNodeType,
  { glyph: string; color: string; label: string }
> = {
  game: { glyph: 'G', color: palette.ink, label: 'Game' },
  elite: { glyph: 'E', color: palette.orange, label: 'Elite' },
  boss: { glyph: 'B', color: palette.missRed, label: 'Boss' },
  recruit: { glyph: '+', color: palette.steelBlue, label: 'Recruit' },
  training: { glyph: '^', color: palette.makeGreen, label: 'Training' },
  rest: { glyph: 'z', color: palette.gold, label: 'Rest' },
  shop: { glyph: '$', color: palette.inkDim, label: 'Shop' },
};
