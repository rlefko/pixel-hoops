import { describe, it, expect } from 'vitest';
import {
  CLASS_ORDER,
  classForOvr,
  classLevel,
  levelToClass,
  classToBand,
  anchorStatsToClass,
  scaleLegendToLevel,
  compareClass,
  classShift,
  classCost,
} from '@/game/classes';
import { ovr, ovrRaw } from '@/game/ratings';
import { createRNG } from '@/game/rng';
import {
  createPlayer,
  SKILL_STAT_KEYS,
  STAT_ELITE_MAX,
  STAT_MIN,
  type PlayerStats,
} from '@/types/player';
import { ARCHETYPE_POSITION, POSITION_ARCHETYPE, POSITIONS } from '@/types/roster';

describe('class model', () => {
  it('orders the ladder D < C < B < A < S < S+ < S++', () => {
    expect(CLASS_ORDER).toEqual(['D', 'C', 'B', 'A', 'S', 'S+', 'S++']);
    expect(compareClass('C', 'B')).toBeLessThan(0);
    expect(compareClass('S', 'S')).toBe(0);
    expect(compareClass('S++', 'S')).toBeGreaterThan(0);
  });

  it('classForOvr buckets the surface scale, with S++ as the trained/boss apex', () => {
    expect(classForOvr(8)).toBe('D');
    expect(classForOvr(10)).toBe('C');
    expect(classForOvr(12)).toBe('B');
    expect(classForOvr(16)).toBe('A');
    expect(classForOvr(18)).toBe('S');
    expect(classForOvr(22)).toBe('S+');
    expect(classForOvr(26)).toBe('S++');
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
      inside: 14, outside: 20, playmaking: 16, perimeterD: 12, interiorD: 10,
      athleticism: 16, iq: 16, clutch: 18, stamina: 14, durability: 14,
    };
    for (const cls of ['C', 'B', 'A', 'S'] as const) {
      const anchored = anchorStatsToClass(shape, cls, 'SG');
      // The class badge matches the target class.
      expect(classForOvr(ovr(anchored, 'SG'))).toBe(cls);
      // Within the class band.
      const band = classToBand(cls);
      for (const k of SKILL_STAT_KEYS) {
        expect(anchored[k]).toBeGreaterThanOrEqual(6);
        expect(anchored[k]).toBeLessThanOrEqual(20);
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

describe('scaleLegendToLevel', () => {
  // A specialized all-time-great line (Shaq-ish big: rim-dominant, no jumper).
  const legend: PlayerStats = {
    inside: 24,
    outside: 10,
    playmaking: 15,
    perimeterD: 17,
    interiorD: 24,
    athleticism: 22,
    iq: 21,
    clutch: 19,
    stamina: 24,
    durability: 24,
  };

  it('scales a legend down to a low target level, preserving its shape', () => {
    const scaled = scaleLegendToLevel(legend, 'C', 12);
    expect(ovr(scaled, 'C')).toBeGreaterThanOrEqual(11);
    expect(ovr(scaled, 'C')).toBeLessThanOrEqual(13);
    // Shape preserved: still rim-dominant, still no jumper.
    expect(scaled.inside).toBeGreaterThan(scaled.outside);
    expect(scaled.interiorD).toBeGreaterThan(scaled.playmaking);
    // Every skill stays within the surface band.
    for (const key of SKILL_STAT_KEYS) {
      expect(scaled[key]).toBeGreaterThanOrEqual(STAT_MIN);
      expect(scaled[key]).toBeLessThanOrEqual(STAT_ELITE_MAX);
    }
    // Condition ratings pass through unchanged (not part of OVR or a class).
    expect(scaled.stamina).toBe(legend.stamina);
    expect(scaled.durability).toBe(legend.durability);
  });

  it('never buffs a legend above its natural ability', () => {
    const natural = ovrRaw(legend, 'C');
    const up = scaleLegendToLevel(legend, 'C', natural + 10);
    for (const key of SKILL_STAT_KEYS) expect(up[key]).toBe(legend[key]);
  });
});
