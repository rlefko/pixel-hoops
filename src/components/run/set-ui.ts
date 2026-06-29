import type { PassiveBoost } from '@/game/boosts';
import type { TeamModifier } from '@/game/effects';
import { resolveSets, boostTags, itemTags, FAMILY_LABELS, type SetProgress } from '@/game/sets';
import type { PlayerStats } from '@/types/player';
import type { RosterPlayer } from '@/types/roster';

/** Short stat abbreviations for the compact set-effect parenthetical. */
const STAT_ABBR: Record<string, string> = {
  paceBonus: 'pace',
  clutchBonus: 'clutch',
  offenseBonus: 'off',
  defenseBonus: 'def',
  inside: 'in',
  outside: 'out',
  playmaking: 'pm',
  perimeterD: 'perD',
  interiorD: 'intD',
  athleticism: 'ath',
  iq: 'iq',
  clutch: 'clutch',
  stamina: 'sta',
  durability: 'dur',
  blocking: 'blk',
  stealing: 'stl',
  strength: 'str',
  rebounding: 'reb',
};

const signed = (n: number): string => (n > 0 ? `+${n}` : `${n}`);

/** Compactly render a set's bonus, e.g. "+2 pace, +1 ath". */
export function summarizeSetBonus(bonus: Partial<TeamModifier>): string {
  const parts: string[] = [];
  for (const k of ['paceBonus', 'clutchBonus', 'offenseBonus', 'defenseBonus'] as const) {
    const v = bonus[k];
    if (v) parts.push(`${signed(v)} ${STAT_ABBR[k]}`);
  }
  if (bonus.extra) {
    for (const key in bonus.extra) {
      const v = bonus.extra[key as keyof PlayerStats];
      if (v) parts.push(`${signed(v)} ${STAT_ABBR[key] ?? key}`);
    }
  }
  return parts.join(', ');
}

/** Display family names for a boost / item id (empty when it belongs to none). */
export function boostFamilyLabels(id: string): string[] {
  return boostTags(id).map((t) => FAMILY_LABELS[t] ?? t);
}
export function itemFamilyLabels(id: string): string[] {
  return itemTags(id).map((t) => FAMILY_LABELS[t] ?? t);
}

/**
 * A short hint for a draft offer: would drafting this boost complete or advance a
 * synergy set, given the current owned boosts and the dressed five? Returns
 * "-> Set Name (effect)" when it would complete one, "have/need Set Name (effect)"
 * when it advances the closest one, or null when it touches no set. The teaching
 * moment for synergy discovery, surfaced right on the offer.
 */
export function setHintForOffer(
  offerId: string,
  owned: readonly PassiveBoost[],
  five: readonly RosterPlayer[]
): string | null {
  const before = new Map(resolveSets(five, owned).progress.map((p) => [p.def.id, p]));
  const after = resolveSets(five, [...owned, { id: offerId }]).progress;

  let best: SetProgress | null = null;
  for (const a of after) {
    const b = before.get(a.def.id);
    if (!b || b.met || a.have <= b.have) continue; // only sets this offer advances
    const better =
      !best ||
      (a.met && !best.met) ||
      (a.met === best.met && a.need - a.have < best.need - best.have);
    if (better) best = a;
  }
  if (!best) return null;
  const effect = summarizeSetBonus(best.def.bonus);
  const suffix = effect ? ` (${effect})` : '';
  const head = best.met ? `→ ${best.def.name}` : `${best.have}/${best.need} ${best.def.name}`;
  return `${head}${suffix}`;
}
