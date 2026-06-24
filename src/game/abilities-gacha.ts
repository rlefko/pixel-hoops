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
 * Rarity power bands (anchored to the +1 ~ +6.4% make rule):
 *  - common (16):     one +1 boost AND one -1 drawback.
 *  - rare (12):       two +1/+1 or a +2 boost, OR a +1 team boost with a -1 drawback.
 *  - legendary (6):   no drawback; a +2 / +1+1 player boost OR a +1 team boost.
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
  { id: 'gunner', name: 'Gunner', rarity: 'common', blurb: '+1 outside, -1 perimeter D', selfDelta: { outside: 1, perimeterD: -1 } },
  { id: 'slasher', name: 'Slasher', rarity: 'common', blurb: '+1 inside, -1 outside', selfDelta: { inside: 1, outside: -1 } },
  { id: 'floor-spacer', name: 'Floor Spacer', rarity: 'common', blurb: '+1 outside, -1 playmaking', selfDelta: { outside: 1, playmaking: -1 } },
  { id: 'pest', name: 'Pest', rarity: 'common', blurb: '+1 perimeter D, -1 outside', selfDelta: { perimeterD: 1, outside: -1 } },
  { id: 'banger', name: 'Banger', rarity: 'common', blurb: '+1 interior D, -1 outside', selfDelta: { interiorD: 1, outside: -1 } },
  { id: 'sprinter', name: 'Sprinter', rarity: 'common', blurb: '+1 athleticism, -1 interior D', selfDelta: { athleticism: 1, interiorD: -1 } },
  { id: 'professor', name: 'Professor', rarity: 'common', blurb: '+1 IQ, -1 athleticism', selfDelta: { iq: 1, athleticism: -1 } },
  { id: 'gambler', name: 'Gambler', rarity: 'common', blurb: '+1 clutch, -1 IQ', selfDelta: { clutch: 1, iq: -1 } },
  { id: 'bruiser', name: 'Bruiser', rarity: 'common', blurb: '+1 inside, -1 perimeter D', selfDelta: { inside: 1, perimeterD: -1 } },
  { id: 'distributor', name: 'Distributor', rarity: 'common', blurb: '+1 playmaking, -1 perimeter D', selfDelta: { playmaking: 1, perimeterD: -1 } },
  { id: 'clamp-down', name: 'Clamp Down', rarity: 'common', blurb: '+1 perimeter D, -1 inside', selfDelta: { perimeterD: 1, inside: -1 } },
  { id: 'rim-runner', name: 'Rim Runner', rarity: 'common', blurb: '+1 athleticism, -1 outside', selfDelta: { athleticism: 1, outside: -1 } },
  { id: 'film-rat', name: 'Film Rat', rarity: 'common', blurb: '+1 IQ, -1 clutch', selfDelta: { iq: 1, clutch: -1 } },
  { id: 'ice-veins', name: 'Ice Veins', rarity: 'common', blurb: '+1 clutch, -1 athleticism', selfDelta: { clutch: 1, athleticism: -1 } },
  { id: 'post-anchor', name: 'Post Anchor', rarity: 'common', blurb: '+1 interior D, -1 playmaking', selfDelta: { interiorD: 1, playmaking: -1 } },
  { id: 'wand', name: 'Magic Wand', rarity: 'common', blurb: '+1 playmaking, -1 interior D', selfDelta: { playmaking: 1, interiorD: -1 } },
];

const RARES: GachaAbility[] = [
  { id: 'deadeye', name: 'Deadeye', rarity: 'rare', blurb: '+2 outside', selfDelta: { outside: 2 } },
  { id: 'two-way-wing', name: 'Two-Way Wing', rarity: 'rare', blurb: '+1 outside, +1 perimeter D', selfDelta: { outside: 1, perimeterD: 1 } },
  { id: 'point-god', name: 'Point God', rarity: 'rare', blurb: '+2 playmaking', selfDelta: { playmaking: 2 } },
  { id: 'rim-protector', name: 'Rim Protector', rarity: 'rare', blurb: '+2 interior D', selfDelta: { interiorD: 2 } },
  { id: 'freak-athlete', name: 'Freak Athlete', rarity: 'rare', blurb: '+1 athleticism, +1 inside', selfDelta: { athleticism: 1, inside: 1 } },
  { id: 'high-iq', name: 'High IQ', rarity: 'rare', blurb: '+1 IQ, +1 playmaking', selfDelta: { iq: 1, playmaking: 1 } },
  { id: 'cold-blooded', name: 'Cold Blooded', rarity: 'rare', blurb: '+1 clutch, +1 outside', selfDelta: { clutch: 1, outside: 1 } },
  { id: 'stopper', name: 'Stopper', rarity: 'rare', blurb: '+2 perimeter D', selfDelta: { perimeterD: 2 } },
  { id: 'glue-guy', name: 'Glue Guy', rarity: 'rare', blurb: '+1 inside, +1 interior D', selfDelta: { inside: 1, interiorD: 1 } },
  { id: 'spark-plug', name: 'Spark Plug', rarity: 'rare', blurb: '+1 team offense, -1 clutch', selfDelta: { clutch: -1 }, teamAura: { offenseBonus: 1 } },
  { id: 'enforcer', name: 'Enforcer', rarity: 'rare', blurb: '+1 team defense, -1 athleticism', selfDelta: { athleticism: -1 }, teamAura: { defenseBonus: 1 } },
  { id: 'pace-setter', name: 'Pace Setter', rarity: 'rare', blurb: '+1.5 team pace, -1 stamina', selfDelta: { stamina: -1 }, teamAura: { paceBonus: 1.5 } },
];

const LEGENDARIES: GachaAbility[] = [
  { id: 'mvp', name: 'MVP', rarity: 'legendary', blurb: '+1 outside, +1 inside', selfDelta: { outside: 1, inside: 1 } },
  { id: 'dpoy', name: 'DPOY', rarity: 'legendary', blurb: '+2 perimeter D', selfDelta: { perimeterD: 2 } },
  { id: 'maestro', name: 'Maestro', rarity: 'legendary', blurb: '+1 playmaking, +1 IQ', selfDelta: { playmaking: 1, iq: 1 } },
  { id: 'clutch-gene', name: 'Clutch Gene', rarity: 'legendary', blurb: '+2 clutch', selfDelta: { clutch: 2 } },
  { id: 'gravity', name: 'Gravity', rarity: 'legendary', blurb: '+1 team offense', teamAura: { offenseBonus: 1 } },
  { id: 'the-wall', name: 'The Wall', rarity: 'legendary', blurb: '+1 team defense', teamAura: { defenseBonus: 1 } },
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
    baseRarity: 'common', blurb: '100% common: a +1 boost with a -1 drawback.',
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
