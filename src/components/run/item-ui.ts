import { palette } from '@/theme';
import type { ItemRarity } from '@/game/items';

/** Item rarity -> badge color, mirroring the tier palette so power reads at a glance. */
export const ITEM_RARITY_COLOR: Record<ItemRarity, string> = {
  common: palette.inkDim,
  uncommon: palette.makeGreen,
  rare: palette.steelBlue,
  boss: palette.gold,
};
