import { describe, it, expect } from 'vitest';
import {
  PER_STAT_MAX,
  RATING_CAP,
  canUpgrade,
  isPremiumStat,
  upgradeCost,
} from '@/game/upgrades';

describe('upgrade economy', () => {
  it('standard stats cost 400 then 1,200 (steep, the only two ranks under the +2 cap)', () => {
    expect(upgradeCost('inside', 0)).toBe(400);
    expect(upgradeCost('inside', 1)).toBe(1200);
  });

  it('premium stats cost 600 then 1,800 and cost more than standard', () => {
    expect(isPremiumStat('outside')).toBe(true);
    expect(isPremiumStat('inside')).toBe(false);
    expect(upgradeCost('outside', 0)).toBe(600);
    expect(upgradeCost('outside', 1)).toBe(1800);
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
