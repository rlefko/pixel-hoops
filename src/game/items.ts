import type { StatDelta } from './effects';
import { addStatDelta } from './effects';
import { type Rarity, rollBossRarity, rollRarity } from './rarity';
import type { RNG } from './rng';
import type { MapNodeType } from '@/types/run-map';

/**
 * Run-scoped equippable items (max 1 per player). Modeled on Slay the Spire relics
 * and tuned to the shared rarity ladder: an item's net stat change (effect plus any
 * downside) equals its rarity's budget (common +1, rare +2, epic +3, legendary +5).
 * A tier may spend that budget cleanly or as a spiky tradeoff (a big upside paid for
 * with an off-stat downside). Grabbed free (one) at Boost nodes and dropped by
 * bosses. Items reset each run (stripped at mergeRunGainsIntoHome).
 */

export interface ItemDef {
  id: string;
  name: string;
  rarity: Rarity;
  blurb: string;
  /** Positive stat deltas applied to the equipped player. */
  effect: StatDelta;
  /** Optional off-stat downside (negative deltas) applied to the same player. */
  downside?: StatDelta;
}

export const ITEM_DEFS: readonly ItemDef[] = [
  // --- Common (net +1): mostly clean upside, a couple of light tradeoffs ---
  { id: 'grip-tape', name: 'Grip Tape', rarity: 'common', blurb: '+1 outside', effect: { outside: 1 } },
  { id: 'headband', name: 'Headband', rarity: 'common', blurb: '+1 IQ', effect: { iq: 1 } },
  { id: 'wristband', name: 'Wristband', rarity: 'common', blurb: '+1 clutch', effect: { clutch: 1 } },
  { id: 'track-spikes', name: 'Track Spikes', rarity: 'common', blurb: '+1 athleticism', effect: { athleticism: 1 } },
  { id: 'sweatband', name: 'Sweatband', rarity: 'common', blurb: '+1 stamina', effect: { stamina: 1 } },
  { id: 'compression-sleeve', name: 'Compression Sleeve', rarity: 'common', blurb: '+2 inside, but -1 playmaking', effect: { inside: 2 }, downside: { playmaking: -1 } },
  { id: 'ankle-braces', name: 'Ankle Braces', rarity: 'common', blurb: '+2 perimeter D, but -1 athleticism', effect: { perimeterD: 2 }, downside: { athleticism: -1 } },
  { id: 'shooting-gloves', name: 'Shooting Gloves', rarity: 'common', blurb: '+2 outside, but -1 perimeter D', effect: { outside: 2 }, downside: { perimeterD: -1 } },

  // --- Rare (net +2): a sharper notch, some spiky specialists ---
  { id: 'shooting-sleeve', name: 'Shooting Sleeve', rarity: 'rare', blurb: '+2 outside', effect: { outside: 2 } },
  { id: 'anchor-brace', name: 'Anchor Brace', rarity: 'rare', blurb: '+3 interior D, but -1 athleticism', effect: { interiorD: 3 }, downside: { athleticism: -1 } },
  { id: 'playmaker-gloves', name: 'Playmaker Gloves', rarity: 'rare', blurb: '+3 playmaking, but -1 athleticism', effect: { playmaking: 3 }, downside: { athleticism: -1 } },
  { id: 'sniper-scope', name: 'Sniper Scope', rarity: 'rare', blurb: '+4 outside, but -2 perimeter D', effect: { outside: 4 }, downside: { perimeterD: -2 } },
  { id: 'lockdown-gloves', name: 'Lockdown Gloves', rarity: 'rare', blurb: '+3 perimeter D, but -1 inside', effect: { perimeterD: 3 }, downside: { inside: -1 } },
  { id: 'power-insoles', name: 'Power Insoles', rarity: 'rare', blurb: '+2 inside, +1 athleticism, but -1 outside', effect: { inside: 2, athleticism: 1 }, downside: { outside: -1 } },
  { id: 'court-vision-visor', name: 'Court Vision Visor', rarity: 'rare', blurb: '+2 IQ, +1 playmaking, but -1 clutch', effect: { iq: 2, playmaking: 1 }, downside: { clutch: -1 } },
  { id: 'clutch-charm', name: 'Clutch Charm', rarity: 'rare', blurb: '+3 clutch, but -1 IQ', effect: { clutch: 3 }, downside: { iq: -1 } },

  // --- Epic (net +3): build-shaping gear ---
  { id: 'deadeye-scope', name: 'Deadeye Scope', rarity: 'epic', blurb: '+3 outside', effect: { outside: 3 } },
  { id: 'rim-protector-pads', name: 'Rim Protector Pads', rarity: 'epic', blurb: '+4 interior D, +2 inside, but -3 perimeter D', effect: { interiorD: 4, inside: 2 }, downside: { perimeterD: -3 } },
  { id: 'floor-general-headset', name: 'Floor General Headset', rarity: 'epic', blurb: '+4 playmaking, +2 clutch, but -3 athleticism', effect: { playmaking: 4, clutch: 2 }, downside: { athleticism: -3 } },
  { id: 'blitz-boots', name: 'Blitz Boots', rarity: 'epic', blurb: '+4 athleticism, +1 inside, but -2 interior D', effect: { athleticism: 4, inside: 1 }, downside: { interiorD: -2 } },
  { id: 'marksman-gloves', name: 'Marksman Gloves', rarity: 'epic', blurb: '+5 outside, but -2 perimeter D', effect: { outside: 5 }, downside: { perimeterD: -2 } },
  { id: 'two-way-harness', name: 'Two-Way Harness', rarity: 'epic', blurb: '+2 perimeter D, +2 interior D, but -1 outside', effect: { perimeterD: 2, interiorD: 2 }, downside: { outside: -1 } },

  // --- Legendary (net +5): chase relics, real upside for a real cost ---
  { id: 'heavy-hitter-vest', name: 'Heavy Hitter Vest', rarity: 'legendary', blurb: '+8 inside, but -3 athleticism', effect: { inside: 8 }, downside: { athleticism: -3 } },
  { id: 'glass-cannon-goggles', name: 'Glass Cannon Goggles', rarity: 'legendary', blurb: '+8 outside, but -3 perimeter D', effect: { outside: 8 }, downside: { perimeterD: -3 } },
  { id: 'iron-man-brace', name: 'Iron Man Brace', rarity: 'legendary', blurb: '+6 interior D, +3 inside, but -4 stamina', effect: { interiorD: 6, inside: 3 }, downside: { stamina: -4 } },
  { id: 'mvp-mouthpiece', name: 'MVP Mouthpiece', rarity: 'legendary', blurb: '+3 outside, +2 inside, +1 playmaking, but -1 perimeter D', effect: { outside: 3, inside: 2, playmaking: 1 }, downside: { perimeterD: -1 } },
  { id: 'cold-blooded-cuff', name: 'Cold-Blooded Cuff', rarity: 'legendary', blurb: '+5 clutch, +2 outside, but -2 IQ', effect: { clutch: 5, outside: 2 }, downside: { iq: -2 } },
];

export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(
  ITEM_DEFS.map((d) => [d.id, d])
);

/** The net stat delta an equipped item applies (effect plus any downside). */
export function itemDelta(def: ItemDef): StatDelta {
  return def.downside ? addStatDelta(def.effect, def.downside) : def.effect;
}

const BY_RARITY: Record<Rarity, ItemDef[]> = {
  common: ITEM_DEFS.filter((d) => d.rarity === 'common'),
  rare: ITEM_DEFS.filter((d) => d.rarity === 'rare'),
  epic: ITEM_DEFS.filter((d) => d.rarity === 'epic'),
  legendary: ITEM_DEFS.filter((d) => d.rarity === 'legendary'),
};

/** Pick one item from a rarity bucket (deterministic). */
function pickFrom(rarity: Rarity, rng: RNG): ItemDef {
  return rng.pick(BY_RARITY[rarity]);
}

const BOOST_STOCK_SIZE = 3;

/**
 * Deterministic Boost-node stock: BOOST_STOCK_SIZE distinct items, each rolled on the
 * shared in-run rarity table (74 / 20 / 5 / 1). The rare-and-up roll is its own
 * jackpot. The player grabs one of these for free.
 */
export function rollBoostStock(rng: RNG): ItemDef[] {
  const stock: ItemDef[] = [];
  const seen = new Set<string>();
  // Bounded attempts keep the RNG-draw count predictable while avoiding dupes.
  for (let attempt = 0; attempt < BOOST_STOCK_SIZE * 4 && stock.length < BOOST_STOCK_SIZE; attempt++) {
    const item = pickFrom(rollRarity(rng), rng);
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    stock.push(item);
  }
  return stock;
}

/**
 * Deterministic boss drop. A boss ALWAYS drops, on the boss table (75 rare / 20 epic
 * / 5 legendary, never common). Every other node type drops nothing (elites reward
 * coins/TP/reputation only).
 */
export function rollDrop(nodeType: MapNodeType, rng: RNG): ItemDef | null {
  if (nodeType === 'boss') return pickFrom(rollBossRarity(rng), rng);
  return null;
}
