import { clamp } from './stat-scaling';

/**
 * The League Tier ladder: a persistent, escalating difficulty (the Slay the
 * Spire "Ascension" / Hades "Heat" pattern). Clearing a run at your top unlocked
 * tier unlocks the next, so winning makes the NEXT run harder rather than easier:
 * the fix for "the game becomes laughably easy after a couple of runs."
 *
 * Each tier adds ONE legible, known-mechanic modifier on top of all lower tiers
 * (cumulative). Map generation stays tier-agnostic; every effect is applied at
 * consumption time in the run machine, so difficulty stays deterministic and the
 * curve (src/game/difficulty.ts) is simply shifted/augmented per tier.
 */

export const MAX_LEAGUE_TIER = 10;

export interface TierMods {
  /** Added to a combat node's difficulty level (opponents start stronger). */
  statShift: number;
  /** Elite teams may appear from the first map (normally gated to map 2+). */
  elitesFromMap0: boolean;
  /** How many picks a passive-boost draft offers (normally 3). */
  boostOfferCount: number;
  /** Bosses field a second unscaled franchise legend. */
  bossExtraLegend: boolean;
  /** Multiplier on the per-game injury chance. */
  injuryMul: number;
  /** Most games an injury can sideline a player. */
  maxGamesOut: number;
  /** Multiplier on win coin payouts (meta-progression slows at high tiers). */
  coinMul: number;
  /** Extra weight added to the elite node-type roll (more elites per map). */
  eliteWeightBonus: number;
  /** Bosses gain a second signature ability. */
  bossSecondAbility: boolean;
  /** Whether the guaranteed pre-boss rest node remains (false removes it). */
  preBossRest: boolean;
}

/** Cumulative modifiers active at a given league tier. */
export function tierMods(tier: number): TierMods {
  const t = clamp(tier, 0, MAX_LEAGUE_TIER);
  const statShift = t >= 9 ? 1.2 : t >= 5 ? 0.8 : t >= 1 ? 0.4 : 0;
  return {
    statShift,
    elitesFromMap0: t >= 2,
    boostOfferCount: t >= 3 ? 2 : 3,
    bossExtraLegend: t >= 4,
    injuryMul: t >= 6 ? 1.5 : 1,
    maxGamesOut: t >= 6 ? 3 : 2,
    coinMul: t >= 7 ? 0.85 : 1,
    eliteWeightBonus: t >= 8 ? 2 : 0,
    bossSecondAbility: t >= 10,
    preBossRest: t < 10,
  };
}

/** Display name + one-line description of what each tier adds (index = tier). */
export const TIER_LABELS: { name: string; blurb: string }[] = [
  { name: 'Rookie League', blurb: 'Base difficulty' },
  { name: 'Tighter Floors', blurb: 'Opponents start a notch stronger' },
  { name: 'Early Elites', blurb: 'Elite teams appear from the first map' },
  { name: 'Leaner Draft', blurb: 'Boost drafts offer two picks, not three' },
  { name: 'Stacked Bosses', blurb: 'Bosses field a second franchise legend' },
  { name: 'Harder Floors', blurb: 'Opponents start stronger still' },
  { name: 'Glass Bones', blurb: 'Injuries strike more often and linger' },
  { name: 'Lean Payouts', blurb: 'Win coins are reduced' },
  { name: 'Elite Country', blurb: 'More elite teams every map' },
  { name: 'Steeper Climb', blurb: 'The whole difficulty curve rises' },
  { name: 'The Gauntlet', blurb: 'Bosses gain a second ability; no rest before the finale' },
];

/** Short label for a tier badge, e.g. "T3". Tier 0 has no badge. */
export function tierBadge(tier: number): string {
  return `T${clamp(tier, 0, MAX_LEAGUE_TIER)}`;
}
