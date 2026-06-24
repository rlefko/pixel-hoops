import { describe, it, expect } from 'vitest';
import { difficultyLevel } from '@/game/difficulty';
import { getStatRangeForLevel } from '@/game/stat-scaling';
import { classLevel } from '@/game/classes';
import { generateOpponentTeam } from '@/game/tournament';
import { buildTeam } from '@/game/lineup';
import { createRNG } from '@/game/rng';
import { DEFAULT_GAME_PLAN } from '@/types/tactics';

// Mirror of the authored map shape (run-machine TOTAL_MAPS, run-map ROW_SIZES).
const TOTAL_MAPS = 7;
const BOSS_ROW = 5;
const C = classLevel('C'); // the default ladder level
const S = classLevel('S');

describe('difficulty curve (ladder-relative)', () => {
  it('rises monotonically across the run with no reset at map boundaries', () => {
    let prev = -Infinity;
    for (let map = 0; map < TOTAL_MAPS; map++) {
      for (let layer = 1; layer < BOSS_ROW; layer++) {
        const level = difficultyLevel(map, layer, false, C);
        expect(level).toBeGreaterThanOrEqual(prev);
        prev = level;
      }
    }
  });

  it('makes each boss its map local peak', () => {
    for (let map = 0; map < TOTAL_MAPS; map++) {
      const boss = difficultyLevel(map, BOSS_ROW, true, C);
      const lastRegular = difficultyLevel(map, BOSS_ROW - 1, false, C);
      expect(boss).toBeGreaterThan(lastRegular);
    }
  });

  it('opens a class below the ladder and finishes ~two classes above', () => {
    // C ladder: first combat node sits near D (a class below); final boss near A/S+.
    expect(difficultyLevel(0, 1, false, C)).toBeCloseTo(classLevel('D'), 0);
    expect(difficultyLevel(TOTAL_MAPS - 1, BOSS_ROW, true, C)).toBeGreaterThan(C + 2);
    // S ladder finale pushes into the S++ apex (level past 11).
    expect(difficultyLevel(TOTAL_MAPS - 1, BOSS_ROW, true, S)).toBeGreaterThan(11);
  });

  it('shifts the whole curve up with the difficulty stat-shift', () => {
    expect(difficultyLevel(0, 1, false, C, 1)).toBeCloseTo(difficultyLevel(0, 1, false, C) + 1, 5);
  });

  it('keeps the stat band monotonic, capping <=10 through S and exceeding it only past it', () => {
    let prevMin = -Infinity;
    let prevMax = -Infinity;
    for (let l = 3; l <= 13; l += 0.5) {
      const { min, max } = getStatRangeForLevel(l);
      expect(min).toBeGreaterThanOrEqual(3);
      expect(max).toBeLessThanOrEqual(14);
      expect(min).toBeLessThanOrEqual(max);
      expect(min).toBeGreaterThanOrEqual(prevMin);
      expect(max).toBeGreaterThanOrEqual(prevMax);
      if (l <= 9) expect(max).toBeLessThanOrEqual(10); // S band still caps at 10
      prevMin = min;
      prevMax = max;
    }
    expect(getStatRangeForLevel(13).max).toBeGreaterThan(10); // S++ apex bosses
  });

  it('makes opponents clearly stronger from the first map to the last (C ladder)', () => {
    const avgOvr = (map: number): number => {
      const trials = 20;
      let sum = 0;
      for (let s = 0; s < trials; s++) {
        const level = difficultyLevel(map, 1, false, C);
        const opp = generateOpponentTeam(level, createRNG(`opp-${map}-${s}`));
        sum += buildTeam('O', opp.roster.starters, DEFAULT_GAME_PLAN, '#fff', '#000').teamStats.ovr;
      }
      return sum / trials;
    };
    // Endpoint comparison is robust to per-staffing noise; the level itself is
    // strictly monotonic (asserted above).
    expect(avgOvr(TOTAL_MAPS - 1)).toBeGreaterThan(avgOvr(0));
  });
});
