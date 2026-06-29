import type { SimHook, StatDelta } from './effects';
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
  /**
   * Optional conditional rule-benders (comebacks, hot-hand streaks, momentum
   * procs). Folded into the team modifier while this player STARTS (matching the
   * legend-signature hook contract: team-wide for the game, frozen at tip-off),
   * NOT into the flat per-player bake. Hooks are sized by expected value, so a
   * hook-carrying item may spend less than its full rarity net on flat stats (the
   * remainder is "paid" by the conditional effect). See src/game/effects.ts.
   */
  hooks?: SimHook[];
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
  { id: 'arm-sleeve-pair', name: 'Arm Sleeve Pair', rarity: 'common', blurb: '+1 stamina', effect: { stamina: 1 } },
  { id: 'chalk-bag', name: 'Chalk Bag', rarity: 'common', blurb: '+1 playmaking', effect: { playmaking: 1 } },
  { id: 'mouthguard', name: 'Mouthguard', rarity: 'common', blurb: '+1 strength', effect: { strength: 1 } },
  { id: 'quick-laces', name: 'Quick Laces', rarity: 'common', blurb: '+2 athleticism, but -1 strength', effect: { athleticism: 2 }, downside: { strength: -1 } },
  { id: 'palm-grip', name: 'Palm Grip', rarity: 'common', blurb: '+2 inside, but -1 outside', effect: { inside: 2 }, downside: { outside: -1 } },
  { id: 'film-tablet', name: 'Film Tablet', rarity: 'common', blurb: '+2 IQ, but -1 athleticism', effect: { iq: 2 }, downside: { athleticism: -1 } },

  // --- Rare (net +2): a sharper notch, some spiky specialists ---
  { id: 'shooting-sleeve', name: 'Shooting Sleeve', rarity: 'rare', blurb: '+2 outside', effect: { outside: 2 } },
  { id: 'anchor-brace', name: 'Anchor Brace', rarity: 'rare', blurb: '+3 interior D, but -1 athleticism', effect: { interiorD: 3 }, downside: { athleticism: -1 } },
  { id: 'playmaker-gloves', name: 'Playmaker Gloves', rarity: 'rare', blurb: '+3 playmaking, but -1 athleticism', effect: { playmaking: 3 }, downside: { athleticism: -1 } },
  { id: 'sniper-scope', name: 'Sniper Scope', rarity: 'rare', blurb: '+4 outside, but -2 perimeter D', effect: { outside: 4 }, downside: { perimeterD: -2 } },
  { id: 'lockdown-gloves', name: 'Lockdown Gloves', rarity: 'rare', blurb: '+3 perimeter D, but -1 inside', effect: { perimeterD: 3 }, downside: { inside: -1 } },
  { id: 'power-insoles', name: 'Power Insoles', rarity: 'rare', blurb: '+2 inside, +1 athleticism, but -1 outside', effect: { inside: 2, athleticism: 1 }, downside: { outside: -1 } },
  { id: 'court-vision-visor', name: 'Court Vision Visor', rarity: 'rare', blurb: '+2 IQ, +1 playmaking, but -1 clutch', effect: { iq: 2, playmaking: 1 }, downside: { clutch: -1 } },
  { id: 'clutch-charm', name: 'Clutch Charm', rarity: 'rare', blurb: '+3 clutch, but -1 IQ', effect: { clutch: 3 }, downside: { iq: -1 } },
  { id: 'corner-specialist-grips', name: 'Corner Specialist Grips', rarity: 'rare', blurb: '+3 outside, but -1 athleticism', effect: { outside: 3 }, downside: { athleticism: -1 } },
  { id: 'box-out-pads', name: 'Box-Out Pads', rarity: 'rare', blurb: '+3 rebounding, but -1 outside', effect: { rebounding: 3 }, downside: { outside: -1 } },
  { id: 'pickpocket-tape', name: 'Pickpocket Tape', rarity: 'rare', blurb: '+3 stealing, but -1 inside', effect: { stealing: 3 }, downside: { inside: -1 } },

  // --- Epic (net +3): build-shaping gear ---
  { id: 'deadeye-scope', name: 'Deadeye Scope', rarity: 'epic', blurb: '+3 outside', effect: { outside: 3 } },
  { id: 'rim-protector-pads', name: 'Rim Protector Pads', rarity: 'epic', blurb: '+4 interior D, +2 inside, but -3 perimeter D', effect: { interiorD: 4, inside: 2 }, downside: { perimeterD: -3 } },
  { id: 'floor-general-headset', name: 'Floor General Headset', rarity: 'epic', blurb: '+4 playmaking, +2 clutch, but -3 athleticism', effect: { playmaking: 4, clutch: 2 }, downside: { athleticism: -3 } },
  { id: 'blitz-boots', name: 'Blitz Boots', rarity: 'epic', blurb: '+4 athleticism, +1 inside, but -2 interior D', effect: { athleticism: 4, inside: 1 }, downside: { interiorD: -2 } },
  { id: 'marksman-gloves', name: 'Marksman Gloves', rarity: 'epic', blurb: '+5 outside, but -2 perimeter D', effect: { outside: 5 }, downside: { perimeterD: -2 } },
  { id: 'two-way-harness', name: 'Two-Way Harness', rarity: 'epic', blurb: '+2 perimeter D, +2 interior D, but -1 outside', effect: { perimeterD: 2, interiorD: 2 }, downside: { outside: -1 } },
  { id: 'swatter-gauntlets', name: 'Swatter Gauntlets', rarity: 'epic', blurb: '+4 blocking, +1 interior D, but -2 athleticism', effect: { blocking: 4, interiorD: 1 }, downside: { athleticism: -2 } },
  { id: 'triple-threat-rig', name: 'Triple-Threat Rig', rarity: 'epic', blurb: '+2 inside, +2 outside, but -1 perimeter D', effect: { inside: 2, outside: 2 }, downside: { perimeterD: -1 } },

  // --- Legendary (net +5): chase relics, real upside for a real cost ---
  { id: 'heavy-hitter-vest', name: 'Heavy Hitter Vest', rarity: 'legendary', blurb: '+8 inside, but -3 athleticism', effect: { inside: 8 }, downside: { athleticism: -3 } },
  { id: 'glass-cannon-goggles', name: 'Glass Cannon Goggles', rarity: 'legendary', blurb: '+8 outside, but -3 perimeter D', effect: { outside: 8 }, downside: { perimeterD: -3 } },
  { id: 'iron-man-brace', name: 'Iron Man Brace', rarity: 'legendary', blurb: '+6 interior D, +3 inside, but -4 stamina', effect: { interiorD: 6, inside: 3 }, downside: { stamina: -4 } },
  { id: 'mvp-mouthpiece', name: 'MVP Mouthpiece', rarity: 'legendary', blurb: '+3 outside, +2 inside, +1 playmaking, but -1 perimeter D', effect: { outside: 3, inside: 2, playmaking: 1 }, downside: { perimeterD: -1 } },
  { id: 'cold-blooded-cuff', name: 'Cold-Blooded Cuff', rarity: 'legendary', blurb: '+5 clutch, +2 outside, but -2 IQ', effect: { clutch: 5, outside: 2 }, downside: { iq: -2 } },
  { id: 'bully-big-rig', name: 'Bully Big Rig', rarity: 'legendary', blurb: '+9 inside, but -4 athleticism', effect: { inside: 9 }, downside: { athleticism: -4 } },

  // --- Conditional (hook) items: the effect is a rule-bender, sized by feel and
  // budget-exempt. Most are pure-hook (no flat stats); a couple pair a small flat
  // bonus with their trigger. These are the "spicy" build-definers. ---
  { id: 'momentum-band', name: 'Momentum Band', rarity: 'rare', blurb: 'After a made three, +3 outside next possession', effect: {}, hooks: [{ kind: 'onResult', on: 'madeThree', delta: { outside: 3 } }] },
  { id: 'comeback-kid-cuff', name: 'Comeback Kid', rarity: 'rare', blurb: 'Down 8 or more: +3 outside', effect: {}, hooks: [{ kind: 'whenTrailing', marginBehind: 8, delta: { outside: 3 } }] },
  { id: 'heat-check-visor', name: 'Heat-Check Visor', rarity: 'epic', blurb: 'Each make this quarter heats you up, to +4 outside', effect: {}, hooks: [{ kind: 'hotHand', stat: 'outside', maxAdd: 4, halfLife: 3, reset: 'quarter' }] },
  { id: 'closer-mentality', name: 'Closer Mentality', rarity: 'epic', blurb: '+1 clutch, and +3 more clutch when ahead late', effect: { clutch: 1 }, hooks: [{ kind: 'whenLeading', marginAhead: 6, delta: { clutch: 3 } }] },
  { id: 'furious-comeback-vest', name: 'Furious Comeback', rarity: 'legendary', blurb: 'Down 3 or more: +6 inside, +6 outside, +4 clutch', effect: {}, hooks: [{ kind: 'whenTrailing', marginBehind: 3, delta: { inside: 6, outside: 6, clutch: 4 } }] },
  { id: 'supernova-goggles', name: 'Supernova', rarity: 'legendary', blurb: 'Limitless heat: each make adds up to +7 outside', effect: {}, hooks: [{ kind: 'hotHand', stat: 'outside', maxAdd: 7, halfLife: 2, reset: 'quarter' }] },
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
