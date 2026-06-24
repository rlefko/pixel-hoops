import { describe, it, expect } from 'vitest';
import { difficultyLevel } from '@/game/difficulty';
import { getStatRangeForLevel } from '@/game/stat-scaling';
import { generateOpponentTeam } from '@/game/tournament';
import { buildTeam } from '@/game/lineup';
import { createRNG } from '@/game/rng';
import { DEFAULT_GAME_PLAN } from '@/types/tactics';

// Mirror of the authored map shape (run-machine TOTAL_MAPS, run-map ROW_SIZES).
const TOTAL_MAPS = 7;
const BOSS_ROW = 5;

describe('difficulty curve', () => {
  it('rises monotonically across the run with no reset at map boundaries', () => {
    // Walk every map's regular-game rows (1..BOSS_ROW-1) in run order; the level
    // must never drop, including across a map boundary (the start-of-map fix).
    let prev = -Infinity;
    for (let map = 0; map < TOTAL_MAPS; map++) {
      for (let layer = 1; layer < BOSS_ROW; layer++) {
        const level = difficultyLevel(map, layer, false);
        expect(level).toBeGreaterThanOrEqual(prev);
        prev = level;
      }
    }
  });

  it('makes each boss its map local peak', () => {
    for (let map = 0; map < TOTAL_MAPS; map++) {
      const boss = difficultyLevel(map, BOSS_ROW, true);
      const lastRegular = difficultyLevel(map, BOSS_ROW - 1, false);
      expect(boss).toBeGreaterThan(lastRegular);
    }
  });

  it('opens near rookie strength and peaks near the cap', () => {
    expect(difficultyLevel(0, 1, false)).toBeCloseTo(5, 0);
    expect(difficultyLevel(TOTAL_MAPS - 1, BOSS_ROW, true)).toBeGreaterThan(9);
  });

  it('keeps the stat band monotonic in level and clamped to [3,10]', () => {
    let prevMin = -Infinity;
    let prevMax = -Infinity;
    for (let l = 3; l <= 11; l += 0.5) {
      const { min, max } = getStatRangeForLevel(l);
      expect(min).toBeGreaterThanOrEqual(3);
      expect(max).toBeLessThanOrEqual(10);
      expect(min).toBeLessThanOrEqual(max);
      expect(min).toBeGreaterThanOrEqual(prevMin);
      expect(max).toBeGreaterThanOrEqual(prevMax);
      prevMin = min;
      prevMax = max;
    }
  });

  it('makes opponents stronger map over map (the start-of-map fix)', () => {
    // Average opponent OVR for the first regular game of each map across seeds:
    // it must be non-decreasing, so a new map never resets to weak opponents.
    const avgOvr = (map: number): number => {
      const trials = 12;
      let sum = 0;
      for (let s = 0; s < trials; s++) {
        const level = difficultyLevel(map, 1, false);
        const opp = generateOpponentTeam(level, createRNG(`opp-${map}-${s}`));
        sum += buildTeam('O', opp.roster.starters, DEFAULT_GAME_PLAN, '#fff', '#000').teamStats.ovr;
      }
      return sum / trials;
    };
    let prev = -Infinity;
    for (let map = 0; map < TOTAL_MAPS; map++) {
      const ovr = avgOvr(map);
      expect(ovr).toBeGreaterThanOrEqual(prev);
      prev = ovr;
    }
  });
});
