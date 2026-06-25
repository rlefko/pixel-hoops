import type { StatDelta } from './effects';
import { addStatDelta } from './effects';
import type { RNG } from './rng';
import type { MapNodeType } from '@/types/run-map';

/**
 * Run-scoped equippable items (max 1 per player). Modeled on Slay the Spire
 * relics with rarity bands. Common items are a flat +2 (one notch on the 6-20
 * scale); the boss-relic band trades a big upside for a real downside so a strong
 * item is a decision, not a free win. Grabbed free (one) at Boost nodes, and
 * dropped by elites/bosses. Items reset each run (stripped at mergeRunGainsIntoHome).
 */
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'boss';

export interface ItemDef {
  id: string;
  name: string;
  rarity: ItemRarity;
  blurb: string;
  /** Positive stat deltas applied to the equipped player. */
  effect: StatDelta;
  /** Boss-relic downside (negative deltas) applied to the same player. */
  downside?: StatDelta;
  /** Legacy coin price, retained for rarity ordering; items are free in-run. */
  cost: number;
}

export const ITEM_DEFS: readonly ItemDef[] = [
  // --- Common: flat +2 (the floor) ---
  { id: 'grip-tape', name: 'Grip Tape', rarity: 'common', blurb: '+2 outside', effect: { outside: 2 }, cost: 18 },
  { id: 'ankle-braces', name: 'Ankle Braces', rarity: 'common', blurb: '+2 perimeter D', effect: { perimeterD: 2 }, cost: 18 },
  { id: 'headband', name: 'Headband', rarity: 'common', blurb: '+2 IQ', effect: { iq: 2 }, cost: 16 },
  { id: 'compression-sleeve', name: 'Compression Sleeve', rarity: 'common', blurb: '+2 inside', effect: { inside: 2 }, cost: 18 },
  { id: 'wristband', name: 'Wristband', rarity: 'common', blurb: '+2 clutch', effect: { clutch: 2 }, cost: 16 },
  { id: 'track-spikes', name: 'Track Spikes', rarity: 'common', blurb: '+2 athleticism', effect: { athleticism: 2 }, cost: 18 },

  // --- Uncommon: +4 or a two-stat blend ---
  { id: 'shooting-sleeve', name: 'Shooting Sleeve', rarity: 'uncommon', blurb: '+4 outside', effect: { outside: 4 }, cost: 34 },
  { id: 'lockdown-gloves', name: 'Lockdown Gloves', rarity: 'uncommon', blurb: '+4 perimeter D', effect: { perimeterD: 4 }, cost: 34 },
  { id: 'playmaker-gloves', name: 'Playmaker Gloves', rarity: 'uncommon', blurb: '+2 playmaking, +2 IQ', effect: { playmaking: 2, iq: 2 }, cost: 36 },
  { id: 'bouncy-soles', name: 'Bouncy Soles', rarity: 'uncommon', blurb: '+2 athleticism, +2 inside', effect: { athleticism: 2, inside: 2 }, cost: 36 },

  // --- Rare: +6 / build-shaping ---
  { id: 'sniper-scope', name: 'Sniper Scope', rarity: 'rare', blurb: '+6 outside', effect: { outside: 6 }, cost: 60 },
  { id: 'rim-protector-pads', name: 'Rim Protector Pads', rarity: 'rare', blurb: '+4 interior D, +2 inside', effect: { interiorD: 4, inside: 2 }, cost: 62 },
  { id: 'floor-general-headset', name: 'Floor General Headset', rarity: 'rare', blurb: '+4 playmaking, +2 clutch', effect: { playmaking: 4, clutch: 2 }, cost: 62 },

  // --- Boss relics: big upside WITH a real cost (drop-only) ---
  { id: 'heavy-hitter-vest', name: 'Heavy Hitter Vest', rarity: 'boss', blurb: '+8 inside, but -4 athleticism', effect: { inside: 8 }, downside: { athleticism: -4 }, cost: 0 },
  { id: 'glass-cannon-goggles', name: 'Glass Cannon Goggles', rarity: 'boss', blurb: '+8 outside, but -4 perimeter D', effect: { outside: 8 }, downside: { perimeterD: -4 }, cost: 0 },
  { id: 'iron-man-brace', name: 'Iron Man Brace', rarity: 'boss', blurb: '+6 interior D, +2 inside, but -6 stamina', effect: { interiorD: 6, inside: 2 }, downside: { stamina: -6 }, cost: 0 },
];

export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(
  ITEM_DEFS.map((d) => [d.id, d])
);

/** The net stat delta an equipped item applies (effect plus any downside). */
export function itemDelta(def: ItemDef): StatDelta {
  return def.downside ? addStatDelta(def.effect, def.downside) : def.effect;
}

const BY_RARITY: Record<ItemRarity, ItemDef[]> = {
  common: ITEM_DEFS.filter((d) => d.rarity === 'common'),
  uncommon: ITEM_DEFS.filter((d) => d.rarity === 'uncommon'),
  rare: ITEM_DEFS.filter((d) => d.rarity === 'rare'),
  boss: ITEM_DEFS.filter((d) => d.rarity === 'boss'),
};

/** Pick one item from a rarity bucket (deterministic). */
function pickFrom(rarity: ItemRarity, rng: RNG): ItemDef {
  return rng.pick(BY_RARITY[rarity]);
}

const BOOST_STOCK_SIZE = 3;

/**
 * Deterministic Boost-node stock: BOOST_STOCK_SIZE distinct items weighted toward
 * commons, with rares more likely in deeper rounds. Boss relics never appear here
 * (drop-only). The player grabs one of these for free.
 */
export function rollBoostStock(round: number, rng: RNG): ItemDef[] {
  const rareW = round >= 5 ? 3 : round >= 3 ? 2 : 1;
  const weights: [ItemRarity, number][] = [
    ['common', 5],
    ['uncommon', 3],
    ['rare', rareW],
  ];
  const stock: ItemDef[] = [];
  const seen = new Set<string>();
  // Bounded attempts keep the RNG-draw count predictable while avoiding dupes.
  for (let attempt = 0; attempt < BOOST_STOCK_SIZE * 4 && stock.length < BOOST_STOCK_SIZE; attempt++) {
    const rarity = rng.weightedPick(weights);
    const item = pickFrom(rarity, rng);
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    stock.push(item);
  }
  return stock;
}

/**
 * Deterministic elite/boss drop. Elites skew uncommon/rare; bosses skew
 * rare/boss-relic. Other node types never drop.
 */
export function rollDrop(nodeType: MapNodeType, round: number, rng: RNG): ItemDef | null {
  if (nodeType === 'boss') {
    const weights: [ItemRarity, number][] = [
      ['rare', 3],
      ['boss', round >= 6 ? 4 : 2],
    ];
    return pickFrom(rng.weightedPick(weights), rng);
  }
  if (nodeType === 'elite') {
    const weights: [ItemRarity, number][] = [
      ['uncommon', 3],
      ['rare', round >= 5 ? 3 : 2],
    ];
    return pickFrom(rng.weightedPick(weights), rng);
  }
  return null;
}
