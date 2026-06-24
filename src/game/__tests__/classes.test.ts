import { describe, it, expect } from 'vitest';
import {
  CLASS_ORDER,
  classForOvr,
  classLevel,
  levelToClass,
  classToBand,
  anchorStatsToClass,
  compareClass,
  classShift,
  classCost,
} from '@/game/classes';
import { ovr } from '@/game/ratings';
import { createRNG } from '@/game/rng';
import { createPlayer, SKILL_STAT_KEYS, type PlayerStats } from '@/types/player';
import { ARCHETYPE_POSITION, POSITION_ARCHETYPE, POSITIONS } from '@/types/roster';

describe('class model', () => {
  it('orders the ladder D < C < B < A < S < S+ < S++', () => {
    expect(CLASS_ORDER).toEqual(['D', 'C', 'B', 'A', 'S', 'S+', 'S++']);
    expect(compareClass('C', 'B')).toBeLessThan(0);
    expect(compareClass('S', 'S')).toBe(0);
    expect(compareClass('S++', 'S')).toBeGreaterThan(0);
  });

  it('classForOvr buckets the surface scale, with S++ as the trained/boss apex', () => {
    expect(classForOvr(4)).toBe('D');
    expect(classForOvr(5)).toBe('C');
    expect(classForOvr(7)).toBe('B');
    expect(classForOvr(8)).toBe('A');
    expect(classForOvr(10)).toBe('S');
    expect(classForOvr(12)).toBe('S+');
    expect(classForOvr(14)).toBe('S++');
  });

  it('classLevel and levelToClass round-trip', () => {
    for (const cls of CLASS_ORDER) {
      expect(levelToClass(classLevel(cls))).toBe(cls);
    }
  });

  it('classShift clamps at the ladder ends', () => {
    expect(classShift('C', 1)).toBe('B');
    expect(classShift('S', 2)).toBe('S++');
    expect(classShift('D', -3)).toBe('D');
    expect(classShift('S++', 3)).toBe('S++');
  });

  it('anchorStatsToClass preserves shape and lands a real-ish line in the class band', () => {
    // A shooter shape (outside lead) starting clustered high.
    const shape: PlayerStats = {
      inside: 7, outside: 10, playmaking: 8, perimeterD: 6, interiorD: 5,
      athleticism: 8, iq: 8, clutch: 9, stamina: 7, durability: 7,
    };
    for (const cls of ['C', 'B', 'A', 'S'] as const) {
      const anchored = anchorStatsToClass(shape, cls, 'SG');
      // The class badge matches the target class.
      expect(classForOvr(ovr(anchored, 'SG'))).toBe(cls);
      // Within the class band.
      const band = classToBand(cls);
      for (const k of SKILL_STAT_KEYS) {
        expect(anchored[k]).toBeGreaterThanOrEqual(3);
        expect(anchored[k]).toBeLessThanOrEqual(10);
      }
      // Shape preserved: outside stays the top skill.
      const top = SKILL_STAT_KEYS.reduce((m, k) => (anchored[k] > anchored[m] ? k : m), SKILL_STAT_KEYS[0]);
      expect(top).toBe('outside');
      expect(band.min).toBeLessThanOrEqual(band.max);
    }
  });

  it('anchors a procedural archetype line into each class', () => {
    const rng = (lo: number, hi: number) => Math.floor((lo + hi) / 2); // deterministic mid
    for (const cls of ['D', 'C', 'B', 'A', 'S'] as const) {
      const base = createPlayer('Test', 'small-forward', rng);
      const anchored = anchorStatsToClass(base.stats, cls, ARCHETYPE_POSITION['small-forward']);
      expect(classForOvr(ovr(anchored, 'SF'))).toBe(cls);
    }
  });

  it('always lands classForOvr(ovr) exactly on the target class (every position x seed)', () => {
    // The exactness invariant that kills spurious upgrade arrows: a freshly anchored
    // player's badge class equals its intended class.
    for (const position of POSITIONS) {
      const archetype = POSITION_ARCHETYPE[position];
      for (let s = 0; s < 50; s++) {
        const base = createPlayer('T', archetype, createRNG(`anchor-${position}-${s}`).int);
        for (const cls of ['D', 'C', 'B', 'A', 'S'] as const) {
          const anchored = anchorStatsToClass(base.stats, cls, position);
          expect(classForOvr(ovr(anchored, position)), `${position} ${cls} seed ${s}`).toBe(cls);
        }
      }
    }
  });

  describe('classCost (draft)', () => {
    it('is free below the ladder, 1 at it, 2 one above, barred higher', () => {
      expect(classCost('D', 'C')).toBe(0);
      expect(classCost('C', 'C')).toBe(1);
      expect(classCost('B', 'C')).toBe(2);
      expect(classCost('A', 'C')).toBeNull();
      expect(classCost('S', 'C')).toBeNull();
    });

    it('always costs 2 for legendaries, regardless of ladder', () => {
      expect(classCost('S+', 'C', true)).toBe(2);
      expect(classCost('S+', 'S', true)).toBe(2);
    });
  });
});
