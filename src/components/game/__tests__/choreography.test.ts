import { describe, it, expect } from 'vitest';
import { buildPossessionPlan, planDurationMs, spriteKey } from '../choreography';
import { scaled } from '@/feel/timings';
import { POSITIONS } from '@/types/roster';
import type { OnCourtFive, QuarterResult, SimActionId, SimEvent } from '@/types/sim';

/**
 * The possession-theater planner is pure and deterministic, so it is fully
 * testable in Node without the animation runtime. These pins guard the beat
 * structure, the assist-pass gating, the reducer/highlights pacing, and cinema.
 */

function five(prefix: string): OnCourtFive {
  return POSITIONS.reduce((acc, pos) => {
    acc[pos] = `${prefix}-${pos}`;
    return acc;
  }, {} as OnCourtFive);
}

function makeEvent(over: Partial<SimEvent> = {}): SimEvent {
  return {
    seq: 0,
    clock: 'Q1 10:00',
    quarter: 1,
    team: 'home',
    scorerName: 'home-SG',
    scorerPosition: 'SG',
    action: 'midrange' as SimActionId,
    result: 'score' as QuarterResult,
    points: 2,
    homeScore: 2,
    awayScore: 0,
    successRate: 55,
    isBigPlay: false,
    text: 'bucket',
    onCourt: { home: five('home'), away: five('away') },
    ...over,
  };
}

describe('buildPossessionPlan', () => {
  it('is deterministic: same event -> identical plan', () => {
    const e = makeEvent({ seq: 7, action: 'three', assist: { name: 'home-PG', position: 'PG' } });
    expect(buildPossessionPlan(e, 'full', false)).toEqual(buildPossessionPlan(e, 'full', false));
    expect(buildPossessionPlan(e, 'highlights', true)).toEqual(
      buildPossessionPlan(e, 'highlights', true)
    );
  });

  it('full mode runs the whole floor (all ten sprites move)', () => {
    const plan = buildPossessionPlan(makeEvent(), 'full', false);
    expect(Object.keys(plan.movers).length).toBe(10);
    for (const side of ['home', 'away'] as const) {
      for (const pos of POSITIONS) {
        const path = plan.movers[spriteKey(side, pos)];
        expect(path && path.length).toBeGreaterThanOrEqual(2);
        // Every path starts and ends at its base (runs out, then resets).
        expect(path![0].atMs).toBe(0);
        expect(path![path!.length - 1].atMs).toBe(plan.totalMs);
      }
    }
  });

  it('shows the assist pass only when the make was assisted', () => {
    const assisted = buildPossessionPlan(
      makeEvent({ assist: { name: 'home-PG', position: 'PG' } }),
      'full',
      false
    );
    expect(assisted.ball.pass).toBeDefined();
    expect(assisted.preShotMs).toBeGreaterThan(
      buildPossessionPlan(makeEvent(), 'full', false).preShotMs
    );

    const unassisted = buildPossessionPlan(makeEvent(), 'full', false);
    expect(unassisted.ball.pass).toBeUndefined();
    expect(unassisted.ball.carry).toBeDefined(); // still dribbled up
  });

  it('reserves rebound time on a miss and a block, and never passes on them', () => {
    const make = buildPossessionPlan(makeEvent(), 'full', false);
    for (const result of ['miss', 'block'] as QuarterResult[]) {
      const plan = buildPossessionPlan(makeEvent({ result, points: 0 }), 'full', false);
      // The rebound beat lengthens the possession past a clean make (no rebound).
      expect(plan.totalMs).toBeGreaterThan(make.totalMs);
      expect(plan.ball.pass).toBeUndefined();
    }
  });

  it('highlights blows past a routine (non-scoring, non-big) play', () => {
    const plan = buildPossessionPlan(makeEvent({ result: 'miss', points: 0 }), 'highlights', false);
    expect(plan.totalMs).toBe(60);
    expect(Object.keys(plan.movers).length).toBe(0);
    expect(plan.ball.carry).toBeUndefined();
    expect(plan.ball.pass).toBeUndefined();
  });

  it('highlights keeps a noteworthy make tight but shows its pass', () => {
    const plan = buildPossessionPlan(
      makeEvent({ action: 'three', isBigPlay: true, assist: { name: 'home-PG', position: 'PG' } }),
      'highlights',
      false
    );
    expect(plan.movers[spriteKey('home', 'SG')]).toBeDefined(); // the shooter
    expect(plan.movers[spriteKey('home', 'PG')]).toBeDefined(); // the passer
    expect(plan.ball.pass).toBeDefined();
    // Far shorter than the full-mode version of the same make.
    const full = buildPossessionPlan(
      makeEvent({ action: 'three', isBigPlay: true, assist: { name: 'home-PG', position: 'PG' } }),
      'full',
      false
    );
    expect(plan.totalMs).toBeLessThan(full.totalMs);
  });

  it('igniteFrac and every waypoint stay on the court (0..1)', () => {
    const plan = buildPossessionPlan(makeEvent({ action: 'dunk' }), 'full', false);
    const inBounds = (v: number) => v >= 0 && v <= 1;
    expect(inBounds(plan.igniteFrac.x) && inBounds(plan.igniteFrac.y)).toBe(true);
    for (const path of Object.values(plan.movers)) {
      for (const w of path!) {
        expect(inBounds(w.frac.x) && inBounds(w.frac.y)).toBe(true);
      }
    }
  });

  it('marks the scorer as the dunker on a dunk', () => {
    const plan = buildPossessionPlan(makeEvent({ action: 'dunk' }), 'full', false);
    expect(plan.dunk).toBe(true);
    expect(plan.shooterKey).toBe(spriteKey('home', 'SG'));
    expect(buildPossessionPlan(makeEvent({ action: 'three' }), 'full', false).dunk).toBe(false);
  });
});

describe('planDurationMs', () => {
  const speed = 1.6;

  it('scales the total by speed and holds the cinema slow-mo once', () => {
    const normal = buildPossessionPlan(makeEvent(), 'full', false);
    const cinema = buildPossessionPlan(makeEvent(), 'full', true);
    expect(planDurationMs(normal, false, 1)).toBe(scaled(normal.totalMs, 1));
    // Cinema stretches the same possession by WINNER_TIME_SCALE (1.5).
    expect(cinema.timeScale).toBeCloseTo(1.5);
    expect(planDurationMs(cinema, false, 1)).toBe(scaled(cinema.totalMs * 1.5, 1));
  });

  it('goes faster as the playback speed rises', () => {
    const plan = buildPossessionPlan(makeEvent(), 'full', false);
    expect(planDurationMs(plan, false, 2.5)).toBeLessThan(planDurationMs(plan, false, 1));
  });

  it('collapses to the snappy legacy gap under reduced motion', () => {
    const make = buildPossessionPlan(makeEvent(), 'full', false);
    const big = buildPossessionPlan(makeEvent({ isBigPlay: true, action: 'dunk' }), 'full', false);
    const miss = buildPossessionPlan(makeEvent({ result: 'miss', points: 0 }), 'full', false);
    expect(planDurationMs(make, true, speed)).toBe(scaled(150, speed));
    expect(planDurationMs(big, true, speed)).toBe(scaled(220, speed));
    expect(planDurationMs(miss, true, speed)).toBe(scaled(90, speed));
  });

  it('routine highlights stay at the 60ms floor even under reduced motion', () => {
    const plan = buildPossessionPlan(makeEvent({ result: 'miss', points: 0 }), 'highlights', false);
    expect(planDurationMs(plan, false, speed)).toBe(scaled(60, speed));
    expect(planDurationMs(plan, true, speed)).toBe(scaled(60, speed));
  });
});
