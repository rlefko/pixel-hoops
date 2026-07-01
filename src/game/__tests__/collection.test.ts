import { describe, it, expect } from 'vitest';
import {
  COPIES_TO_OWN,
  OVERFLOW_BOUNTY,
  copiesToOwn,
  isCollected,
  overflowBounty,
} from '@/game/collection';
import { CLASS_ORDER } from '@/game/ratings';

describe('collection copies-to-own', () => {
  it('is rarity-proportional across the pool ladder (C<=B<=A<=S)', () => {
    // Common C/B own on the first copy (their pools are large enough to be rare already);
    // the chase lives at A and especially S (tiny pool, so the biggest copy count).
    expect(copiesToOwn('C')).toBe(1);
    expect(copiesToOwn('B')).toBe(1);
    expect(copiesToOwn('A')).toBe(3);
    expect(copiesToOwn('S')).toBe(6);
    const pool = ['C', 'B', 'A', 'S'] as const;
    for (let i = 1; i < pool.length; i++) {
      expect(copiesToOwn(pool[i])).toBeGreaterThanOrEqual(copiesToOwn(pool[i - 1]));
    }
  });

  it('owns legends and the D floor on a single copy', () => {
    expect(copiesToOwn('S+')).toBe(1);
    expect(copiesToOwn('D')).toBe(1);
  });

  it('defines a copies-to-own of at least one for every class', () => {
    for (const cls of CLASS_ORDER) expect(COPIES_TO_OWN[cls]).toBeGreaterThanOrEqual(1);
  });

  it('isCollected crosses exactly at the threshold', () => {
    expect(isCollected(2, 'A')).toBe(false);
    expect(isCollected(3, 'A')).toBe(true);
    expect(isCollected(4, 'A')).toBe(true);
    expect(isCollected(1, 'C')).toBe(true);
  });

  it('overflow bounty is half the class scout price for scoutable classes', () => {
    expect(overflowBounty('C')).toBe(125);
    expect(overflowBounty('B')).toBe(250);
    expect(overflowBounty('A')).toBe(500);
    expect(overflowBounty('S')).toBe(1250);
    expect(overflowBounty('S+')).toBe(5000);
    expect(overflowBounty('D')).toBe(0); // no scout machine
    for (const cls of CLASS_ORDER) expect(OVERFLOW_BOUNTY[cls]).toBeGreaterThanOrEqual(0);
  });
});
