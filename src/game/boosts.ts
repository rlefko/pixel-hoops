import type { TeamModifier } from './effects';
import { mergeTeamModifiers, scaleTeamModifier, teamModifierFromPartial } from './effects';
import type { RNG } from './rng';

/**
 * Run-level passive boosts: drafted 1-of-3 at the start of each round, max 5
 * equipped, forced lossy drop when full, no duplicates (an owned boost is
 * offered as a one-tier upgrade instead). The Hades-boon / Balatro-joker model.
 * Boosts apply to the player's team only, folded into the team modifier.
 */
export type BoostFamily =
  | 'outside'
  | 'transition'
  | 'defense'
  | 'depth'
  | 'clutch'
  | 'capstone';

export type BoostRarity = 'common' | 'rare' | 'capstone';

/** Capstone gating: a "duo" needs one of each family, a "stack" needs N of one. */
export type BoostRequirement =
  | { kind: 'duo'; families: [BoostFamily, BoostFamily] }
  | { kind: 'stack'; family: BoostFamily; count: number };

export interface BoostDef {
  id: string;
  family: BoostFamily;
  name: string;
  blurb: string;
  /** Earliest round this can be offered. */
  minRound: number;
  rarity: BoostRarity;
  /** Highest tier this boost can reach (flat boosts stack; hooks stay tier 1). */
  maxTier: number;
  /** Per-tier TeamModifier fragment; numeric fields scale by tier, hooks once. */
  perTier: Partial<TeamModifier>;
  /** Capstone unlock requirement (capstones only). */
  requires?: BoostRequirement;
}

/** An equipped boost: a def id plus its current tier (1..maxTier). */
export interface PassiveBoost {
  id: string;
  tier: number;
}

/** A draft choice: a brand-new boost, or a one-tier upgrade of an owned one. */
export type BoostOffer =
  | { kind: 'new'; defId: string }
  | { kind: 'tierUp'; id: string; toTier: number };

export const MAX_BOOSTS = 5;
const OFFER_COUNT = 3;

export const BOOST_DEFS: readonly BoostDef[] = [
  // --- Outside ---
  { id: 'splash-brothers', family: 'outside', name: 'Splash Brothers', blurb: '+1 to all outside shooting', minRound: 1, rarity: 'common', maxTier: 3, perTier: { extra: { outside: 1 } } },
  { id: 'stretch-the-floor', family: 'outside', name: 'Stretch the Floor', blurb: '+1 outside and a team offense lift', minRound: 2, rarity: 'common', maxTier: 2, perTier: { offenseBonus: 0.5, extra: { outside: 1 } } },
  { id: 'heat-check', family: 'outside', name: 'Heat Check', blurb: 'Deadeye range: +2 outside', minRound: 3, rarity: 'rare', maxTier: 1, perTier: { extra: { outside: 2 } } },

  // --- Transition ---
  { id: 'seven-seconds', family: 'transition', name: 'Seven Seconds', blurb: '+1.5 pace', minRound: 1, rarity: 'common', maxTier: 2, perTier: { paceBonus: 1.5 } },
  { id: 'full-court-press', family: 'transition', name: 'Full-Court Press', blurb: '+1 perimeter D', minRound: 2, rarity: 'common', maxTier: 2, perTier: { extra: { perimeterD: 1 } } },
  { id: 'run-and-gun', family: 'transition', name: 'Run and Gun', blurb: 'Playing fast adds +2 clutch', minRound: 2, rarity: 'rare', maxTier: 1, perTier: { hooks: [{ kind: 'paceClutch', minPace: 7, clutchAdd: 2 }] } },

  // --- Defense ---
  { id: 'lockdown', family: 'defense', name: 'Lockdown', blurb: '+1 perimeter and interior D', minRound: 1, rarity: 'common', maxTier: 3, perTier: { extra: { perimeterD: 1, interiorD: 1 } } },
  { id: 'no-easy-buckets', family: 'defense', name: 'No Easy Buckets', blurb: 'A team defense lift', minRound: 2, rarity: 'common', maxTier: 2, perTier: { defenseBonus: 1 } },
  { id: 'switch-everything', family: 'defense', name: 'Switch Everything', blurb: '+2 perimeter D, +1 athleticism', minRound: 3, rarity: 'rare', maxTier: 1, perTier: { extra: { perimeterD: 2, athleticism: 1 } } },

  // --- Depth / fatigue ---
  { id: 'deep-rotation', family: 'depth', name: 'Deep Rotation', blurb: '+1 stamina, team-wide', minRound: 1, rarity: 'common', maxTier: 2, perTier: { extra: { stamina: 1 } } },
  { id: 'iron-legs', family: 'depth', name: 'Iron Legs', blurb: '+1 stamina and durability', minRound: 1, rarity: 'common', maxTier: 2, perTier: { extra: { stamina: 1, durability: 1 } } },
  { id: 'sixth-man', family: 'depth', name: 'Sixth Man', blurb: 'When starters tire, the team gets +1 across the board', minRound: 2, rarity: 'rare', maxTier: 1, perTier: { hooks: [{ kind: 'tiredBench', energyBelow: 50, benchDelta: { inside: 1, outside: 1, perimeterD: 1, interiorD: 1 } }] } },

  // --- Clutch ---
  { id: 'closer', family: 'clutch', name: 'Closer', blurb: 'A team clutch lift', minRound: 2, rarity: 'common', maxTier: 2, perTier: { clutchBonus: 1 } },
  { id: 'ice-water', family: 'clutch', name: 'Ice Water', blurb: '+2 clutch and +1 outside in the fourth', minRound: 3, rarity: 'rare', maxTier: 1, perTier: { hooks: [{ kind: 'quarterDelta', quarter: 4, delta: { clutch: 2, outside: 1 } }] } },

  // --- Capstones (gated) ---
  { id: 'pace-and-space', family: 'capstone', name: 'Pace and Space', blurb: 'Duo: +1 pace and +1 outside', minRound: 4, rarity: 'capstone', maxTier: 1, requires: { kind: 'duo', families: ['outside', 'transition'] }, perTier: { paceBonus: 1, extra: { outside: 1 }, labels: ['Pace and Space'] } },
  { id: 'death-lineup', family: 'capstone', name: 'Death Lineup', blurb: 'Stacked defense: big team D and +1 to both defensive ratings', minRound: 5, rarity: 'capstone', maxTier: 1, requires: { kind: 'stack', family: 'defense', count: 2 }, perTier: { defenseBonus: 2, extra: { perimeterD: 1, interiorD: 1 }, labels: ['Death Lineup'] } },
];

export const BOOST_BY_ID: Record<string, BoostDef> = Object.fromEntries(
  BOOST_DEFS.map((d) => [d.id, d])
);

/** Count owned boosts per family (used for capstone gating). */
function familyCounts(owned: readonly PassiveBoost[]): Map<BoostFamily, number> {
  const counts = new Map<BoostFamily, number>();
  for (const b of owned) {
    const def = BOOST_BY_ID[b.id];
    if (!def) continue;
    counts.set(def.family, (counts.get(def.family) ?? 0) + 1);
  }
  return counts;
}

/** Whether a capstone's requirement is satisfied by the owned set. */
function capstoneUnlocked(def: BoostDef, owned: readonly PassiveBoost[]): boolean {
  if (!def.requires) return true;
  const counts = familyCounts(owned);
  if (def.requires.kind === 'stack') {
    return (counts.get(def.requires.family) ?? 0) >= def.requires.count;
  }
  const [a, b] = def.requires.families;
  return (counts.get(a) ?? 0) >= 1 && (counts.get(b) ?? 0) >= 1;
}

const RARITY_WEIGHT: Record<BoostRarity, number> = {
  common: 5,
  rare: 2,
  capstone: 2,
};

/**
 * Deterministic 1-of-N draft. Builds the eligible pool (round-gated, capstones
 * gated, owned-at-max excluded), classifies each entry as a brand-new boost or a
 * one-tier upgrade of an owned boost, then weighted-picks distinct offers. The
 * classification is RNG-free, so the draw count is stable for a given pool.
 */
export function drawBoostOffers(
  round: number,
  owned: readonly PassiveBoost[],
  rng: RNG,
  offerCount: number = OFFER_COUNT
): BoostOffer[] {
  const ownedById = new Map(owned.map((b) => [b.id, b]));
  const pool: { offer: BoostOffer; weight: number }[] = [];
  for (const def of BOOST_DEFS) {
    if (def.minRound > round) continue;
    const have = ownedById.get(def.id);
    if (!have) {
      // Capstones only appear once their requirement is met.
      if (def.rarity === 'capstone' && !capstoneUnlocked(def, owned)) continue;
      pool.push({ offer: { kind: 'new', defId: def.id }, weight: RARITY_WEIGHT[def.rarity] });
    } else if (have.tier < def.maxTier) {
      pool.push({ offer: { kind: 'tierUp', id: def.id, toTier: have.tier + 1 }, weight: RARITY_WEIGHT[def.rarity] });
    }
  }

  const offers: BoostOffer[] = [];
  const remaining = [...pool];
  while (offers.length < offerCount && remaining.length > 0) {
    const idx = rng.weightedPick(remaining.map((p, i): [number, number] => [i, p.weight]));
    offers.push(remaining[idx].offer);
    remaining.splice(idx, 1);
  }
  return offers;
}

/** Fold an owned boost set into a single TeamModifier (tiers scale magnitudes). */
export function boostsToModifier(boosts: readonly PassiveBoost[]): TeamModifier {
  const mods: TeamModifier[] = [];
  for (const b of boosts) {
    const def = BOOST_BY_ID[b.id];
    if (!def) continue;
    const scaled = scaleTeamModifier(def.perTier, b.tier);
    scaled.labels = scaled.labels.length ? scaled.labels : [def.name];
    mods.push(scaled);
  }
  return mods.length ? mergeTeamModifiers(mods) : teamModifierFromPartial({});
}
