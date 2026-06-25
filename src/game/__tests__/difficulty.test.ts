import { describe, it, expect } from 'vitest';
import { difficultyLevel } from '@/game/difficulty';
import { getStatRangeForLevel } from '@/game/stat-scaling';
import { classLevel } from '@/game/classes';
import { difficultyMods, DIFFICULTIES, type Difficulty } from '@/game/difficulty-mode';
import { generateOpponentTeam } from '@/game/tournament';
import { buildTeam } from '@/game/lineup';
import { createRNG } from '@/game/rng';
import { DEFAULT_GAME_PLAN } from '@/types/tactics';

// Mirror of the authored map shape (run-machine TOTAL_MAPS, run-map ROW_SIZES).
const TOTAL_MAPS = 7;
const BOSS_ROW = 5;
const C = classLevel('C'); // the default ladder level
const S = classLevel('S');

/** difficultyLevel at a node, reading the ramp endpoints from a difficulty's mods. */
function lvl(
  map: number,
  layer: number,
  isBoss: boolean,
  ladder: number,
  diff: Difficulty = 'hard'
): number {
  const m = difficultyMods(diff);
  return difficultyLevel(map, layer, isBoss, ladder, m.rampStart, m.rampEnd);
}

describe('difficulty curve (ladder-relative)', () => {
  it('rises monotonically across the run with no reset at map boundaries', () => {
    let prev = -Infinity;
    for (let map = 0; map < TOTAL_MAPS; map++) {
      for (let layer = 1; layer < BOSS_ROW; layer++) {
        const level = lvl(map, layer, false, C);
        expect(level).toBeGreaterThanOrEqual(prev);
        prev = level;
      }
    }
  });

  it('makes each boss its map local peak', () => {
    for (let map = 0; map < TOTAL_MAPS; map++) {
      const boss = lvl(map, BOSS_ROW, true, C);
      const lastRegular = lvl(map, BOSS_ROW - 1, false, C);
      expect(boss).toBeGreaterThan(lastRegular);
    }
  });

  it('opens below the ladder and finishes above it (both ladders)', () => {
    // C ladder: first combat node sits below the ladder class; final boss well above.
    expect(lvl(0, 1, false, C)).toBeLessThan(C);
    expect(lvl(TOTAL_MAPS - 1, BOSS_ROW, true, C)).toBeGreaterThan(C + 2);
    // S ladder finale pushes into the S++ apex (well above the S band).
    expect(lvl(TOTAL_MAPS - 1, BOSS_ROW, true, S)).toBeGreaterThan(S + 2);
  });

  it('diverges by difficulty: the finale climbs higher on harder tiers', () => {
    const finales = DIFFICULTIES.map((d) => lvl(TOTAL_MAPS - 1, BOSS_ROW, true, C, d));
    for (let i = 1; i < finales.length; i++) {
      expect(finales[i]).toBeGreaterThan(finales[i - 1]);
    }
    // Easy ends near the ladder class (base roster can win); insane ends ~two above.
    expect(lvl(TOTAL_MAPS - 1, BOSS_ROW, true, C, 'easy')).toBeLessThan(C + 3);
    expect(lvl(TOTAL_MAPS - 1, BOSS_ROW, true, C, 'insane')).toBeGreaterThan(C + 5);
  });

  it('keeps the early game similar across difficulties', () => {
    const opens = DIFFICULTIES.map((d) => lvl(0, 1, false, C, d));
    const spread = Math.max(...opens) - Math.min(...opens);
    expect(spread).toBeLessThan(2); // first node varies < 2 levels across difficulties
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
        const level = lvl(map, 1, false, C);
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
