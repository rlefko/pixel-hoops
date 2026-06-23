import type { StatDelta } from './effects';
import { addStatDelta } from './effects';
import type { RNG } from './rng';
import type { MapNodeType } from '@/types/run-map';

/**
 * Run-scoped equippable items (max 1 per player). Modeled on Slay the Spire
 * relics with rarity bands. Common items are a flat +1; the boss-relic band
 * trades a big upside for a real downside so a strong item is a decision, not a
 * free win. Surfaced at shop nodes (bought with coins) and as elite/boss drops.
 * Items reset each run (stripped at mergeRunGainsIntoHome).
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
  /** Shop buy price in coins (boss relics are drop-only; cost unused). */
  cost: number;
}

export const ITEM_DEFS: readonly ItemDef[] = [
  // --- Common: flat +1 (the floor) ---
  { id: 'grip-tape', name: 'Grip Tape', rarity: 'common', blurb: '+1 outside', effect: { outside: 1 }, cost: 18 },
  { id: 'ankle-braces', name: 'Ankle Braces', rarity: 'common', blurb: '+1 perimeter D', effect: { perimeterD: 1 }, cost: 18 },
  { id: 'headband', name: 'Headband', rarity: 'common', blurb: '+1 IQ', effect: { iq: 1 }, cost: 16 },
  { id: 'compression-sleeve', name: 'Compression Sleeve', rarity: 'common', blurb: '+1 inside', effect: { inside: 1 }, cost: 18 },
  { id: 'wristband', name: 'Wristband', rarity: 'common', blurb: '+1 clutch', effect: { clutch: 1 }, cost: 16 },
  { id: 'track-spikes', name: 'Track Spikes', rarity: 'common', blurb: '+1 athleticism', effect: { athleticism: 1 }, cost: 18 },

  // --- Uncommon: +2 or a two-stat blend ---
  { id: 'shooting-sleeve', name: 'Shooting Sleeve', rarity: 'uncommon', blurb: '+2 outside', effect: { outside: 2 }, cost: 34 },
  { id: 'lockdown-gloves', name: 'Lockdown Gloves', rarity: 'uncommon', blurb: '+2 perimeter D', effect: { perimeterD: 2 }, cost: 34 },
  { id: 'playmaker-gloves', name: 'Playmaker Gloves', rarity: 'uncommon', blurb: '+1 playmaking, +1 IQ', effect: { playmaking: 1, iq: 1 }, cost: 36 },
  { id: 'bouncy-soles', name: 'Bouncy Soles', rarity: 'uncommon', blurb: '+1 athleticism, +1 inside', effect: { athleticism: 1, inside: 1 }, cost: 36 },

  // --- Rare: +3 / build-shaping ---
  { id: 'sniper-scope', name: 'Sniper Scope', rarity: 'rare', blurb: '+3 outside', effect: { outside: 3 }, cost: 60 },
  { id: 'rim-protector-pads', name: 'Rim Protector Pads', rarity: 'rare', blurb: '+2 interior D, +1 inside', effect: { interiorD: 2, inside: 1 }, cost: 62 },
  { id: 'floor-general-headset', name: 'Floor General Headset', rarity: 'rare', blurb: '+2 playmaking, +1 clutch', effect: { playmaking: 2, clutch: 1 }, cost: 62 },

  // --- Boss relics: big upside WITH a real cost (drop-only) ---
  { id: 'heavy-hitter-vest', name: 'Heavy Hitter Vest', rarity: 'boss', blurb: '+4 inside, but -2 athleticism', effect: { inside: 4 }, downside: { athleticism: -2 }, cost: 0 },
  { id: 'glass-cannon-goggles', name: 'Glass Cannon Goggles', rarity: 'boss', blurb: '+4 outside, but -2 perimeter D', effect: { outside: 4 }, downside: { perimeterD: -2 }, cost: 0 },
  { id: 'iron-man-brace', name: 'Iron Man Brace', rarity: 'boss', blurb: '+3 interior D, +1 inside, but -3 stamina', effect: { interiorD: 3, inside: 1 }, downside: { stamina: -3 }, cost: 0 },
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

const SHOP_SIZE = 3;

/**
 * Deterministic shop stock: SHOP_SIZE distinct items weighted toward commons,
 * with rares more likely in deeper rounds. Boss relics never appear in shops.
 */
export function rollShopStock(round: number, rng: RNG): ItemDef[] {
  const rareW = round >= 5 ? 3 : round >= 3 ? 2 : 1;
  const weights: [ItemRarity, number][] = [
    ['common', 5],
    ['uncommon', 3],
    ['rare', rareW],
  ];
  const stock: ItemDef[] = [];
  const seen = new Set<string>();
  // Bounded attempts keep the RNG-draw count predictable while avoiding dupes.
  for (let attempt = 0; attempt < SHOP_SIZE * 4 && stock.length < SHOP_SIZE; attempt++) {
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
