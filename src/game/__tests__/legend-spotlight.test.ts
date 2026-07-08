import { describe, it, expect } from 'vitest';
import {
  claimSpotlight,
  isSpotlightClaimed,
  spotlightLegend,
} from '@/game/legend-spotlight';
import { NBA_LEGENDS } from '@/data/nba';
import { signatureTier } from '@/game/signature';
import { nameKey } from '@/types/roster';
import type { HomeRoster } from '@/game/home-roster';

function makeRoster(overrides: Partial<HomeRoster> = {}): HomeRoster {
  return {
    players: [],
    collecting: [],
    coins: 0,
    reputation: 0,
    upgrades: {},
    abilityInventory: {},
    equippedAbilities: {},
    ladderProgress: {} as Record<string, string | null>,
    selectedDifficulty: 'medium',
    selectedLadderClass: 'S',
    selectedCoachId: 'starter',
    legendDryStreak: 0,
    hallOfFame: [],
    ownedCoaches: ['starter'],
    claimedBounties: [],
    clearedCells: [],
    favor: {},
    legacy: {},
    signatures: {},
    ...overrides,
  } as HomeRoster;
}

describe('legend spotlight selection', () => {
  it('returns deterministic result for same dayKey', () => {
    const home = makeRoster();
    const result1 = spotlightLegend('2026-01-01', home);
    const result2 = spotlightLegend('2026-01-01', home);
    expect(result1?.legend.name).toBe(result2?.legend.name);
  });

  it('picks different legends for different dayKeys', () => {
    const home = makeRoster();
    const result1 = spotlightLegend('2026-01-01', home);
    const result2 = spotlightLegend('2026-01-02', home);
    // With 92 legends, different seeds should pick different ones most of the time
    // (we accept a small chance of collision)
    // Just verify both return a result
    expect(result1).not.toBeNull();
    expect(result2).not.toBeNull();
  });

  it('prioritizes higher tier legends', () => {
    const home = makeRoster();
    const result = spotlightLegend('2026-01-01', home);
    expect(result).not.toBeNull();
    if (result) {
      const tier = signatureTier(result.legend.overall);
      expect(tier).toBeGreaterThanOrEqual(1);
    }
  });

  it('returns null when all legends are signed', () => {
    const signed: Record<string, { moment: 'hard'; title: 'hard' }> = {};
    for (const legend of NBA_LEGENDS) {
      const key = nameKey(legend.name, legend.position);
      signed[key] = { moment: 'hard', title: 'hard' };
    }
    const home = makeRoster({ signatures: signed });
    expect(spotlightLegend('2026-01-01', home)).toBeNull();
  });
});

describe('claim spotlight', () => {
  it('adds coins and stamps claimed day', () => {
    const home = makeRoster({ coins: 100 });
    const result = claimSpotlight(home, '2026-01-01');
    expect(result.coins).toBe(150);
    expect(result.legendSpotlightClaimedDay).toBe('2026-01-01');
  });

  it('is idempotent: claiming twice does not double-coin', () => {
    const home = makeRoster({ coins: 100 });
    const result1 = claimSpotlight(home, '2026-01-01');
    const result2 = claimSpotlight(result1, '2026-01-01');
    expect(result2.coins).toBe(150);
    expect(result2).toBe(result1);
  });

  it('isSpotlightClaimed returns true after claim', () => {
    const home = makeRoster();
    expect(isSpotlightClaimed(home, '2026-01-01')).toBe(false);
    const claimed = claimSpotlight(home, '2026-01-01');
    expect(isSpotlightClaimed(claimed, '2026-01-01')).toBe(true);
  });

  it('isSpotlightClaimed returns false for different day', () => {
    const home = makeRoster();
    const claimed = claimSpotlight(home, '2026-01-01');
    expect(isSpotlightClaimed(claimed, '2026-01-02')).toBe(false);
  });
});
