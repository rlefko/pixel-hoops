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

/** Each dry boost-draft node shifts this much weight into epic AND into legendary. */
const PITY_PER_STREAK = 3;
/** A drought stops biasing the roll past this many dry nodes (caps the swing). */
export const PITY_MAX = 4;

/** Clamp a raw pity streak to the range the roll actually uses. */
export function pityRarityOffset(streak: number): number {
  return Math.max(0, Math.min(streak, PITY_MAX));
}

/**
 * Roll an in-run rarity: 74 / 20 / 5 / 1 (common / rare / epic / legendary). Two
 * additive shifts move weight out of common into epic and legendary: a pity offset
 * (a boost-draft drought, so a long dry streak still pays off) and a flat bonus
 * (the difficulty's rarityBonus, so harder runs drop richer). They compose: pity is
 * clamped independently, so the difficulty shift never eats the drought's swing.
 * Rare stays put; common is floored at 1. One weightedPick draw either way, so the
 * RNG stream (and every seeded replay) is unchanged.
 */
export function rollRarity(rng: RNG, pityOffset = 0, bonus = 0): Rarity {
  const b = pityRarityOffset(pityOffset) * PITY_PER_STREAK + Math.max(0, bonus);
  if (b <= 0) return rng.weightedPick(IN_RUN_WEIGHTS);
  const weights: readonly (readonly [Rarity, number])[] = [
    ['common', Math.max(1, 74 - 2 * b)],
    ['rare', 20],
    ['epic', 5 + b],
    ['legendary', 1 + b],
  ];
  return rng.weightedPick(weights);
}

/** Roll a boss-drop rarity: 75 / 20 / 5 (rare / epic / legendary), never common. A
 * bonus (the difficulty's bossRarityBonus) shifts weight from rare into epic and
 * legendary, so the cruelest bosses drop the loudest gear. */
export function rollBossRarity(rng: RNG, bonus = 0): Rarity {
  if (bonus <= 0) return rng.weightedPick(BOSS_WEIGHTS);
  const weights: readonly (readonly [Rarity, number])[] = [
    ['rare', Math.max(1, 75 - 2 * bonus)],
    ['epic', 20 + bonus],
    ['legendary', 5 + bonus],
  ];
  return rng.weightedPick(weights);
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
