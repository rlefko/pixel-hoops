import { describe, it, expect } from 'vitest';
import {
  PER_STAT_MAX,
  RATING_CAP,
  canUpgrade,
  isPremiumStat,
  upgradeCost,
} from '@/game/upgrades';

describe('upgrade economy', () => {
  it('standard stats follow the 20/25/31/39/49 ladder', () => {
    const ladder = [0, 1, 2, 3, 4].map((n) => upgradeCost('inside', n));
    expect(ladder).toEqual([20, 25, 31, 39, 49]);
  });

  it('premium stats follow the 30/39/51/66/86 ladder and cost more', () => {
    expect(isPremiumStat('outside')).toBe(true);
    expect(isPremiumStat('inside')).toBe(false);
    const ladder = [0, 1, 2, 3, 4].map((n) => upgradeCost('outside', n));
    expect(ladder).toEqual([30, 39, 51, 66, 86]);
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
