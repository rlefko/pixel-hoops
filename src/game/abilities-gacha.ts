import type { StatDelta, TeamModifier } from './effects';
import type { RNG } from './rng';

/**
 * The passive-ability GACHA: equippable items pulled from three coin machines and
 * equipped onto owned players BEFORE a run (a slot separate from the run-scoped
 * boost items and the legend signature abilities). An ability persists for the
 * whole run (it cannot change mid-run), one ability per player, duplicates allowed
 * across players, freely swapped between runs. See src/game/apply-effects.ts for
 * how the slot folds into effective stats.
 *
 * Rarity power bands (anchored to the +1 ~ +3.2% make rule on the 6-20 scale):
 *  - common (16):     one +2 boost AND one -2 drawback.
 *  - rare (12):       two +2/+2 or a +4 boost, OR a +2 team boost with a -2 drawback.
 *  - legendary (6):   no drawback; a +4 / +2+2 player boost OR a +2 team boost.
 *
 * Serialization-safe (plain StatDelta / TeamModifier fragments, no closures), so
 * an equipped ability stays deterministic and replay-safe.
 */

export type AbilityRarity = 'common' | 'rare' | 'legendary';

export interface GachaAbility {
  id: string;
  name: string;
  blurb: string;
  rarity: AbilityRarity;
  /** Flat per-player rating deltas (the equipped player only). */
  selfDelta?: StatDelta;
  /** Team-level fragment (team boosts), folded into the team modifier. */
  teamAura?: Partial<TeamModifier>;
}

const COMMONS: GachaAbility[] = [
  { id: 'gunner', name: 'Gunner', rarity: 'common', blurb: '+2 outside, -2 perimeter D', selfDelta: { outside: 2, perimeterD: -2 } },
  { id: 'slasher', name: 'Slasher', rarity: 'common', blurb: '+2 inside, -2 outside', selfDelta: { inside: 2, outside: -2 } },
  { id: 'floor-spacer', name: 'Floor Spacer', rarity: 'common', blurb: '+2 outside, -2 playmaking', selfDelta: { outside: 2, playmaking: -2 } },
  { id: 'pest', name: 'Pest', rarity: 'common', blurb: '+2 perimeter D, -2 outside', selfDelta: { perimeterD: 2, outside: -2 } },
  { id: 'banger', name: 'Banger', rarity: 'common', blurb: '+2 interior D, -2 outside', selfDelta: { interiorD: 2, outside: -2 } },
  { id: 'sprinter', name: 'Sprinter', rarity: 'common', blurb: '+2 athleticism, -2 interior D', selfDelta: { athleticism: 2, interiorD: -2 } },
  { id: 'professor', name: 'Professor', rarity: 'common', blurb: '+2 IQ, -2 athleticism', selfDelta: { iq: 2, athleticism: -2 } },
  { id: 'gambler', name: 'Gambler', rarity: 'common', blurb: '+2 clutch, -2 IQ', selfDelta: { clutch: 2, iq: -2 } },
  { id: 'bruiser', name: 'Bruiser', rarity: 'common', blurb: '+2 inside, -2 perimeter D', selfDelta: { inside: 2, perimeterD: -2 } },
  { id: 'distributor', name: 'Distributor', rarity: 'common', blurb: '+2 playmaking, -2 perimeter D', selfDelta: { playmaking: 2, perimeterD: -2 } },
  { id: 'clamp-down', name: 'Clamp Down', rarity: 'common', blurb: '+2 perimeter D, -2 inside', selfDelta: { perimeterD: 2, inside: -2 } },
  { id: 'rim-runner', name: 'Rim Runner', rarity: 'common', blurb: '+2 athleticism, -2 outside', selfDelta: { athleticism: 2, outside: -2 } },
  { id: 'film-rat', name: 'Film Rat', rarity: 'common', blurb: '+2 IQ, -2 clutch', selfDelta: { iq: 2, clutch: -2 } },
  { id: 'ice-veins', name: 'Ice Veins', rarity: 'common', blurb: '+2 clutch, -2 athleticism', selfDelta: { clutch: 2, athleticism: -2 } },
  { id: 'post-anchor', name: 'Post Anchor', rarity: 'common', blurb: '+2 interior D, -2 playmaking', selfDelta: { interiorD: 2, playmaking: -2 } },
  { id: 'wand', name: 'Magic Wand', rarity: 'common', blurb: '+2 playmaking, -2 interior D', selfDelta: { playmaking: 2, interiorD: -2 } },
];

const RARES: GachaAbility[] = [
  { id: 'deadeye', name: 'Deadeye', rarity: 'rare', blurb: '+4 outside', selfDelta: { outside: 4 } },
  { id: 'two-way-wing', name: 'Two-Way Wing', rarity: 'rare', blurb: '+2 outside, +2 perimeter D', selfDelta: { outside: 2, perimeterD: 2 } },
  { id: 'point-god', name: 'Point God', rarity: 'rare', blurb: '+4 playmaking', selfDelta: { playmaking: 4 } },
  { id: 'rim-protector', name: 'Rim Protector', rarity: 'rare', blurb: '+4 interior D', selfDelta: { interiorD: 4 } },
  { id: 'freak-athlete', name: 'Freak Athlete', rarity: 'rare', blurb: '+2 athleticism, +2 inside', selfDelta: { athleticism: 2, inside: 2 } },
  { id: 'high-iq', name: 'High IQ', rarity: 'rare', blurb: '+2 IQ, +2 playmaking', selfDelta: { iq: 2, playmaking: 2 } },
  { id: 'cold-blooded', name: 'Cold Blooded', rarity: 'rare', blurb: '+2 clutch, +2 outside', selfDelta: { clutch: 2, outside: 2 } },
  { id: 'stopper', name: 'Stopper', rarity: 'rare', blurb: '+4 perimeter D', selfDelta: { perimeterD: 4 } },
  { id: 'glue-guy', name: 'Glue Guy', rarity: 'rare', blurb: '+2 inside, +2 interior D', selfDelta: { inside: 2, interiorD: 2 } },
  { id: 'spark-plug', name: 'Spark Plug', rarity: 'rare', blurb: '+2 team offense, -2 clutch', selfDelta: { clutch: -2 }, teamAura: { offenseBonus: 2 } },
  { id: 'enforcer', name: 'Enforcer', rarity: 'rare', blurb: '+2 team defense, -2 athleticism', selfDelta: { athleticism: -2 }, teamAura: { defenseBonus: 2 } },
  { id: 'pace-setter', name: 'Pace Setter', rarity: 'rare', blurb: '+3 team pace, -2 stamina', selfDelta: { stamina: -2 }, teamAura: { paceBonus: 3 } },
];

const LEGENDARIES: GachaAbility[] = [
  { id: 'mvp', name: 'MVP', rarity: 'legendary', blurb: '+2 outside, +2 inside', selfDelta: { outside: 2, inside: 2 } },
  { id: 'dpoy', name: 'DPOY', rarity: 'legendary', blurb: '+4 perimeter D', selfDelta: { perimeterD: 4 } },
  { id: 'maestro', name: 'Maestro', rarity: 'legendary', blurb: '+2 playmaking, +2 IQ', selfDelta: { playmaking: 2, iq: 2 } },
  { id: 'clutch-gene', name: 'Clutch Gene', rarity: 'legendary', blurb: '+4 clutch', selfDelta: { clutch: 4 } },
  { id: 'gravity', name: 'Gravity', rarity: 'legendary', blurb: '+2 team offense', teamAura: { offenseBonus: 2 } },
  { id: 'the-wall', name: 'The Wall', rarity: 'legendary', blurb: '+2 team defense', teamAura: { defenseBonus: 2 } },
];

export const GACHA_ABILITIES: readonly GachaAbility[] = [...COMMONS, ...RARES, ...LEGENDARIES];

const BY_ID: Record<string, GachaAbility> = Object.fromEntries(
  GACHA_ABILITIES.map((a) => [a.id, a])
);

const BY_RARITY: Record<AbilityRarity, GachaAbility[]> = {
  common: COMMONS,
  rare: RARES,
  legendary: LEGENDARIES,
};

/** Look up an equipped ability by id (undefined for unknown ids). */
export function getGachaAbility(id?: string): GachaAbility | undefined {
  return id ? BY_ID[id] : undefined;
}

export type MachineId = 'common' | 'rare' | 'legendary';

export interface GachaMachine {
  id: MachineId;
  name: string;
  cost: number;
  /** Chance of the machine's headline (top) rarity; the rest fall to the tier below. */
  topChance: number;
  topRarity: AbilityRarity;
  baseRarity: AbilityRarity;
  blurb: string;
}

/** The three machines. Prices and odds are fixed by design. */
export const GACHA_MACHINES: Record<MachineId, GachaMachine> = {
  common: {
    id: 'common', name: 'Common Machine', cost: 100, topChance: 1, topRarity: 'common',
    baseRarity: 'common', blurb: '100% common: a +2 boost with a -2 drawback.',
  },
  rare: {
    id: 'rare', name: 'Rare Machine', cost: 1000, topChance: 0.1, topRarity: 'rare',
    baseRarity: 'common', blurb: '10% rare, else common.',
  },
  legendary: {
    id: 'legendary', name: 'Legendary Machine', cost: 10000, topChance: 0.1, topRarity: 'legendary',
    baseRarity: 'rare', blurb: '10% legendary, else rare.',
  },
};

/**
 * Pull one ability from a machine (deterministic from the seeded RNG). Rolls the
 * machine's headline rarity at its `topChance`, otherwise the tier below, then
 * picks a uniform ability of that rarity. Does NOT charge coins (the caller checks
 * affordability and deducts).
 */
export function pullMachine(machineId: MachineId, rng: RNG): { id: string; rarity: AbilityRarity } {
  const m = GACHA_MACHINES[machineId];
  const rarity: AbilityRarity = rng.chance(m.topChance) ? m.topRarity : m.baseRarity;
  const ability = rng.pick(BY_RARITY[rarity]);
  return { id: ability.id, rarity };
}
