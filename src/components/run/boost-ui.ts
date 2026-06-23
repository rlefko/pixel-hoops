import { palette } from '@/theme';
import { BOOST_BY_ID, type BoostDef, type BoostFamily, type BoostOffer } from '@/game/boosts';

/** Per-family accent color for boost chips and draft cards (verified palette keys). */
export const BOOST_FAMILY_COLOR: Record<BoostFamily, string> = {
  outside: palette.steelBlue,
  transition: palette.courtLine,
  defense: palette.makeGreen,
  depth: palette.gold,
  clutch: palette.flame,
  capstone: palette.orange,
};

/** Resolve the boost definition an offer refers to. */
export function offerDef(offer: BoostOffer): BoostDef | undefined {
  return BOOST_BY_ID[offer.kind === 'new' ? offer.defId : offer.id];
}
