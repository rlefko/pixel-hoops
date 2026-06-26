import type { TeamModifier } from './effects';
import { mergeTeamModifiers, teamModifierFromPartial } from './effects';
import { type Rarity, rollRarity } from './rarity';
import type { RNG } from './rng';

/**
 * Run-level passive boosts: drafted 1-of-3 at the start of each round, max 5
 * equipped, forced lossy drop when full, no duplicates. The Hades-boon /
 * Balatro-joker model. Boosts apply to the player's whole team, folded into the team
 * modifier. Each boost is a single fixed-rarity effect whose net change on the team
 * line equals its rarity budget (common +1, rare +2, epic +3, legendary +5).
 * Conditional "hook" boosts (a rule-bender, not a flat magnitude) are sized by feel
 * and exempt from the static budget. Color is by rarity; the legendary tier carries
 * the build-defining drama.
 */

export interface BoostDef {
  id: string;
  name: string;
  blurb: string;
  rarity: Rarity;
  /** Fixed team-modifier fragment. Per-stat `extra` deltas are preferred so the
   * budget is exact; paceBonus/clutchBonus count x1, and hook-only effects are
   * budget-exempt. */
  effect: Partial<TeamModifier>;
}

/** An equipped boost: just a def id (no tiers). */
export interface PassiveBoost {
  id: string;
}

/** A draft choice is always a brand-new boost. */
export type BoostOffer = { kind: 'new'; defId: string };

export const MAX_BOOSTS = 5;
const OFFER_COUNT = 3;

export const BOOST_DEFS: readonly BoostDef[] = [
  // --- Common (net +1 on the team line) ---
  { id: 'splash-brothers', name: 'Splash Brothers', blurb: '+1 team outside', rarity: 'common', effect: { extra: { outside: 1 } } },
  { id: 'ball-movement', name: 'Ball Movement', blurb: '+1 team playmaking', rarity: 'common', effect: { extra: { playmaking: 1 } } },
  { id: 'closer', name: 'Closer', blurb: '+1 team clutch', rarity: 'common', effect: { extra: { clutch: 1 } } },
  { id: 'seven-seconds', name: 'Seven Seconds', blurb: '+1 team pace', rarity: 'common', effect: { paceBonus: 1 } },
  { id: 'deep-rotation', name: 'Deep Rotation', blurb: '+2 team stamina, but -1 athleticism', rarity: 'common', effect: { extra: { stamina: 2, athleticism: -1 } } },
  { id: 'full-court-press', name: 'Full-Court Press', blurb: '+2 team perimeter D, but -1 athleticism', rarity: 'common', effect: { extra: { perimeterD: 2, athleticism: -1 } } },
  { id: 'no-easy-buckets', name: 'No Easy Buckets', blurb: '+2 team interior D, but -1 inside', rarity: 'common', effect: { extra: { interiorD: 2, inside: -1 } } },
  { id: 'bully-ball', name: 'Bully Ball', blurb: '+2 team inside, but -1 outside', rarity: 'common', effect: { extra: { inside: 2, outside: -1 } } },

  // --- Rare (net +2) ---
  { id: 'sharpshooting', name: 'Sharpshooting', blurb: '+2 team outside', rarity: 'rare', effect: { extra: { outside: 2 } } },
  { id: 'perimeter-clamps', name: 'Perimeter Clamps', blurb: '+2 team perimeter D', rarity: 'rare', effect: { extra: { perimeterD: 2 } } },
  { id: 'fast-break', name: 'Fast Break', blurb: '+1 team pace and +1 athleticism', rarity: 'rare', effect: { paceBonus: 1, extra: { athleticism: 1 } } },
  { id: 'iron-legs', name: 'Iron Legs', blurb: '+2 team stamina and durability, but -2 athleticism', rarity: 'rare', effect: { extra: { stamina: 2, durability: 2, athleticism: -2 } } },
  { id: 'paint-presence', name: 'Paint Presence', blurb: '+2 team interior D, +1 inside, but -1 outside', rarity: 'rare', effect: { extra: { interiorD: 2, inside: 1, outside: -1 } } },
  { id: 'run-and-gun', name: 'Run and Gun', blurb: 'Playing fast adds +4 clutch', rarity: 'rare', effect: { hooks: [{ kind: 'paceClutch', minPace: 14, clutchAdd: 4 }] } },

  // --- Epic (net +3) ---
  { id: 'switch-everything', name: 'Switch Everything', blurb: '+4 team perimeter D, +2 athleticism, but -3 interior D', rarity: 'epic', effect: { extra: { perimeterD: 4, athleticism: 2, interiorD: -3 } } },
  { id: 'heat-check', name: 'Heat Check', blurb: 'Deadeye range: +4 team outside, but -1 perimeter D', rarity: 'epic', effect: { extra: { outside: 4, perimeterD: -1 } } },
  { id: 'lockdown', name: 'Lockdown', blurb: '+2 team perimeter and interior D, but -1 athleticism', rarity: 'epic', effect: { extra: { perimeterD: 2, interiorD: 2, athleticism: -1 } } },
  { id: 'high-motor', name: 'High Motor', blurb: '+2 team stamina and athleticism, but -1 IQ', rarity: 'epic', effect: { extra: { stamina: 2, athleticism: 2, iq: -1 } } },
  { id: 'ice-water', name: 'Ice Water', blurb: '+4 clutch and +3 outside in the fourth', rarity: 'epic', effect: { hooks: [{ kind: 'quarterDelta', quarter: 4, delta: { clutch: 4, outside: 3 } }] } },

  // --- Legendary (net +5, build-defining) ---
  { id: 'death-lineup', name: 'Death Lineup', blurb: '+3 team perimeter and interior D, but -1 athleticism', rarity: 'legendary', effect: { extra: { perimeterD: 3, interiorD: 3, athleticism: -1 } } },
  { id: 'pace-and-space', name: 'Pace and Space', blurb: '+2 team pace and +3 outside', rarity: 'legendary', effect: { paceBonus: 2, extra: { outside: 3 } } },
  { id: 'small-ball', name: 'Small Ball', blurb: '+4 team outside, +2 athleticism, but -1 interior D', rarity: 'legendary', effect: { extra: { outside: 4, athleticism: 2, interiorD: -1 } } },
  { id: 'positionless', name: 'Positionless', blurb: '+2 team outside, playmaking, and perimeter D, but -1 inside', rarity: 'legendary', effect: { extra: { outside: 2, playmaking: 2, perimeterD: 2, inside: -1 } } },
  { id: 'sixth-man', name: 'Sixth Man', blurb: 'When starters tire, the team gets +2 across the board', rarity: 'legendary', effect: { hooks: [{ kind: 'tiredBench', energyBelow: 50, benchDelta: { inside: 2, outside: 2, perimeterD: 2, interiorD: 2 } }] } },
];

export const BOOST_BY_ID: Record<string, BoostDef> = Object.fromEntries(
  BOOST_DEFS.map((d) => [d.id, d])
);

const BY_RARITY: Record<Rarity, BoostDef[]> = {
  common: BOOST_DEFS.filter((d) => d.rarity === 'common'),
  rare: BOOST_DEFS.filter((d) => d.rarity === 'rare'),
  epic: BOOST_DEFS.filter((d) => d.rarity === 'epic'),
  legendary: BOOST_DEFS.filter((d) => d.rarity === 'legendary'),
};

/**
 * Deterministic 1-of-N draft. Each offer slot rolls a rarity on the shared in-run
 * table (74 / 20 / 5 / 1), then picks a distinct un-owned boost of that rarity; if
 * none remain at that rarity, the slot re-rolls. A bounded safety fill tops up from
 * any remaining un-owned boost so the draft always offers offerCount choices.
 */
export function drawBoostOffers(
  owned: readonly PassiveBoost[],
  rng: RNG,
  offerCount: number = OFFER_COUNT
): BoostOffer[] {
  const ownedIds = new Set(owned.map((b) => b.id));
  const chosen = new Set<string>();
  const offers: BoostOffer[] = [];

  const available = (r: Rarity): BoostDef[] =>
    BY_RARITY[r].filter((d) => !ownedIds.has(d.id) && !chosen.has(d.id));

  for (let attempt = 0; offers.length < offerCount && attempt < offerCount * 12; attempt++) {
    const pool = available(rollRarity(rng));
    if (!pool.length) continue;
    const def = rng.pick(pool);
    chosen.add(def.id);
    offers.push({ kind: 'new', defId: def.id });
  }

  // Safety fill (rare): rng kept rolling empty rarities; top up from anything left.
  if (offers.length < offerCount) {
    const rest = BOOST_DEFS.filter((d) => !ownedIds.has(d.id) && !chosen.has(d.id));
    while (offers.length < offerCount && rest.length) {
      const idx = rng.int(0, rest.length - 1);
      const def = rest.splice(idx, 1)[0];
      offers.push({ kind: 'new', defId: def.id });
    }
  }
  return offers;
}

/** Fold an owned boost set into a single TeamModifier. */
export function boostsToModifier(boosts: readonly PassiveBoost[]): TeamModifier {
  const mods: TeamModifier[] = [];
  for (const b of boosts) {
    const def = BOOST_BY_ID[b.id];
    if (!def) continue;
    const mod = teamModifierFromPartial(def.effect);
    if (!mod.labels.length) mod.labels = [def.name];
    mods.push(mod);
  }
  return mods.length ? mergeTeamModifiers(mods) : teamModifierFromPartial({});
}
