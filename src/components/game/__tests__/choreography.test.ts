import { describe, it, expect } from 'vitest';
import { buildPossessionPlan, planDurationMs, spriteKey, type PossessionPlan } from '../choreography';
import { scaled } from '@/feel/timings';
import { POSITIONS } from '@/types/roster';
import type { OnCourtFive, QuarterResult, SimActionId, SimEvent } from '@/types/sim';

/**
 * The possession-theater planner is pure and deterministic, so it is fully
 * testable in Node without the animation runtime. These pins guard the play
 * selection, the curved/staggered movement contract, the multi-pass ball, the
 * reacting defenders, the camera track, and the reducer/highlights pacing.
 */

function five(prefix: string): OnCourtFive {
  return POSITIONS.reduce((acc, pos) => {
    acc[pos] = `${prefix}-${pos}`;
    return acc;
  }, {} as OnCourtFive);
}

function makeEvent(over: Partial<SimEvent> = {}): SimEvent {
  return {
    seq: 4,
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

const inBounds = (v: number) => v >= 0 && v <= 1;

/** Every mover path starts and ends at base, with strictly increasing times. */
function assertPathShape(plan: PossessionPlan) {
  for (const path of Object.values(plan.movers)) {
    expect(path!.length).toBeGreaterThanOrEqual(2);
    expect(path!.length).toBeLessThanOrEqual(16);
    expect(path![0].atMs).toBe(0);
    expect(path![path!.length - 1].atMs).toBe(plan.totalMs);
    for (let i = 1; i < path!.length; i++) {
      expect(path![i].atMs).toBeGreaterThan(path![i - 1].atMs);
      expect(inBounds(path![i].frac.x) && inBounds(path![i].frac.y)).toBe(true);
    }
  }
}

describe('buildPossessionPlan', () => {
  it('is deterministic: same event -> identical plan', () => {
    const e = makeEvent({ seq: 7, action: 'three', assist: { name: 'home-PG', position: 'PG' } });
    expect(buildPossessionPlan(e, 'full', false)).toEqual(buildPossessionPlan(e, 'full', false));
    expect(buildPossessionPlan(e, 'highlights', true)).toEqual(
      buildPossessionPlan(e, 'highlights', true)
    );
  });

  it('full mode runs all ten sprites on well-formed paths', () => {
    for (const action of ['three', 'drive', 'dunk', 'post'] as SimActionId[]) {
      const plan = buildPossessionPlan(makeEvent({ action, assist: { name: 'home-PG', position: 'PG' } }), 'full', false);
      expect(Object.keys(plan.movers).length).toBe(10);
      assertPathShape(plan);
    }
  });

  it('the ball ends at the shot spot exactly when the shot fires', () => {
    for (const over of [
      { action: 'three' as SimActionId, assist: { name: 'home-PG', position: 'PG' as const } },
      { action: 'drive' as SimActionId, assist: { name: 'home-PG', position: 'PG' as const } },
      { action: 'midrange' as SimActionId }, // unassisted iso
      { action: 'dunk' as SimActionId, assist: { name: 'home-PG', position: 'PG' as const } },
    ]) {
      const plan = buildPossessionPlan(makeEvent(over), 'full', false);
      expect(plan.ball.legs.length).toBeGreaterThanOrEqual(1);
      expect(plan.ball.legs.length).toBeLessThanOrEqual(4);
      const last = plan.ball.legs[plan.ball.legs.length - 1];
      expect(last.startMs + last.ms).toBeCloseTo(plan.preShotMs, 5);
      expect(last.to).toEqual(plan.ball.origin);
      // Every leg stays in bounds and in order.
      let prevStart = -1;
      for (const leg of plan.ball.legs) {
        expect(leg.startMs).toBeGreaterThanOrEqual(prevStart);
        prevStart = leg.startMs;
        expect(inBounds(leg.from.x) && inBounds(leg.to.x)).toBe(true);
      }
    }
  });

  it('an assisted set swings the ball; a pure iso just carries', () => {
    const assisted = buildPossessionPlan(
      makeEvent({ action: 'three', assist: { name: 'home-PG', position: 'PG' } }),
      'full',
      false
    );
    // The credited assist is the final pass, and there is at least one earlier swing.
    expect(assisted.ball.legs.filter((l) => l.kind === 'pass' || l.kind === 'handoff' || l.kind === 'lob').length).toBeGreaterThanOrEqual(2);

    // A pure iso (seq % 3 === 0, unassisted) is a single carry — a true isolation.
    const pureIso = buildPossessionPlan(makeEvent({ action: 'midrange', seq: 9 }), 'full', false);
    expect(pureIso.ball.legs.every((l) => l.kind === 'carry')).toBe(true);
    // The final ball leg of any unassisted possession is a carry (no phantom assist).
    expect(pureIso.ball.legs[pureIso.ball.legs.length - 1].kind).toBe('carry');
  });

  it('an unassisted set play (post/leak-out dunk) still shows a ball and ends on a carry', () => {
    // Unassisted post-up and unassisted dunk route to templates whose scripted final
    // leg is a pass; the ball must still show and finish as a carry (no phantom assist).
    for (const action of ['post', 'dunk'] as SimActionId[]) {
      const full = buildPossessionPlan(makeEvent({ action, scorerPosition: 'C', points: 2, seq: 5 }), 'full', false);
      expect(full.ball.legs.length).toBeGreaterThan(0);
      expect(full.ball.legs[full.ball.legs.length - 1].kind).toBe('carry');
      const hl = buildPossessionPlan(makeEvent({ action, scorerPosition: 'C', points: 2, isBigPlay: true, seq: 5 }), 'highlights', false);
      expect(hl.ball.legs.length).toBeGreaterThan(0); // the ball never silently vanishes
    }
  });

  it('every shot originates from a real front-court spot (never mid-court)', () => {
    const cases: Array<[SimActionId, number]> = [
      ['three', 0.4],
      ['midrange', 0.32],
      ['drive', 0.22],
      ['layup', 0.16],
      ['dunk', 0.16],
      ['post', 0.26],
    ];
    for (const [action, maxY] of cases) {
      const plan = buildPossessionPlan(makeEvent({ action, assist: { name: 'x', position: 'PG' } }), 'full', false);
      expect(plan.ball.origin.y).toBeLessThan(maxY); // home attacks the top rim (y small)
    }
    // Away mirrors: an away three sits in the bottom front court (y large).
    const away = buildPossessionPlan(makeEvent({ team: 'away', action: 'three' }), 'full', false);
    expect(away.ball.origin.y).toBeGreaterThan(0.6);
  });

  it('the whole offense is a front-court set at the shot (nobody stranded at mid-court)', () => {
    const plan = buildPossessionPlan(makeEvent({ action: 'three', assist: { name: 'x', position: 'PG' } }), 'full', false);
    const sampleAt = (wps: { atMs: number; frac: { x: number; y: number } }[], t: number) => {
      for (let i = 1; i < wps.length; i++) if (t <= wps[i].atMs) return wps[i - 1].frac;
      return wps[wps.length - 1].frac;
    };
    for (const pos of POSITIONS) {
      const wps = plan.movers[spriteKey('home', pos)];
      expect(wps).toBeDefined();
      const at = sampleAt(wps!, plan.preShotMs);
      expect(at.y).toBeLessThan(0.45); // home offense is in the front court, not past mid-court
    }
  });

  it('reserves rebound time on a miss/block and never passes on them', () => {
    const make = buildPossessionPlan(makeEvent(), 'full', false);
    for (const result of ['miss', 'block'] as QuarterResult[]) {
      const plan = buildPossessionPlan(makeEvent({ result, points: 0 }), 'full', false);
      expect(plan.totalMs).toBeGreaterThan(make.totalMs);
      // A rebounder path steps toward the rim (a mover reaches deep).
      const anyDeep = Object.values(plan.movers).some((p) => p!.some((w) => w.frac.y < 0.2 || w.frac.y > 0.8));
      expect(anyDeep).toBe(true);
    }
  });

  it('highlights compacts to the shooter (+ passer) and stays shorter than full', () => {
    const over = { action: 'three' as SimActionId, isBigPlay: true, assist: { name: 'home-PG', position: 'PG' as const } };
    const hl = buildPossessionPlan(makeEvent(over), 'highlights', false);
    const full = buildPossessionPlan(makeEvent(over), 'full', false);
    expect(hl.movers[spriteKey('home', 'SG')]).toBeDefined(); // shooter
    expect(Object.keys(hl.movers).length).toBeLessThanOrEqual(2);
    expect(hl.totalMs).toBeLessThan(full.totalMs);
  });

  it('highlights blows past a routine (non-scoring, non-big) play', () => {
    const plan = buildPossessionPlan(makeEvent({ result: 'miss', points: 0 }), 'highlights', false);
    expect(plan.totalMs).toBe(60);
    expect(Object.keys(plan.movers).length).toBe(0);
    expect(plan.ball.legs.length).toBe(0);
  });

  it('marks the scorer as the dunker on a dunk', () => {
    const plan = buildPossessionPlan(makeEvent({ action: 'dunk', assist: { name: 'home-PG', position: 'PG' } }), 'full', false);
    expect(plan.dunk).toBe(true);
    expect(plan.shooterKey).toBe(spriteKey('home', 'SG'));
  });
});

describe('motion: hold-and-settle, a ball glued to the handler', () => {
  const sampleAt = (wps: { atMs: number; frac: { x: number; y: number } }[], t: number) => {
    if (t <= wps[0].atMs) return wps[0].frac;
    const last = wps[wps.length - 1];
    if (t >= last.atMs) return last.frac;
    for (let i = 1; i < wps.length; i++) {
      if (t <= wps[i].atMs) {
        const a = wps[i - 1];
        const b = wps[i];
        const f = (t - a.atMs) / (b.atMs - a.atMs || 1);
        return { x: a.frac.x + (b.frac.x - a.frac.x) * f, y: a.frac.y + (b.frac.y - a.frac.y) * f };
      }
    }
    return last.frac;
  };
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

  it('the shooter plants at the shot spot and releases from a dead stop', () => {
    for (const over of [
      { action: 'three' as SimActionId, assist: { name: 'x', position: 'PG' as const } }, // dho (seq 4)
      { action: 'drive' as SimActionId, assist: { name: 'x', position: 'PG' as const } }, // pnr
      { action: 'post' as SimActionId, scorerPosition: 'C' as const, assist: { name: 'x', position: 'SG' as const } }, // postUp
      { action: 'midrange' as SimActionId }, // iso
    ]) {
      const plan = buildPossessionPlan(makeEvent(over), 'full', false);
      const wps = plan.movers[plan.shooterKey]!;
      const arrive = plan.moverBursts[plan.shooterKey]!.endMs;
      // Planted on the spot by its arrive, and pinned exactly to it on release.
      expect(dist(sampleAt(wps, arrive), plan.ball.origin)).toBeLessThan(0.02);
      expect(dist(sampleAt(wps, plan.preShotMs), plan.ball.origin)).toBeLessThan(1e-9);
      // The gather is a settle, not a move: tiny net travel from the plant to the shot.
      expect(dist(sampleAt(wps, arrive), sampleAt(wps, plan.preShotMs))).toBeLessThan(0.02);
    }
  });

  it('off-ball spacers plant early and hold dead still through the shot', () => {
    const plan = buildPossessionPlan(makeEvent({ action: 'three', assist: { name: 'x', position: 'PG' } }), 'full', false);
    let checked = 0;
    for (const pos of POSITIONS) {
      const key = spriteKey('home', pos);
      const b = plan.moverBursts[key];
      const wps = plan.movers[key];
      if (!b || !wps || key === plan.shooterKey) continue;
      if (b.endMs > plan.preShotMs * 0.35) continue; // the late feeder isn't a spacer
      // From the plant all the way to the release: not a pixel of drift.
      expect(dist(sampleAt(wps, b.endMs), sampleAt(wps, plan.preShotMs))).toBeLessThan(1e-9);
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(2); // the set really does have planted spacers
  });

  it('at most three offensive players are moving at any beat', () => {
    const plan = buildPossessionPlan(makeEvent({ action: 'three', assist: { name: 'x', position: 'PG' } }), 'full', false);
    const d = 8;
    for (const frac of [0.3, 0.5, 0.7, 0.85]) {
      const t = plan.preShotMs * frac;
      let moving = 0;
      for (const pos of POSITIONS) {
        const wps = plan.movers[spriteKey('home', pos)];
        if (!wps) continue;
        if (dist(sampleAt(wps, Math.max(0, t - d)), sampleAt(wps, t + d)) > 0.004) moving++;
      }
      expect(moving).toBeLessThanOrEqual(3);
    }
  });

  it('a carried ball rides the dribbler’s exact baked path (never floats off)', () => {
    // A pure iso (seq % 3 === 0, unassisted) is a single carry by the scorer.
    const plan = buildPossessionPlan(makeEvent({ action: 'midrange', seq: 9 }), 'full', false);
    const carry = plan.ball.legs[plan.ball.legs.length - 1];
    expect(carry.kind).toBe('carry');
    expect(carry.path).toBeDefined();
    const wps = plan.movers[plan.shooterKey]!;
    const path = carry.path!;
    expect(path.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < path.length - 1; i++) {
      const atMs = carry.startMs + (carry.ms * i) / (path.length - 1);
      expect(dist(path[i], sampleAt(wps, atMs))).toBeLessThan(1e-9); // exactly on the handler
    }
    expect(path[path.length - 1]).toEqual(plan.ball.origin); // the release pinned to the shot spot
  });

  it('a pass/hand-off/lob stays a straight two-point arc (no dense path)', () => {
    const plan = buildPossessionPlan(makeEvent({ action: 'three', assist: { name: 'x', position: 'PG' } }), 'full', false);
    for (const leg of plan.ball.legs) {
      if (leg.kind === 'carry') expect(leg.path).toBeDefined();
      else expect(leg.path).toBeUndefined();
    }
  });
});

describe('camera plan', () => {
  it('is monotonic, in bounds, and opens/closes wide (full mode)', () => {
    const plan = buildPossessionPlan(makeEvent({ action: 'three', assist: { name: 'home-PG', position: 'PG' } }), 'full', false);
    const keys = plan.camera.keys;
    expect(keys[0]).toEqual({ atMs: 0, center: { x: 0.5, y: 0.5 }, zoom: 1 });
    const last = keys[keys.length - 1];
    expect(last.center).toEqual({ x: 0.5, y: 0.5 });
    expect(last.zoom).toBe(1);
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i].atMs).toBeGreaterThan(keys[i - 1].atMs);
    }
    for (const k of keys) {
      const half = 0.5 / k.zoom;
      expect(k.center.x).toBeGreaterThanOrEqual(half - 1e-9);
      expect(k.center.x).toBeLessThanOrEqual(1 - half + 1e-9);
      expect(k.center.y).toBeGreaterThanOrEqual(half - 1e-9);
    }
  });

  it('frames the attacking half: home pushes up, away pushes down', () => {
    const home = buildPossessionPlan(makeEvent({ team: 'home' }), 'full', false);
    const away = buildPossessionPlan(makeEvent({ team: 'away' }), 'full', false);
    const peakHome = home.camera.keys.reduce((a, b) => (b.zoom > a.zoom ? b : a));
    const peakAway = away.camera.keys.reduce((a, b) => (b.zoom > a.zoom ? b : a));
    expect(peakHome.center.y).toBeLessThan(0.5);
    expect(peakAway.center.y).toBeGreaterThan(0.5);
  });

  it('cameraFollow off holds a fixed wide view', () => {
    const plan = buildPossessionPlan(makeEvent(), 'full', false, undefined, false);
    expect(plan.camera.keys.every((k) => k.zoom === 1 && k.center.x === 0.5 && k.center.y === 0.5)).toBe(true);
  });

  it('cinema pushes in harder than a routine make', () => {
    const cinema = buildPossessionPlan(makeEvent({ action: 'three' }), 'full', true);
    const normal = buildPossessionPlan(makeEvent({ action: 'three' }), 'full', false);
    const peak = (p: PossessionPlan) => p.camera.keys.reduce((m, k) => Math.max(m, k.zoom), 0);
    expect(peak(cinema)).toBeGreaterThan(peak(normal));
  });
});

describe('planDurationMs', () => {
  const speed = 1.6;

  it('scales by speed and holds the cinema slow-mo', () => {
    const normal = buildPossessionPlan(makeEvent(), 'full', false);
    const cinema = buildPossessionPlan(makeEvent(), 'full', true);
    expect(planDurationMs(normal, false, 1)).toBe(scaled(normal.totalMs, 1));
    expect(cinema.timeScale).toBeCloseTo(1.5);
    expect(planDurationMs(cinema, false, 1)).toBe(scaled(cinema.totalMs * 1.5, 1));
    expect(planDurationMs(normal, false, 2.5)).toBeLessThan(planDurationMs(normal, false, 1));
  });

  it('collapses to the snappy legacy gap under reduced motion', () => {
    const make = buildPossessionPlan(makeEvent(), 'full', false);
    const big = buildPossessionPlan(makeEvent({ isBigPlay: true, action: 'dunk' }), 'full', false);
    const miss = buildPossessionPlan(makeEvent({ result: 'miss', points: 0 }), 'full', false);
    expect(planDurationMs(make, true, speed)).toBe(scaled(150, speed));
    expect(planDurationMs(big, true, speed)).toBe(scaled(220, speed));
    expect(planDurationMs(miss, true, speed)).toBe(scaled(90, speed));
  });
});
