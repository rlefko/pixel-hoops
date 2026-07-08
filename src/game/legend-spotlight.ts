import { NBA_LEGENDS } from '@/data/nba';
import { createRNG, deriveSeed } from './rng';
import {
  signatureComplete,
  signatureFor,
  signatureTier,
  type SignatureMarks,
  type SignatureChallenge,
} from './signature';
import { nameKey } from '@/types/roster';
import type { HomeRoster } from './home-roster';
import type { RealPlayer } from '@/types/nba';

export type LegendSpotlightResult = {
  legend: RealPlayer;
  challenge: SignatureChallenge;
  marks: SignatureMarks;
  tier: number;
  conditionText: string;
};

export const LEGEND_SPOTLIGHT_COINS = 50;

/**
 * Select the daily legend spotlight. Picks one legend per day from the player's
 * collection (prioritizing un-signed legends by tier), seeded by the day key.
 * Returns null if no legends are available.
 */
export function spotlightLegend(
  dayKey: string,
  homeRoster: HomeRoster
): LegendSpotlightResult | null {
  // Build a set of owned player keys for O(1) lookup
  const ownedKeys = new Set(
    homeRoster.players.map((p) => nameKey(p.player.name, p.position))
  );

  // Build pool of un-signed, un-owned legends
  const pool: RealPlayer[] = [];
  for (const legend of NBA_LEGENDS) {
    const key = nameKey(legend.name, legend.position);
    // Skip if already signed
    if (signatureComplete(homeRoster.signatures[key])) continue;
    // Skip if already in collection
    if (ownedKeys.has(key)) continue;
    pool.push(legend);
  }

  // Sort by tier descending (PANTHEON first)
  pool.sort((a, b) => signatureTier(b.overall) - signatureTier(a.overall));

  if (pool.length === 0) return null;

  // Deterministic pick
  const rng = createRNG(deriveSeed(dayKey, 'legend-spotlight'));
  const idx = rng.int(0, pool.length - 1);
  const legend = pool[idx];
  const key = nameKey(legend.name, legend.position);
  const challenge = signatureFor(legend);
  const marks = homeRoster.signatures[key] ?? {};
  const tier = signatureTier(legend.overall);

  return {
    legend,
    challenge,
    marks,
    tier,
    conditionText: challenge.text,
  };
}

/** Check if the daily legend spotlight has been claimed for this day. */
export function isSpotlightClaimed(home: HomeRoster, dayKey: string): boolean {
  return home.legendSpotlightClaimedDay === dayKey;
}

/**
 * Claim the daily legend spotlight. Adds coins and stamps the claimed day.
 * Early-return guard: if already claimed for this day, return home unchanged.
 */
export function claimSpotlight(home: HomeRoster, dayKey: string): HomeRoster {
  if (isSpotlightClaimed(home, dayKey)) return home;
  return {
    ...home,
    legendSpotlightClaimedDay: dayKey,
    coins: home.coins + LEGEND_SPOTLIGHT_COINS,
  };
}
