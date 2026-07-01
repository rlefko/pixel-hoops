import { describe, it, expect } from 'vitest';
import { computeMomentum } from '@/game/momentum';
import type { QuarterResult, SimEvent, SimTeamSide } from '@/types/sim';

interface EvOpts {
  points?: number;
  quarter?: number;
  clock?: string;
  callout?: string;
}

let home = 0;
let away = 0;

function reset(): void {
  home = 0;
  away = 0;
}

function ev(seq: number, team: SimTeamSide, result: QuarterResult, opts: EvOpts = {}): SimEvent {
  const points = opts.points ?? (result === 'score' || result === 'and-one' ? 2 : 0);
  if (team === 'home') home += points;
  else away += points;
  return {
    seq,
    clock: opts.clock ?? 'Q1 6:00',
    quarter: opts.quarter ?? 1,
    team,
    scorerName: team === 'home' ? 'Ace' : 'Foe',
    scorerPosition: 'PG',
    action: 'midrange',
    result,
    points,
    homeScore: home,
    awayScore: away,
    successRate: 50,
    isBigPlay: false,
    callout: opts.callout,
    text: '',
    onCourt: {
      home: { PG: '', SG: '', SF: '', PF: '', C: '' },
      away: { PG: '', SG: '', SF: '', PF: '', C: '' },
    },
  };
}

describe('computeMomentum', () => {
  it('tracks unanswered points and fires the 6-0 milestone exactly once', () => {
    reset();
    const events = [
      ev(0, 'home', 'score'), // 2-0
      ev(1, 'home', 'score'), // 4-0
      ev(2, 'home', 'score'), // 6-0 -> milestone
      ev(3, 'home', 'score'), // 8-0, no new milestone until 10
    ];
    const m = computeMomentum(events);
    expect(m.get(1)).toMatchObject({ runPts: 4, runTeam: 'home', runMilestone: undefined });
    expect(m.get(2)).toMatchObject({ runPts: 6, runTeam: 'home', runMilestone: 6 });
    expect(m.get(3)).toMatchObject({ runPts: 8, runMilestone: undefined });
  });

  it('ends a run when the other side scores, and misses do not end it', () => {
    reset();
    const events = [
      ev(0, 'home', 'score'), // 2-0
      ev(1, 'away', 'miss'), // run survives the miss
      ev(2, 'home', 'score'), // 4-0
      ev(3, 'away', 'score'), // run flips to away
    ];
    const m = computeMomentum(events);
    expect(m.get(2)).toMatchObject({ runPts: 4, runTeam: 'home' });
    expect(m.get(3)).toMatchObject({ runPts: 2, runTeam: 'away' });
  });

  it('reaches 10-0 across a mid-run miss and fires the second milestone', () => {
    reset();
    const events = [
      ev(0, 'home', 'score', { points: 3 }), // 3-0
      ev(1, 'home', 'score', { points: 3 }), // 6-0 -> milestone 6
      ev(2, 'home', 'miss'),
      ev(3, 'home', 'score', { points: 2 }), // 8-0
      ev(4, 'home', 'score', { points: 2 }), // 10-0 -> milestone 10
    ];
    const m = computeMomentum(events);
    expect(m.get(1)?.runMilestone).toBe(6);
    expect(m.get(4)?.runMilestone).toBe(10);
  });

  it('flags a lead change only when a new leader emerges', () => {
    reset();
    const events = [
      ev(0, 'home', 'score'), // 2-0: first leader, not a change
      ev(1, 'away', 'score'), // 2-2: tie, leader held
      ev(2, 'away', 'score'), // 2-4: away takes over -> change
      ev(3, 'away', 'score'), // 2-6: still away
      ev(4, 'home', 'score', { points: 3 }), // 5-6
      ev(5, 'home', 'score', { points: 2 }), // 7-6 -> change
    ];
    const m = computeMomentum(events);
    expect(m.get(0)?.leadChange).toBe(false);
    expect(m.get(1)?.leadChange).toBe(false);
    expect(m.get(2)?.leadChange).toBe(true);
    expect(m.get(3)?.leadChange).toBe(false);
    expect(m.get(5)?.leadChange).toBe(true);
  });

  it('marks crunch only in a close Q4 inside the final four minutes', () => {
    reset();
    const events = [
      ev(0, 'home', 'score', { quarter: 4, clock: 'Q4 6:30' }), // too early
      ev(1, 'away', 'score', { quarter: 4, clock: 'Q4 3:10' }), // close and late
      ev(2, 'home', 'score', { quarter: 1, clock: 'Q1 1:00' }), // wrong quarter
    ];
    const m = computeMomentum(events);
    expect(m.get(0)?.crunch).toBe(false);
    expect(m.get(1)?.crunch).toBe(true);
    expect(m.get(2)?.crunch).toBe(false);
  });

  it('does not mark crunch in a Q4 blowout', () => {
    reset();
    const events = [
      ev(0, 'home', 'score', { points: 3 }),
      ev(1, 'home', 'score', { points: 3 }),
      ev(2, 'home', 'score', { points: 3 }), // 9-0 entering the next event
      ev(3, 'home', 'score', { quarter: 4, clock: 'Q4 2:00' }), // pre-margin 9
    ];
    const m = computeMomentum(events);
    expect(m.get(3)?.crunch).toBe(false);
  });

  it("flags the winner's final bucket in a tight finish as the clincher", () => {
    reset();
    const events = [
      ev(0, 'home', 'score', { points: 3 }), // 3-0
      ev(1, 'away', 'score', { points: 2 }), // 3-2
      ev(2, 'home', 'score', { quarter: 4, clock: 'Q4 0:14' }), // 5-2, pre-margin 1
    ];
    const m = computeMomentum(events);
    expect(m.get(2)?.clincher).toBe(true);
  });

  it('leaves the clincher to the buzzer-beater callout when the sim fired one', () => {
    reset();
    const events = [
      ev(0, 'away', 'score', { points: 2 }), // 0-2
      ev(1, 'home', 'score', { points: 3, quarter: 4, clock: 'Q4 0:01', callout: 'BUZZER BEATER!' }),
    ];
    const m = computeMomentum(events);
    expect(m.get(1)?.clincher).toBe(false);
  });

  it("does not call a loser's late bucket the clincher", () => {
    reset();
    const events = [
      ev(0, 'home', 'score', { points: 3 }), // 3-0
      ev(1, 'away', 'score', { quarter: 4, clock: 'Q4 0:05' }), // 3-2: away still loses
    ];
    const m = computeMomentum(events);
    expect(m.get(1)?.clincher).toBe(false);
  });
});
