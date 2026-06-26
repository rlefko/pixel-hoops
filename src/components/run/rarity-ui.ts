import { palette } from '@/theme';
import type { Rarity } from '@/game/rarity';

/**
 * The single rarity -> accent color used by items, boosts, and gacha abilities, so
 * power reads at a glance everywhere. common = blue, rare = yellow, epic = orange,
 * legendary = gold. The legendary GOLD additionally pulses at reveal sites (a static
 * color cannot carry the halo); see useRewardBurst / usePulse.
 *
 * Note: palette.orange is intentionally shared with combat node icons and the S+
 * class color (different surfaces); the rarity read is reinforced by the label text.
 */
export const RARITY_COLOR: Record<Rarity, string> = {
  common: palette.steelBlue,
  rare: palette.rareYellow,
  epic: palette.orange,
  legendary: palette.gold,
};

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'COMMON',
  rare: 'RARE',
  epic: 'EPIC',
  legendary: 'LEGENDARY',
};

/**
 * Section chrome for the boost / item reward screens and map nodes: purple, so the
 * whole rewards category reads distinct from the gold rest nodes. Individual cards
 * still carry their per-rarity RARITY_COLOR.
 */
export const REWARD_CHROME = palette.purple;
