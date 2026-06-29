import type { PassiveBoost } from '@/game/boosts';
import { resolveSets } from '@/game/sets';
import type { RosterPlayer } from '@/types/roster';

/**
 * A short hint for a draft offer: would drafting this boost complete or advance a
 * synergy set, given the current owned boosts and the dressed five? Returns
 * "-> Set Name" when it would complete one, "have/need Set Name" when it advances
 * the closest one, or null when it touches no set. The teaching moment for synergy
 * discovery, surfaced right on the offer (the Hades "this boon synergizes" beat).
 */
export function setHintForOffer(
  offerId: string,
  owned: readonly PassiveBoost[],
  five: readonly RosterPlayer[]
): string | null {
  const before = new Map(resolveSets(five, owned).progress.map((p) => [p.def.id, p]));
  const after = resolveSets(five, [...owned, { id: offerId }]).progress;

  let best: { name: string; have: number; need: number; met: boolean } | null = null;
  for (const a of after) {
    const b = before.get(a.def.id);
    if (!b || b.met || a.have <= b.have) continue; // only sets this offer advances
    const cand = { name: a.def.name, have: a.have, need: a.need, met: a.met };
    const better =
      !best ||
      (cand.met && !best.met) ||
      (cand.met === best.met && cand.need - cand.have < best.need - best.have);
    if (better) best = cand;
  }
  if (!best) return null;
  return best.met ? `→ ${best.name}` : `${best.have}/${best.need} ${best.name}`;
}
