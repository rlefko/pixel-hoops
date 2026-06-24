import { describe, it, expect } from 'vitest';
import { tierMods, TIER_LABELS, MAX_LEAGUE_TIER } from '@/game/ascension';
import { generateOpponentTeam } from '@/game/tournament';
import { drawBoostOffers } from '@/game/boosts';
import {
  createRookieRoster,
  mergeRunGainsIntoHome,
  homeToRunRoster,
  deserializeHomeRoster,
} from '@/game/home-roster';
import { initRun, buildOpponentTeam } from '@/game/run-machine';
import { createRNG } from '@/game/rng';

describe('League Tier ladder', () => {
  it('escalates the stat shift monotonically and labels every tier', () => {
    let prev = -Infinity;
    for (let t = 0; t <= MAX_LEAGUE_TIER; t++) {
      expect(tierMods(t).statShift).toBeGreaterThanOrEqual(prev);
      prev = tierMods(t).statShift;
    }
    expect(TIER_LABELS).toHaveLength(MAX_LEAGUE_TIER + 1);
  });

  it('introduces its named modifiers at the right tiers', () => {
    expect(tierMods(0).statShift).toBe(0);
    expect(tierMods(2).elitesFromMap0).toBe(true);
    expect(tierMods(1).elitesFromMap0).toBe(false);
    expect(tierMods(3).boostOfferCount).toBe(2);
    expect(tierMods(2).boostOfferCount).toBe(3);
    expect(tierMods(4).bossExtraLegend).toBe(true);
    expect(tierMods(6).maxGamesOut).toBe(3);
    expect(tierMods(5).maxGamesOut).toBe(2);
    expect(tierMods(7).coinMul).toBeLessThan(1);
    expect(tierMods(10).preBossRest).toBe(false);
    expect(tierMods(9).preBossRest).toBe(true);
  });

  it('fields more legendaries on a boss with the extra-legend modifier', () => {
    const count = (extraLegend: boolean): number => {
      let total = 0;
      for (let s = 0; s < 30; s++) {
        const opp = generateOpponentTeam(8, createRNG(`boss-${s}`), { isBoss: true, extraLegend });
        total += opp.roster.starters.filter((p) => p.legendary).length;
      }
      return total;
    };
    expect(count(true)).toBeGreaterThan(count(false));
  });

  it('shrinks the boost draft to two offers', () => {
    const offers = drawBoostOffers(3, [], createRNG('bo'), tierMods(3).boostOfferCount);
    expect(offers.length).toBeLessThanOrEqual(2);
  });

  it('makes opponents stronger at a higher tier (same node)', () => {
    const home = createRookieRoster(createRNG('asc-home'));
    const m = initRun('asc', home);
    const bossId = m.core.map.bossNodeId;
    const base = buildOpponentTeam(m.core, bossId, 0).teamStats.ovr;
    const hard = buildOpponentTeam(m.core, bossId, 9).teamStats.ovr;
    expect(hard).toBeGreaterThan(base);
  });

  it('unlocks the next tier only when a frontier run is won', () => {
    const base = createRookieRoster(createRNG('adv'));
    const run = homeToRunRoster(base);
    // Champion at the frontier advances and auto-selects the new tier.
    const won = mergeRunGainsIntoHome(base, run, undefined, false, true);
    expect(won.leagueTier).toBe(1);
    expect(won.selectedTier).toBe(1);
    // A loss never advances.
    expect(mergeRunGainsIntoHome(base, run, undefined, false, false).leagueTier).toBe(0);
    // Winning a LOWER tier than unlocked never lowers or raises the ceiling.
    const veteran = { ...base, leagueTier: 3, selectedTier: 1 };
    const replayed = mergeRunGainsIntoHome(veteran, run, undefined, false, true);
    expect(replayed.leagueTier).toBe(3);
  });

  it('migrates a pre-v5 save to the base tier', () => {
    const v4data: Record<string, unknown> = { ...createRookieRoster(createRNG('mig')) };
    delete v4data.leagueTier;
    delete v4data.selectedTier;
    const restored = deserializeHomeRoster({ version: 4, data: v4data });
    expect(restored?.leagueTier).toBe(0);
    expect(restored?.selectedTier).toBe(0);
  });
});
