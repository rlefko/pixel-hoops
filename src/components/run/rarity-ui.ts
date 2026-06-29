import { palette } from '@/theme';
import type { Rarity } from '@/game/rarity';

/**
 * The single rarity -> accent color used by items, boosts, and gacha abilities, so
 * power reads at a glance everywhere. common = blue, rare = purple, epic = red,
 * legendary = gold: the cool -> warm -> gold tier ramp the player class ladder also
 * follows (see class-ui.ts). The legendary GOLD additionally pulses at reveal sites
 * (a static color cannot carry the halo); see useRewardBurst / usePulse.
 *
 * The hues are shared with the class ladder by design (rare/epic == class B/S), and
 * the rarity read is always reinforced by the label text.
 */
export const RARITY_COLOR: Record<Rarity, string> = {
  common: palette.steelBlue,
  rare: palette.rarePurple,
  epic: palette.epicRed,
  legendary: palette.gold,
};

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'COMMON',
  rare: 'RARE',
  epic: 'EPIC',
  legendary: 'LEGENDARY',
};

/**
 * Section chrome for the boost / item reward screens and map nodes: teal, so the
 * whole rewards category reads distinct from the rest-node gold and from every rarity
 * color (rare is now purple). Individual cards still carry their per-rarity RARITY_COLOR.
 */
export const REWARD_CHROME = palette.chrome;
