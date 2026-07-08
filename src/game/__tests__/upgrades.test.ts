import { describe, it, expect } from 'vitest';
import {
  PER_STAT_MAX,
  RANK_LEGACY_REQUIREMENT,
  RATING_CAP,
  affordMask,
  canUpgrade,
  isPremiumStat,
  maskBit,
  rankLegacyGateLabel,
  rankUnlockedByLegacy,
  upgradeCost,
} from '@/game/upgrades';
import type { LegacyLine } from '@/game/legacy';
import type { PlayerStats } from '@/types/player';

describe('upgrade economy', () => {
  it('standard stats cost 200 then 400 (base 200, doubling per rank up to the +5 cap)', () => {
    expect(upgradeCost('inside', 0)).toBe(200);
    expect(upgradeCost('inside', 1)).toBe(400);
  });

  it('premium stats cost 300 then 600 and cost more than standard', () => {
    expect(isPremiumStat('outside')).toBe(true);
    expect(isPremiumStat('inside')).toBe(false);
    expect(upgradeCost('outside', 0)).toBe(300);
    expect(upgradeCost('outside', 1)).toBe(600);
    expect(upgradeCost('outside', 0)).toBeGreaterThan(upgradeCost('inside', 0));
  });

  it('cost rises monotonically with tier', () => {
    for (const stat of ['inside', 'outside'] as const) {
      for (let n = 1; n < 6; n++) {
        expect(upgradeCost(stat, n)).toBeGreaterThan(upgradeCost(stat, n - 1));
      }
    }
  });

  it('canUpgrade respects the per-stat cap and the rating ceiling', () => {
    expect(canUpgrade('inside', 5, 0)).toBe(true);
    expect(canUpgrade('inside', 5, PER_STAT_MAX)).toBe(false); // bought out
    expect(canUpgrade('inside', RATING_CAP, 0)).toBe(false); // already maxed rating
  });
});

describe('legacy rank gates (ranks 4-5 are usage-gated)', () => {
  const starter: LegacyLine = { w: 15, mvp: 3, titles: 0 };
  const franchise: LegacyLine = { w: 35, mvp: 10, titles: 1 };

  it('ranks 1-3 stay coins-only, rank 4 needs STARTER, rank 5 FRANCHISE', () => {
    expect(RANK_LEGACY_REQUIREMENT[4]).toBe(2);
    expect(RANK_LEGACY_REQUIREMENT[5]).toBe(3);
    for (const bought of [0, 1, 2]) {
      expect(rankUnlockedByLegacy(bought, undefined)).toBe(true);
    }
    expect(rankUnlockedByLegacy(3, undefined)).toBe(false);
    expect(rankUnlockedByLegacy(3, starter)).toBe(true);
    expect(rankUnlockedByLegacy(4, starter)).toBe(false);
    expect(rankUnlockedByLegacy(4, franchise)).toBe(true);
  });

  it('gate labels name the level a locked rank needs', () => {
    expect(rankLegacyGateLabel(3)).toBe('STARTER');
    expect(rankLegacyGateLabel(4)).toBe('FRANCHISE');
    expect(rankLegacyGateLabel(0)).toBeNull();
  });

  it('affordMask drops a stat whose next rank is legacy-locked, and restores it', () => {
    const stats: PlayerStats = {
      inside: 12, outside: 12, playmaking: 12, perimeterD: 12, interiorD: 12,
      athleticism: 12, iq: 12, clutch: 12, stamina: 12, durability: 12,
      blocking: 12, stealing: 12, strength: 12, rebounding: 12,
    };
    const bought = { inside: 3 };
    const rich = 1_000_000;
    // No career: rank 4 is locked even with a full wallet.
    expect(maskBit(affordMask(stats, bought, rich), 'inside')).toBe(false);
    // A STARTER career opens it; other stats' early ranks were never blocked.
    expect(maskBit(affordMask(stats, bought, rich, starter), 'inside')).toBe(true);
    expect(maskBit(affordMask(stats, bought, rich), 'outside')).toBe(true);
  });
});
