import type { RunCounters, ScalingSpec, TeamModifier } from './effects';
import { mergeTeamModifiers, resolveScaling, teamModifierFromPartial } from './effects';
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
  /** Optional snowball: the static `effect` is the floor, this ramps on top per
   * win/map. Budget-exempt (see src/game/effects.ts ScalingSpec). */
  scaling?: ScalingSpec;
}

/** An equipped boost: just a def id (no tiers). */
export interface PassiveBoost {
  id: string;
}

/** A draft choice is always a brand-new boost. */
export type BoostOffer = { kind: 'new'; defId: string };

export const MAX_BOOSTS = 5;
const OFFER_COUNT = 3;

/** Whole-board reroll cost in run coins. Escalates within a node and resets per
 * node (the phase, and its `rerolls` count, is rebuilt at each draft): 5, 10, 15... */
export const REROLL_BASE = 5;
export const REROLL_STEP = 5;
export function boostRerollCost(rerolls: number): number {
  return REROLL_BASE + REROLL_STEP * rerolls;
}

/** Options for {@link drawBoostOffers}: a run-scoped banish set (never offered) and
 * a rarity pity offset (a drought biases the roll toward epic+). */
export interface DrawBoostOpts {
  banished?: ReadonlySet<string>;
  pityOffset?: number;
}

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
  { id: 'crash-the-glass', name: 'Crash the Glass', blurb: '+1 team rebounding', rarity: 'common', effect: { extra: { rebounding: 1 } } },
  { id: 'quick-hands', name: 'Quick Hands', blurb: '+1 team stealing', rarity: 'common', effect: { extra: { stealing: 1 } } },
  { id: 'rim-runners', name: 'Rim Runners', blurb: '+2 team inside, but -1 stamina', rarity: 'common', effect: { extra: { inside: 2, stamina: -1 } } },
  { id: 'swarm-d', name: 'Swarm D', blurb: '+2 team perimeter D, but -1 inside', rarity: 'common', effect: { extra: { perimeterD: 2, inside: -1 } } },

  // --- Rare (net +2) ---
  { id: 'sharpshooting', name: 'Sharpshooting', blurb: '+2 team outside', rarity: 'rare', effect: { extra: { outside: 2 } } },
  { id: 'perimeter-clamps', name: 'Perimeter Clamps', blurb: '+2 team perimeter D', rarity: 'rare', effect: { extra: { perimeterD: 2 } } },
  { id: 'fast-break', name: 'Fast Break', blurb: '+1 team pace and +1 athleticism', rarity: 'rare', effect: { paceBonus: 1, extra: { athleticism: 1 } } },
  { id: 'iron-legs', name: 'Iron Legs', blurb: '+2 team stamina and durability, but -2 athleticism', rarity: 'rare', effect: { extra: { stamina: 2, durability: 2, athleticism: -2 } } },
  { id: 'paint-presence', name: 'Paint Presence', blurb: '+2 team interior D, +1 inside, but -1 outside', rarity: 'rare', effect: { extra: { interiorD: 2, inside: 1, outside: -1 } } },
  { id: 'run-and-gun', name: 'Run and Gun', blurb: 'Playing fast adds +4 clutch', rarity: 'rare', effect: { hooks: [{ kind: 'paceClutch', minPace: 14, clutchAdd: 4 }] } },
  { id: 'three-and-d', name: 'Three and D', blurb: '+1 team outside and +1 perimeter D', rarity: 'rare', effect: { extra: { outside: 1, perimeterD: 1 } } },
  { id: 'grit-and-grind', name: 'Grit and Grind', blurb: '+2 team interior D, +1 strength, but -1 athleticism', rarity: 'rare', effect: { extra: { interiorD: 2, strength: 1, athleticism: -1 } } },
  { id: 'comeback-story', name: 'Comeback Story', blurb: 'Trailing by 6 or more: +4 team outside', rarity: 'rare', effect: { hooks: [{ kind: 'whenTrailing', marginBehind: 6, delta: { outside: 4 } }] } },
  { id: 'momentum-swing', name: 'Momentum Swing', blurb: 'After a made three, +3 team outside', rarity: 'rare', effect: { hooks: [{ kind: 'onResult', on: 'madeThree', delta: { outside: 3 } }] } },

  // --- Epic (net +3) ---
  { id: 'switch-everything', name: 'Switch Everything', blurb: '+4 team perimeter D, +2 athleticism, but -3 interior D', rarity: 'epic', effect: { extra: { perimeterD: 4, athleticism: 2, interiorD: -3 } } },
  { id: 'heat-check', name: 'Heat Check', blurb: 'Deadeye range: +4 team outside, but -1 perimeter D', rarity: 'epic', effect: { extra: { outside: 4, perimeterD: -1 } } },
  { id: 'lockdown', name: 'Lockdown', blurb: '+2 team perimeter and interior D, but -1 athleticism', rarity: 'epic', effect: { extra: { perimeterD: 2, interiorD: 2, athleticism: -1 } } },
  { id: 'high-motor', name: 'High Motor', blurb: '+2 team stamina and athleticism, but -1 IQ', rarity: 'epic', effect: { extra: { stamina: 2, athleticism: 2, iq: -1 } } },
  { id: 'ice-water', name: 'Ice Water', blurb: '+4 clutch and +3 outside in the fourth', rarity: 'epic', effect: { hooks: [{ kind: 'quarterDelta', quarter: 4, delta: { clutch: 4, outside: 3 } }] } },
  { id: 'glass-eaters', name: 'Glass Eaters', blurb: '+3 team rebounding, +1 interior D, but -1 athleticism', rarity: 'epic', effect: { extra: { rebounding: 3, interiorD: 1, athleticism: -1 } } },
  { id: 'chaos-press', name: 'Chaos Press', blurb: '+3 team stealing, +1 athleticism, but -1 IQ', rarity: 'epic', effect: { extra: { stealing: 3, athleticism: 1, iq: -1 } } },
  { id: 'heat-wave', name: 'Heat Wave', blurb: 'The team heats up: each make adds up to +4 team outside', rarity: 'epic', effect: { hooks: [{ kind: 'hotHand', stat: 'outside', maxAdd: 4, halfLife: 3, reset: 'quarter' }] } },
  { id: 'front-runners', name: 'Front Runners', blurb: 'Ahead by 6 or more: +3 team outside and +2 perimeter D', rarity: 'epic', effect: { hooks: [{ kind: 'whenLeading', marginAhead: 6, delta: { outside: 3, perimeterD: 2 } }] } },

  // --- Legendary (net +5, build-defining) ---
  { id: 'death-lineup', name: 'Death Lineup', blurb: '+3 team perimeter and interior D, but -1 athleticism', rarity: 'legendary', effect: { extra: { perimeterD: 3, interiorD: 3, athleticism: -1 } } },
  { id: 'pace-and-space', name: 'Pace and Space', blurb: '+2 team pace and +3 outside', rarity: 'legendary', effect: { paceBonus: 2, extra: { outside: 3 } } },
  { id: 'small-ball', name: 'Small Ball', blurb: '+4 team outside, +2 athleticism, but -1 interior D', rarity: 'legendary', effect: { extra: { outside: 4, athleticism: 2, interiorD: -1 } } },
  { id: 'positionless', name: 'Positionless', blurb: '+2 team outside, playmaking, and perimeter D, but -1 inside', rarity: 'legendary', effect: { extra: { outside: 2, playmaking: 2, perimeterD: 2, inside: -1 } } },
  { id: 'sixth-man', name: 'Sixth Man', blurb: 'When starters tire, the team gets +2 across the board', rarity: 'legendary', effect: { hooks: [{ kind: 'tiredBench', energyBelow: 50, benchDelta: { inside: 2, outside: 2, perimeterD: 2, interiorD: 2 } }] } },
  { id: 'twin-towers', name: 'Twin Towers', blurb: '+3 team interior D, +2 rebounding, +1 blocking, but -1 athleticism', rarity: 'legendary', effect: { extra: { interiorD: 3, rebounding: 2, blocking: 1, athleticism: -1 } } },
  { id: 'motion-offense', name: 'Motion Offense', blurb: '+2 team outside, +2 playmaking, +1 IQ', rarity: 'legendary', effect: { extra: { outside: 2, playmaking: 2, iq: 1 } } },
  { id: 'never-say-die', name: 'Never Say Die', blurb: 'Down 3 or more: +5 team inside and outside', rarity: 'legendary', effect: { hooks: [{ kind: 'whenTrailing', marginBehind: 3, delta: { inside: 5, outside: 5 } }] } },
  { id: 'unconscious', name: 'Unconscious', blurb: 'Limitless team heat: each make adds up to +6 team outside', rarity: 'legendary', effect: { hooks: [{ kind: 'hotHand', stat: 'outside', maxAdd: 6, halfLife: 2, reset: 'quarter' }] } },

  // --- Scaling (snowball) boosts: a static floor that GROWS across the run. The
  // base effect keeps its rarity budget; the `scaling` ramp is budget-exempt and
  // capped, so it starts humble and pays off late. "Killer Instinct" is greedy:
  // the whole stack wipes the instant you spend a timeout. ---
  { id: 'momentum', name: 'Momentum', blurb: '+1 team outside, growing +1 every 2 wins', rarity: 'common', effect: { extra: { outside: 1 } }, scaling: { per: 'win', every: 2, perStack: { extra: { outside: 1 } }, maxStacks: 2 } },
  { id: 'stonewall', name: 'Stonewall', blurb: '+2 team interior D, hardening each map', rarity: 'rare', effect: { extra: { interiorD: 2 } }, scaling: { per: 'map', every: 2, perStack: { extra: { interiorD: 1 } }, maxStacks: 2 } },
  { id: 'avalanche', name: 'Avalanche', blurb: '+1 team pace and +2 athleticism, faster every 3 wins', rarity: 'epic', effect: { paceBonus: 1, extra: { athleticism: 2 } }, scaling: { per: 'win', every: 3, perStack: { paceBonus: 1 }, maxStacks: 3 } },
  { id: 'dynasty', name: 'Dynasty', blurb: '+2 team outside and perimeter D, +1 clutch, growing toward a juggernaut', rarity: 'legendary', effect: { extra: { outside: 2, perimeterD: 2, clutch: 1 } }, scaling: { per: 'win', every: 3, perStack: { extra: { outside: 1, perimeterD: 1 } }, maxStacks: 2 } },
  { id: 'killer-instinct', name: 'Killer Instinct', blurb: '+2 team clutch, +1 per win, but it all resets if you ever use a timeout', rarity: 'rare', effect: { extra: { clutch: 2 } }, scaling: { per: 'win', every: 1, perStack: { extra: { clutch: 1 } }, maxStacks: 5, greedy: true } },
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
  offerCount: number = OFFER_COUNT,
  opts: DrawBoostOpts = {}
): BoostOffer[] {
  const { banished, pityOffset = 0 } = opts;
  const ownedIds = new Set(owned.map((b) => b.id));
  const chosen = new Set<string>();
  const offers: BoostOffer[] = [];

  const blocked = (id: string): boolean =>
    ownedIds.has(id) || chosen.has(id) || (banished?.has(id) ?? false);
  const available = (r: Rarity): BoostDef[] => BY_RARITY[r].filter((d) => !blocked(d.id));

  for (let attempt = 0; offers.length < offerCount && attempt < offerCount * 12; attempt++) {
    const pool = available(rollRarity(rng, pityOffset));
    if (!pool.length) continue;
    const def = rng.pick(pool);
    chosen.add(def.id);
    offers.push({ kind: 'new', defId: def.id });
  }

  // Safety fill (rare): rng kept rolling empty rarities; top up from anything left
  // that is not owned, already chosen, or banished.
  if (offers.length < offerCount) {
    const rest = BOOST_DEFS.filter((d) => !blocked(d.id));
    while (offers.length < offerCount && rest.length) {
      const idx = rng.int(0, rest.length - 1);
      const def = rest.splice(idx, 1)[0];
      chosen.add(def.id);
      offers.push({ kind: 'new', defId: def.id });
    }
  }
  return offers;
}

/** Fold an owned boost set into a single TeamModifier. When `counters` are supplied
 * (the player's run state), each scaling boost also contributes its current ramp;
 * opponents pass none, so they fold the static floor only. */
export function boostsToModifier(
  boosts: readonly PassiveBoost[],
  counters?: RunCounters
): TeamModifier {
  const mods: TeamModifier[] = [];
  for (const b of boosts) {
    const def = BOOST_BY_ID[b.id];
    if (!def) continue;
    const mod = teamModifierFromPartial(def.effect);
    if (!mod.labels.length) mod.labels = [def.name];
    mods.push(mod);
    if (def.scaling && counters) mods.push(resolveScaling(def.scaling, counters));
  }
  return mods.length ? mergeTeamModifiers(mods) : teamModifierFromPartial({});
}
