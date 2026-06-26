import type { PlayerStats } from '@/types/player';
import type { StatDelta } from './effects';
import type { RNG } from './rng';

/**
 * The single rarity ladder shared by run items, passive boosts, and gacha
 * abilities. One ladder, one net-diff budget, one color/juice contract, so rarity
 * reliably signals power across every system.
 */
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

/** Ascending power order (UI sorting, color ramps, jackpot reveals). */
export const RARITY_ORDER: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary'];

/**
 * Net-diff budget per rarity: the sign-aware sum of all stat changes a single
 * entry may spend. Items measure it in INDIVIDUAL points (x1); passive boosts on
 * the TEAM-aggregate scale (x1); gacha abilities mix the two, where a team point
 * costs 3 individual points (see weightedNet). Common leans mostly-upside; the
 * spend can be a clean boost (+3) or a spiky tradeoff (+5/-2).
 */
export const RARITY_NET: Record<Rarity, number> = {
  common: 1,
  rare: 2,
  epic: 3,
  legendary: 5,
};

/** In-run drop weights (passive-boost draft offers AND boost-node free items). */
const IN_RUN_WEIGHTS: readonly (readonly [Rarity, number])[] = [
  ['common', 74],
  ['rare', 20],
  ['epic', 5],
  ['legendary', 1],
];

/** Boss-drop weights: a boss always drops, never a common (the floor is rare). */
const BOSS_WEIGHTS: readonly (readonly [Rarity, number])[] = [
  ['rare', 75],
  ['epic', 20],
  ['legendary', 5],
];

/** Roll an in-run rarity: 74 / 20 / 5 / 1 (common / rare / epic / legendary). */
export function rollRarity(rng: RNG): Rarity {
  return rng.weightedPick(IN_RUN_WEIGHTS);
}

/** Roll a boss-drop rarity: 75 / 20 / 5 (rare / epic / legendary), never common. */
export function rollBossRarity(rng: RNG): Rarity {
  return rng.weightedPick(BOSS_WEIGHTS);
}

/** Sign-aware sum of every entry in a stat delta (the individual-scale net). */
export function individualNet(delta: StatDelta | undefined): number {
  if (!delta) return 0;
  let net = 0;
  for (const key in delta) net += delta[key as keyof PlayerStats] ?? 0;
  return net;
}

/**
 * Net for a TEAM-aggregate delta (passive boosts, gacha team auras): each team
 * point is one budget point. Same math as individualNet, named for intent.
 */
export function teamNet(extra: StatDelta | undefined): number {
  return individualNet(extra);
}

/**
 * The budget a gacha ability spends: individual self-deltas count x1, team-aggregate
 * deltas count x3 (a +1 team lift ~ a +3 on one player's possessions). Used by both
 * the content and the budget-invariant tests.
 */
export function weightedNet(
  selfDelta: StatDelta | undefined,
  teamExtra: StatDelta | undefined
): number {
  return individualNet(selfDelta) + 3 * teamNet(teamExtra);
}
