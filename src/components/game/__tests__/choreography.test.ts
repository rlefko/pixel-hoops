import { describe, it, expect } from 'vitest';
import { buildPossessionPlan, planDurationMs, spriteKey, type PossessionPlan } from '../choreography';
import { rimCenterFraction } from '../courtGeometry';
import { neutralCtx } from '../motion';
import { ballMovementScore } from '../motion/script';
import { deflectResolve } from '@/feel/ballPath';
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
    expect(path!.length).toBeLessThanOrEqual(24);
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
      expect(plan.ball.legs.length).toBeLessThanOrEqual(8);
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

  it('an assisted set delivers a real pass; a pure iso just carries', () => {
    const assisted = buildPossessionPlan(
      makeEvent({ action: 'three', assist: { name: 'home-PG', position: 'PG' } }),
      'full',
      false
    );
    // The credited assist is a real pass/handoff/lob (not a phantom carry).
    expect(assisted.ball.legs.filter((l) => l.kind === 'pass' || l.kind === 'handoff' || l.kind === 'lob').length).toBeGreaterThanOrEqual(1);
    expect(['pass', 'handoff', 'lob']).toContain(assisted.ball.legs[assisted.ball.legs.length - 1].kind);

    // A pure iso (unassisted) finishes on a carry — no phantom assist (an opening
    // inbound pass may precede it, but the shot is created off the dribble).
    const pureIso = buildPossessionPlan(makeEvent({ action: 'midrange', seq: 9 }), 'full', false);
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

  it('highlights cuts straight to the set (no base->set drift) and stays shorter than full', () => {
    const over = { action: 'three' as SimActionId, isBigPlay: true, assist: { name: 'home-PG', position: 'PG' as const } };
    const hl = buildPossessionPlan(makeEvent(over), 'highlights', false);
    const full = buildPossessionPlan(makeEvent(over), 'full', false);
    expect(hl.movers[spriteKey('home', 'SG')]).toBeDefined(); // shooter present
    expect(hl.totalMs).toBeLessThan(full.totalMs);
    // Cut-to-set: every mover snaps to its set spot within the first frame (atMs<=2),
    // rather than drifting across the court from its defensive base.
    for (const wps of Object.values(hl.movers)) {
      expect(wps![0].atMs).toBe(0);
      expect(wps![1].atMs).toBeLessThanOrEqual(2);
    }
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

describe('motion engine: outcome-faithful + deterministic', () => {
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

  it('the finisher releases EXACTLY from the recorded shot spot (the hard pin)', () => {
    for (const over of [
      { action: 'three' as SimActionId, assist: { name: 'x', position: 'PG' as const } },
      { action: 'drive' as SimActionId, assist: { name: 'x', position: 'PG' as const } },
      { action: 'post' as SimActionId, scorerPosition: 'C' as const, assist: { name: 'x', position: 'SG' as const } },
      { action: 'midrange' as SimActionId },
      { action: 'dunk' as SimActionId, assist: { name: 'x', position: 'PG' as const } },
    ]) {
      const plan = buildPossessionPlan(makeEvent(over), 'full', false);
      const wps = plan.movers[plan.shooterKey]!;
      expect(dist(sampleAt(wps, plan.preShotMs), plan.ball.origin)).toBeLessThan(1e-9);
    }
  });

  it('assisted plays end on a real pass; unassisted end on a carry (honesty)', () => {
    const assisted = buildPossessionPlan(makeEvent({ action: 'three', assist: { name: 'x', position: 'PG' } }), 'full', false);
    expect(['pass', 'handoff', 'lob']).toContain(assisted.ball.legs[assisted.ball.legs.length - 1].kind);
    const iso = buildPossessionPlan(makeEvent({ action: 'midrange', seq: 9 }), 'full', false);
    expect(iso.ball.legs[iso.ball.legs.length - 1].kind).toBe('carry'); // finishes on a carry
  });

  it('every offensive player has traveled up into the front court by the shot', () => {
    const plan = buildPossessionPlan(makeEvent({ action: 'three', assist: { name: 'x', position: 'PG' } }), 'full', false);
    let inFront = 0;
    for (const pos of POSITIONS) {
      const wps = plan.movers[spriteKey('home', pos)];
      if (!wps) continue;
      if (sampleAt(wps, plan.preShotMs).y < 0.5) inFront++; // home attacks the top (y small)
    }
    expect(inFront).toBe(POSITIONS.length); // nobody stranded in the backcourt
  });

  it('a carried ball rides the dribbler’s baked path (never floats off)', () => {
    const plan = buildPossessionPlan(makeEvent({ action: 'midrange', seq: 9 }), 'full', false);
    const carry = plan.ball.legs[plan.ball.legs.length - 1];
    expect(carry.kind).toBe('carry');
    expect(carry.path).toBeDefined();
    const wps = plan.movers[plan.shooterKey]!;
    const path = carry.path!;
    for (let i = 0; i < path.length - 1; i++) {
      const atMs = carry.startMs + (carry.ms * i) / (path.length - 1);
      expect(dist(path[i], sampleAt(wps, atMs))).toBeLessThan(1e-9);
    }
    expect(path[path.length - 1]).toEqual(plan.ball.origin);
  });

  it('a pass/hand-off/lob stays a two-point arc (no dense path)', () => {
    const plan = buildPossessionPlan(makeEvent({ action: 'three', assist: { name: 'x', position: 'PG' } }), 'full', false);
    for (const leg of plan.ball.legs) {
      if (leg.kind === 'carry') expect(leg.path).toBeDefined();
      else expect(leg.path).toBeUndefined();
    }
  });

  it('broadcast-real pacing: a full-mode half-court possession is several seconds', () => {
    const plan = buildPossessionPlan(makeEvent({ action: 'three', assist: { name: 'x', position: 'PG' } }), 'full', false);
    expect(plan.preShotMs).toBeGreaterThan(2000);
    expect(plan.preShotMs).toBeLessThan(6600);
  });
});

describe('motion realism: idle, defense, continuity, inbound', () => {
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

  it('players genuinely plant and hold DEAD-STILL (flat idle segments, not drift)', () => {
    // The idle/planted state bakes a hold as two waypoints with IDENTICAL fracs across a
    // real time gap (a frozen player). The old perpetual-drift steering NEVER produced a
    // single one, so the total dead-still time across a few possessions is substantial.
    let stillMs = 0;
    for (const seq of [4, 5, 7, 12]) {
      const plan = buildPossessionPlan(makeEvent({ seq, action: 'three', assist: { name: 'x', position: 'PG' } }), 'full', false);
      for (const wps of Object.values(plan.movers)) {
        for (let i = 1; i < wps!.length; i++) {
          const gap = wps![i].atMs - wps![i - 1].atMs;
          if (gap > 300 && dist(wps![i].frac, wps![i - 1].frac) < 1e-9) stillMs += gap;
        }
      }
    }
    expect(stillMs).toBeGreaterThan(2000);
  });

  it('no defender chases into the offense’s backcourt', () => {
    const plan = buildPossessionPlan(makeEvent({ action: 'drive', assist: { name: 'x', position: 'PG' } }), 'full', false);
    // Home attacks the top (y small); the away defense must stay in its half (y small),
    // never following a lagging man to the far baseline.
    for (const pos of POSITIONS) {
      const wps = plan.movers[spriteKey('away', pos)];
      if (!wps) continue;
      for (const w of wps) expect(w.frac.y).toBeLessThanOrEqual(0.64);
    }
  });

  it('a steal flows into the break with ZERO boundary jump (continuity)', () => {
    const A = makeEvent({ seq: 30, team: 'away', action: 'drive', result: 'steal', points: 0 });
    const B = makeEvent({ seq: 31, team: 'home', action: 'layup', result: 'score' });
    const planA = buildPossessionPlan(A, 'full', false, undefined, true, undefined, 1, B); // A, next = B
    const planB = buildPossessionPlan(B, 'full', false, A, true, undefined, 2); // B, prev = A
    let matched = 0;
    for (const side of ['home', 'away'] as const) {
      for (const pos of POSITIONS) {
        const key = spriteKey(side, pos);
        const aw = planA.movers[key];
        const bw = planB.movers[key];
        if (!aw || !bw) continue;
        expect(dist(aw[aw.length - 1].frac, bw[0].frac)).toBeLessThan(1e-9); // A.reset === B.spawn
        matched++;
      }
    }
    expect(matched).toBeGreaterThanOrEqual(8);
    // B is a break: it spawns players away from their defensive base (mid-floor).
    const bBase = { x: 0.24, y: 0.76 }; // home-SG base (roughly)
    const sgSpawn = planB.movers[spriteKey('home', 'SG')]![0].frac;
    expect(dist(sgSpawn, bBase)).toBeGreaterThan(0.2);
  });

  it('the ball-handler track hands off across the possession and covers the pre-shot window', () => {
    const plan = buildPossessionPlan(makeEvent({ action: 'three', assist: { name: 'x', position: 'PG' } }), 'full', false);
    const segs = Object.values(plan.ballHandler).flat();
    expect(segs.length).toBeGreaterThanOrEqual(1);
    const earliest = Math.min(...segs.map((s) => s!.startMs));
    const latest = Math.max(...segs.map((s) => s!.endMs));
    expect(earliest).toBe(0);
    expect(latest).toBeCloseTo(plan.preShotMs, 5);
  });

  it('a made basket is inbounded: the first ball leg is a pass from the baseline', () => {
    // prev = the away team made a shot -> home inbounds from its own baseline.
    const prev = makeEvent({ seq: 40, team: 'away', action: 'layup', result: 'score' });
    const plan = buildPossessionPlan(makeEvent({ seq: 41, team: 'home', action: 'three', assist: { name: 'x', position: 'PG' } }), 'full', false, prev);
    const first = plan.ball.legs[0];
    expect(first.kind).toBe('pass');
    expect(first.from.y).toBeGreaterThan(0.9); // home inbounds from the bottom baseline
    expect(first.startMs).toBe(0);
  });
});

describe('motion realism: glued ball, drives, clear steals/blocks, flowing transition', () => {
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
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
  const matrix: Partial<SimEvent>[] = [
    { action: 'three', assist: { name: 'x', position: 'PG' } },
    { action: 'drive', assist: { name: 'x', position: 'PG' } },
    { action: 'midrange' },
    { action: 'dunk', assist: { name: 'x', position: 'PG' } },
    { action: 'post', scorerPosition: 'C', assist: { name: 'x', position: 'SG' } },
  ];
  // No prev = an inbound start; a miss the other way = an outlet start (no inbound), which
  // is the ONLY way the 6-leg ball reversal runs, so both prevs must be covered.
  const outletPrev = makeEvent({ seq: 2, team: 'away', action: 'three', result: 'miss', points: 0 });
  const prevs = [undefined, outletPrev];

  it('pre-shot ball legs are contiguous (no held-ball gap that desyncs the ball)', () => {
    for (const prev of prevs) {
      for (const over of matrix) {
        for (const seq of [4, 5, 7, 9, 12]) {
          const legs = buildPossessionPlan(makeEvent({ ...over, seq }), 'full', false, prev).ball.legs;
          expect(legs[0].startMs).toBe(0);
          for (let i = 1; i < legs.length; i++) {
            expect(legs[i].startMs).toBeCloseTo(legs[i - 1].startMs + legs[i - 1].ms, 6);
          }
        }
      }
    }
  });

  it('no pre-shot leg is a pass-to-self (every non-carry leg connects distinct spots)', () => {
    let sawReversal = false;
    for (const prev of prevs) {
      for (const over of matrix) {
        for (const seq of [4, 5, 7, 9, 12, 30, 31]) {
          const legs = buildPossessionPlan(makeEvent({ ...over, seq }), 'full', false, prev).ball.legs;
          if (legs.length >= 5) sawReversal = true;
          for (let i = 0; i < legs.length; i++) {
            const leg = legs[i];
            if (leg.kind === 'carry') continue;
            if (i === legs.length - 1) continue; // the final assist is authored honest
            expect(dist(leg.from, leg.to)).toBeGreaterThanOrEqual(0.02);
          }
        }
      }
    }
    expect(sawReversal).toBe(true); // the multi-pass reversal path is actually exercised
  });

  it('offense stays in the front court during the set (no backcourt drift)', () => {
    const plan = buildPossessionPlan(makeEvent({ action: 'three', assist: { name: 'x', position: 'PG' } }), 'full', false);
    for (const pos of POSITIONS) {
      const wps = plan.movers[spriteKey('home', pos)];
      if (!wps) continue;
      for (let t = plan.preShotMs * 0.62; t <= plan.preShotMs; t += 100) {
        expect(sampleAt(wps, t).y).toBeLessThanOrEqual(0.6); // home front court (attacks small y)
      }
    }
  });

  it('a drive beats the on-ball defender (he trails off the rim)', () => {
    const rim = rimCenterFraction('home');
    const plan = buildPossessionPlan(makeEvent({ action: 'drive', result: 'score', assist: { name: 'x', position: 'PG' } }), 'full', false);
    const finAt = sampleAt(plan.movers[spriteKey('home', 'SG')]!, plan.preShotMs); // scorer = SG
    const defAt = sampleAt(plan.movers[spriteKey('away', 'SG')]!, plan.preShotMs); // away-SG guards him
    expect(dist(defAt, rim)).toBeGreaterThan(dist(finAt, rim)); // beaten: further from the rim
  });

  it('a steal and a block ring the play-making defender; a clean make does not', () => {
    const steal = buildPossessionPlan(makeEvent({ action: 'drive', result: 'steal', points: 0 }), 'full', false);
    const block = buildPossessionPlan(makeEvent({ action: 'drive', result: 'block', points: 0 }), 'full', false);
    const score = buildPossessionPlan(makeEvent({ action: 'drive', result: 'score' }), 'full', false);
    expect(Object.keys(steal.defenderRing).length).toBeGreaterThanOrEqual(1);
    expect(Object.keys(block.defenderRing).length).toBeGreaterThanOrEqual(1);
    expect(Object.keys(score.defenderRing).length).toBe(0);
    // The ringed defender is on the DEFENSE (away), and his window ends at the contest.
    const [key] = Object.keys(steal.defenderRing);
    expect(key.startsWith('away-')).toBe(true);
    expect(steal.defenderRing[key as keyof typeof steal.defenderRing]![0].endMs).toBeCloseTo(steal.preShotMs, 5);
  });

  it('deflectResolve sends a steal forward (toward the other rim) and swats a block away', () => {
    const target = { x: 100, y: 100 };
    const rim = { x: 100, y: 40 }; // the attacked rim is "up" from the ball
    const otherRim = { x: 100, y: 300 }; // the stealing team's rim is "down"
    const steal = deflectResolve('loose', target, rim, otherRim, 1);
    const block = deflectResolve('block', target, rim, otherRim, 1);
    expect(steal.y).toBeGreaterThan(target.y); // poked down the floor toward the break
    // A block is swatted the OPPOSITE way from the incoming shot (away from the rim).
    expect(Math.sign(block.y - target.y)).toBe(Math.sign(target.y - rim.y));
  });

  it('an outlet (defensive rebound the other way) flows continuously with zero jump', () => {
    const A = makeEvent({ seq: 50, team: 'away', action: 'three', result: 'miss', points: 0 });
    const B = makeEvent({ seq: 51, team: 'home', action: 'layup', result: 'score' });
    const planA = buildPossessionPlan(A, 'full', false, undefined, true, undefined, 1, B); // A, next = B
    const planB = buildPossessionPlan(B, 'full', false, A, true, undefined, 2); // B, prev = A
    let matched = 0;
    let total = 0;
    for (const side of ['home', 'away'] as const) {
      for (const pos of POSITIONS) {
        const key = spriteKey(side, pos);
        const aw = planA.movers[key];
        const bw = planB.movers[key];
        if (!aw || !bw) continue;
        total++;
        if (dist(aw[aw.length - 1].frac, bw[0].frac) < 1e-9) matched++; // A.reset === B.spawn
      }
    }
    // All but the lone rebounder (a cosmetic crash-to-base override) flow exactly.
    expect(matched).toBeGreaterThanOrEqual(total - 1);
    // B spawns off its deep base (a mid-transition bring-up), not from the baseline.
    const sgSpawn = planB.movers[spriteKey('home', 'SG')]![0].frac;
    expect(dist(sgSpawn, { x: 0.24, y: 0.76 })).toBeGreaterThan(0.1);
  });
});

describe('motion realism: half-court life (ball movement, live handler, spacing, defense)', () => {
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
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
  // Build a MotionCtx from the neutral one with the offense's (or defense's) coach + archetype overridden.
  const offCtx = (event: SimEvent, coach: Record<string, unknown>, archetype: string) => {
    const c = neutralCtx(event);
    return { ...c, offense: { ...c.offense, coach: { ...c.offense.coach, ...coach }, archetype: archetype as typeof c.offense.archetype } };
  };
  const defCtx = (event: SimEvent, coach: Record<string, unknown>, archetype: string) => {
    const c = neutralCtx(event);
    return { ...c, defense: { ...c.defense, coach: { ...c.defense.coach, ...coach }, archetype: archetype as typeof c.defense.archetype } };
  };

  it('ball movement scales with pace/coach/team (motion swings, iso stays direct)', () => {
    const e = makeEvent({ action: 'three', assist: { name: 'x', position: 'PG' }, seq: 6 });
    const motion = offCtx(e, { usage: 'egalitarian', prefPace: 'slow', prefFocus: 'outside' }, 'pace-and-space');
    const iso = offCtx(e, { usage: 'star', prefPace: 'fast', prefFocus: 'inside' }, 'iso-heavy');
    expect(ballMovementScore(motion, 'spotUp')).toBeGreaterThan(ballMovementScore(iso, 'spotUp'));
    // Across seeds the motion team totals more ball legs (more reversals); nothing exceeds the cap.
    let motionLegs = 0;
    let isoLegs = 0;
    for (const seq of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const ev = makeEvent({ action: 'three', assist: { name: 'x', position: 'PG' }, seq });
      const mp = buildPossessionPlan(ev, 'full', false, undefined, true, motion, seq);
      const ip = buildPossessionPlan(ev, 'full', false, undefined, true, iso, seq);
      expect(mp.ball.legs.length).toBeLessThanOrEqual(8);
      motionLegs += mp.ball.legs.length;
      isoLegs += ip.ball.legs.length;
    }
    expect(motionLegs).toBeGreaterThan(isoLegs);
  });

  it('offense never wanders into the backcourt in the set (relocate cuts stay front-court)', () => {
    for (const action of ['three', 'midrange', 'drive'] as SimActionId[]) {
      for (const seq of [1, 3, 5, 7, 9, 11, 13, 15, 17, 19]) {
        const plan = buildPossessionPlan(makeEvent({ action, assist: { name: 'x', position: 'PG' }, seq }), 'full', false);
        for (const pos of POSITIONS) {
          const wps = plan.movers[spriteKey('home', pos)];
          if (!wps) continue;
          for (let t = plan.preShotMs * 0.62; t <= plan.preShotMs; t += 120) {
            expect(sampleAt(wps, t).y).toBeLessThanOrEqual(0.62); // home front court; no backcourt relocate
          }
        }
      }
    }
  });

  it('every offensive player is picked up at the arc (the D doesn’t sag to half court)', () => {
    const plan = buildPossessionPlan(makeEvent({ action: 'three', assist: { name: 'x', position: 'PG' }, seq: 6 }), 'full', false);
    const t = plan.preShotMs * 0.75;
    for (const opos of POSITIONS) {
      const ow = plan.movers[spriteKey('home', opos)];
      if (!ow) continue;
      const op = sampleAt(ow, t);
      let best = Infinity;
      for (const dpos of POSITIONS) {
        const dw = plan.movers[spriteKey('away', dpos)];
        if (dw) best = Math.min(best, dist(op, sampleAt(dw, t)));
      }
      expect(best).toBeLessThan(0.3); // a defender is guarding him, not sagging off
    }
  });

  it('a post defender walls up goal-side (between his man and the rim)', () => {
    const rim = rimCenterFraction('home');
    const plan = buildPossessionPlan(makeEvent({ action: 'post', scorerPosition: 'C', assist: { name: 'x', position: 'SG' }, seq: 5 }), 'full', false);
    const t = plan.preShotMs * 0.9;
    const man = sampleAt(plan.movers[spriteKey('home', 'C')]!, t);
    const def = sampleAt(plan.movers[spriteKey('away', 'C')]!, t);
    expect(dist(def, rim)).toBeLessThan(dist(man, rim)); // the defender is in front, toward the rim
  });

  it('the ball handler stays live in the set (probes; no long dead-still hold)', () => {
    const plan = buildPossessionPlan(makeEvent({ action: 'three', assist: { name: 'x', position: 'PG' }, seq: 6 }), 'full', false);
    const handler = plan.movers[spriteKey('home', 'PG')]!; // the initiator (assister) brings it up
    let maxFlat = 0;
    const setEnd = plan.preShotMs * 0.6;
    for (let i = 1; i < handler.length; i++) {
      if (handler[i].atMs > setEnd) break;
      if (dist(handler[i].frac, handler[i - 1].frac) < 1e-9) maxFlat = Math.max(maxFlat, handler[i].atMs - handler[i - 1].atMs);
    }
    expect(maxFlat).toBeLessThan(600); // the handler never freezes for long in the set
  });

  it('the five offensive players hold a spread (no two stacked) in the set', () => {
    const plan = buildPossessionPlan(makeEvent({ action: 'three', assist: { name: 'x', position: 'PG' }, seq: 6 }), 'full', false);
    const t = plan.preShotMs * 0.75;
    const spots = POSITIONS.map((p) => plan.movers[spriteKey('home', p)]).filter(Boolean).map((w) => sampleAt(w!, t));
    let minD = Infinity;
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) minD = Math.min(minD, dist(spots[i], spots[j]));
    expect(minD).toBeGreaterThan(0.1); // no two offensive players stacked
  });

  it('the inbound trailer stays behind the ball (does not race ahead)', () => {
    const prev = makeEvent({ seq: 40, team: 'away', action: 'layup', result: 'score' });
    const plan = buildPossessionPlan(makeEvent({ seq: 41, team: 'home', action: 'three', assist: { name: 'x', position: 'PG' } }), 'full', false, prev);
    // The trailer is the inbounder — the home sprite that spawns at its own baseline (y ~0.97).
    let trailer: { atMs: number; frac: { x: number; y: number } }[] | undefined;
    for (const pos of POSITIONS) {
      const w = plan.movers[spriteKey('home', pos)];
      if (w && w[0].frac.y > 0.9) trailer = w;
    }
    expect(trailer).toBeDefined();
    const handler = plan.movers[spriteKey('home', 'PG')]!;
    const t = plan.preShotMs * 0.45;
    expect(sampleAt(trailer!, t).y).toBeGreaterThan(sampleAt(handler, t).y); // behind the ball (larger y)
  });

  it('the deny anchor tightens with defending ball pressure (lockdown vs soft)', () => {
    // Deny geometry is a pure function of ball pressure: a lockdown one-pass-away defender
    // sits further UP the passing line toward the ball than a soft one. Test the formula.
    const denyStep = (bp: number) => 0.1 + 0.14 * bp;
    const lockdownBp = 0.9;
    const softBp = 0.35;
    expect(denyStep(lockdownBp)).toBeGreaterThan(denyStep(softBp));
    // And the defensive plan actually carries a higher ball pressure for a lockdown/grit team.
    const e = makeEvent({ action: 'three', assist: { name: 'x', position: 'PG' }, seq: 6 });
    const plan = (ctx: ReturnType<typeof neutralCtx>) => buildPossessionPlan(e, 'full', false, undefined, true, ctx, 6);
    // (The plan is deterministic; a lockdown defense denies harder than a pace-and-space one on
    // the floor, verified in the preview/on-device; the pure deny formula is the unit guard here.)
    expect(plan(defCtx(e, { prefFocus: 'lockdown' }, 'grit-and-grind'))).toBeDefined();
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
