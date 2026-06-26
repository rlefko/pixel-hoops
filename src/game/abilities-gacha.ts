import type { StatDelta, TeamModifier } from './effects';
import type { Rarity } from './rarity';
import type { RNG } from './rng';

/**
 * The passive-ability GACHA: equippable abilities pulled from four coin machines and
 * equipped onto owned players BEFORE a run (a slot separate from the run-scoped boost
 * items and the legend signature abilities). An ability persists for the whole run,
 * one per player, duplicates allowed across players, freely swapped between runs. See
 * src/game/apply-effects.ts for how the slot folds into effective stats.
 *
 * Each ability's net stat change equals its rarity budget (common +1, rare +2, epic
 * +3, legendary +5). An ability may convert a +/-3 chunk of individual budget into a
 * +/-1 TEAM-aggregate delta (team points count x3), so a team boost is a deliberate,
 * costly choice. Serialization-safe (plain StatDelta / TeamModifier fragments).
 */

export interface GachaAbility {
  id: string;
  name: string;
  blurb: string;
  rarity: Rarity;
  /** Flat per-player rating deltas (the equipped player only). */
  selfDelta?: StatDelta;
  /** Team-level fragment (team-aggregate deltas), folded into the team modifier. */
  teamAura?: Partial<TeamModifier>;
}

const COMMONS: GachaAbility[] = [
  { id: 'gunner', name: 'Gunner', rarity: 'common', blurb: '+2 outside, -1 perimeter D', selfDelta: { outside: 2, perimeterD: -1 } },
  { id: 'slasher', name: 'Slasher', rarity: 'common', blurb: '+2 inside, -1 outside', selfDelta: { inside: 2, outside: -1 } },
  { id: 'pest', name: 'Pest', rarity: 'common', blurb: '+2 perimeter D, -1 outside', selfDelta: { perimeterD: 2, outside: -1 } },
  { id: 'banger', name: 'Banger', rarity: 'common', blurb: '+2 interior D, -1 outside', selfDelta: { interiorD: 2, outside: -1 } },
  { id: 'sprinter', name: 'Sprinter', rarity: 'common', blurb: '+2 athleticism, -1 interior D', selfDelta: { athleticism: 2, interiorD: -1 } },
  { id: 'professor', name: 'Professor', rarity: 'common', blurb: '+2 IQ, -1 athleticism', selfDelta: { iq: 2, athleticism: -1 } },
  { id: 'gambler', name: 'Gambler', rarity: 'common', blurb: '+2 clutch, -1 IQ', selfDelta: { clutch: 2, iq: -1 } },
  { id: 'distributor', name: 'Distributor', rarity: 'common', blurb: '+2 playmaking, -1 perimeter D', selfDelta: { playmaking: 2, perimeterD: -1 } },
  { id: 'floor-spacer', name: 'Floor Spacer', rarity: 'common', blurb: '+2 outside, -1 playmaking', selfDelta: { outside: 2, playmaking: -1 } },
  { id: 'bruiser', name: 'Bruiser', rarity: 'common', blurb: '+2 inside, -1 perimeter D', selfDelta: { inside: 2, perimeterD: -1 } },
  { id: 'clamp', name: 'Clamp', rarity: 'common', blurb: '+2 perimeter D, -1 inside', selfDelta: { perimeterD: 2, inside: -1 } },
  { id: 'rim-runner', name: 'Rim Runner', rarity: 'common', blurb: '+2 athleticism, -1 outside', selfDelta: { athleticism: 2, outside: -1 } },
];

const RARES: GachaAbility[] = [
  { id: 'deadeye', name: 'Deadeye', rarity: 'rare', blurb: '+4 outside, -2 perimeter D', selfDelta: { outside: 4, perimeterD: -2 } },
  { id: 'two-way-wing', name: 'Two-Way Wing', rarity: 'rare', blurb: '+2 outside, +2 perimeter D, -2 athleticism', selfDelta: { outside: 2, perimeterD: 2, athleticism: -2 } },
  { id: 'point-god', name: 'Point God', rarity: 'rare', blurb: '+4 playmaking, -2 athleticism', selfDelta: { playmaking: 4, athleticism: -2 } },
  { id: 'rim-protector', name: 'Rim Protector', rarity: 'rare', blurb: '+4 interior D, -2 athleticism', selfDelta: { interiorD: 4, athleticism: -2 } },
  { id: 'stopper', name: 'Stopper', rarity: 'rare', blurb: '+3 perimeter D, -1 inside', selfDelta: { perimeterD: 3, inside: -1 } },
  { id: 'freak-athlete', name: 'Freak Athlete', rarity: 'rare', blurb: '+2 athleticism, +2 inside, -2 outside', selfDelta: { athleticism: 2, inside: 2, outside: -2 } },
  { id: 'high-iq', name: 'High IQ', rarity: 'rare', blurb: '+2 IQ, +2 playmaking, -2 clutch', selfDelta: { iq: 2, playmaking: 2, clutch: -2 } },
  { id: 'cold-blooded', name: 'Cold Blooded', rarity: 'rare', blurb: '+3 clutch, -1 IQ', selfDelta: { clutch: 3, iq: -1 } },
  { id: 'glue-guy', name: 'Glue Guy', rarity: 'rare', blurb: '+2 inside, +2 interior D, -2 athleticism', selfDelta: { inside: 2, interiorD: 2, athleticism: -2 } },
  { id: 'sniper', name: 'Sniper', rarity: 'rare', blurb: '+3 outside, -1 inside', selfDelta: { outside: 3, inside: -1 } },
];

const EPICS: GachaAbility[] = [
  { id: 'one-way-scorer', name: 'One-Way Scorer', rarity: 'epic', blurb: '+3 inside', selfDelta: { inside: 3 } },
  { id: 'iso-creator', name: 'Iso Creator', rarity: 'epic', blurb: '+5 outside, -2 perimeter D', selfDelta: { outside: 5, perimeterD: -2 } },
  { id: 'anchor-big', name: 'Anchor Big', rarity: 'epic', blurb: '+4 interior D, +2 inside, -3 athleticism', selfDelta: { interiorD: 4, inside: 2, athleticism: -3 } },
  { id: 'playmaking-engine', name: 'Playmaking Engine', rarity: 'epic', blurb: '+3 playmaking, +2 IQ, -2 clutch', selfDelta: { playmaking: 3, iq: 2, clutch: -2 } },
  // Team-converted: +1 team aggregate (x3 = the full epic budget).
  { id: 'sharpshooter', name: 'Sharpshooter', rarity: 'epic', blurb: '+1 team outside', teamAura: { extra: { outside: 1 } } },
  { id: 'floor-general', name: 'Floor General', rarity: 'epic', blurb: '+1 team playmaking', teamAura: { extra: { playmaking: 1 } } },
  { id: 'lockdown-ace', name: 'Lockdown Ace', rarity: 'epic', blurb: '+1 team perimeter D', teamAura: { extra: { perimeterD: 1 } } },
  // Mixed: a big self anchor paid for with a small team tax.
  { id: 'rim-anchor', name: 'Rim Anchor', rarity: 'epic', blurb: '+6 interior D, but -1 team perimeter D', selfDelta: { interiorD: 6 }, teamAura: { extra: { perimeterD: -1 } } },
];

const LEGENDARIES: GachaAbility[] = [
  { id: 'mvp', name: 'MVP', rarity: 'legendary', blurb: '+3 outside, +2 inside', selfDelta: { outside: 3, inside: 2 } },
  { id: 'dpoy', name: 'DPOY', rarity: 'legendary', blurb: '+3 perimeter D, +2 interior D', selfDelta: { perimeterD: 3, interiorD: 2 } },
  { id: 'maestro', name: 'Maestro', rarity: 'legendary', blurb: '+3 playmaking, +2 IQ', selfDelta: { playmaking: 3, iq: 2 } },
  { id: 'clutch-gene', name: 'Clutch Gene', rarity: 'legendary', blurb: '+5 clutch', selfDelta: { clutch: 5 } },
  // Pure team lift: +2 team outside (x3 = 6) paid down by -1 self stamina.
  { id: 'floor-raiser', name: 'Floor Raiser', rarity: 'legendary', blurb: '+2 team outside, -1 stamina', selfDelta: { stamina: -1 }, teamAura: { extra: { outside: 2 } } },
  // One-Way Player: +3 to every offensive stat, but the team's perimeter D drops.
  { id: 'one-way-player', name: 'One-Way Player', rarity: 'legendary', blurb: '+3 inside/outside/playmaking, -1 clutch, but -1 team perimeter D', selfDelta: { inside: 3, outside: 3, playmaking: 3, clutch: -1 }, teamAura: { extra: { perimeterD: -1 } } },
];

export const GACHA_ABILITIES: readonly GachaAbility[] = [
  ...COMMONS,
  ...RARES,
  ...EPICS,
  ...LEGENDARIES,
];

const BY_ID: Record<string, GachaAbility> = Object.fromEntries(
  GACHA_ABILITIES.map((a) => [a.id, a])
);

const BY_RARITY: Record<Rarity, GachaAbility[]> = {
  common: COMMONS,
  rare: RARES,
  epic: EPICS,
  legendary: LEGENDARIES,
};

/** Look up an equipped ability by id (undefined for unknown ids). */
export function getGachaAbility(id?: string): GachaAbility | undefined {
  return id ? BY_ID[id] : undefined;
}

export type MachineId = 'common' | 'rare' | 'epic' | 'legendary';

export interface GachaMachine {
  id: MachineId;
  name: string;
  cost: number;
  /** Chance of the machine's headline (top) rarity; the rest fall to the floor. */
  topChance: number;
  topRarity: Rarity;
  baseRarity: Rarity;
  blurb: string;
}

/** The four machines, an ascending ladder. Prices and odds are fixed by design. */
export const GACHA_MACHINES: Record<MachineId, GachaMachine> = {
  common: {
    id: 'common', name: 'Common Machine', cost: 500, topChance: 1, topRarity: 'common',
    baseRarity: 'common', blurb: '100% common.',
  },
  rare: {
    id: 'rare', name: 'Rare Machine', cost: 1000, topChance: 0.1, topRarity: 'rare',
    baseRarity: 'common', blurb: '10% rare, else common.',
  },
  epic: {
    id: 'epic', name: 'Epic Machine', cost: 5000, topChance: 0.1, topRarity: 'epic',
    baseRarity: 'rare', blurb: '10% epic, else rare.',
  },
  legendary: {
    id: 'legendary', name: 'Legendary Machine', cost: 10000, topChance: 0.1, topRarity: 'legendary',
    baseRarity: 'epic', blurb: '10% legendary, else epic.',
  },
};

/**
 * Pull one ability from a machine (deterministic from the seeded RNG). Rolls the
 * machine's headline rarity at its `topChance`, otherwise the floor below, then picks
 * a uniform ability of that rarity. Does NOT charge coins (the caller checks
 * affordability and deducts).
 */
export function pullMachine(machineId: MachineId, rng: RNG): { id: string; rarity: Rarity } {
  const m = GACHA_MACHINES[machineId];
  const rarity: Rarity = rng.chance(m.topChance) ? m.topRarity : m.baseRarity;
  const ability = rng.pick(BY_RARITY[rarity]);
  return { id: ability.id, rarity };
}
