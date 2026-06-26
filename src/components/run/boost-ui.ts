import { BOOST_BY_ID, type BoostDef, type BoostOffer } from '@/game/boosts';

/** Resolve the boost definition an offer refers to. */
export function offerDef(offer: BoostOffer): BoostDef | undefined {
  return BOOST_BY_ID[offer.defId];
}
