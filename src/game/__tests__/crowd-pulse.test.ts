import { describe, it, expect } from 'vitest';
import { computeCrowdPulses, CROWD_PULSE_BUDGET } from '@/game/crowd-pulse';
import { computeMomentum } from '@/game/momentum';
import type { QuarterResult, SimActionId, SimEvent, SimTeamSide } from '@/types/sim';

interface EvOpts {
  points?: number;
  quarter?: number;
  clock?: string;
  callout?: string;
  action?: SimActionId;
  isBigPlay?: boolean;
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
    action: opts.action ?? 'midrange',
    result,
    points,
    homeScore: home,
    awayScore: away,
    successRate: 50,
    isBigPlay: opts.isBigPlay ?? false,
    callout: opts.callout,
    text: '',
    onCourt: {
      home: { PG: '', SG: '', SF: '', PF: '', C: '' },
      away: { PG: '', SG: '', SF: '', PF: '', C: '' },
    },
  };
}

function plan(events: SimEvent[]) {
  return computeCrowdPulses(events, computeMomentum(events));
}

describe('computeCrowdPulses', () => {
  it('marks the home buzzer-beater as the peak', () => {
    reset();
    const events = [
      ev(0, 'away', 'score'),
      ev(1, 'home', 'score', {
        points: 3,
        quarter: 4,
        clock: 'Q4 0:01',
        callout: 'BUZZER BEATER!',
      }),
    ];
    const p = plan(events);
    expect(p.get(1)).toEqual({ tier: 'peak', kind: 'winner' });
  });

  it('gives an OPPONENT buzzer-beater no crowd beat: silence is the read', () => {
    reset();
    const events = [
      ev(0, 'away', 'score', { quarter: 4, clock: 'Q4 1:00' }), // 0-2: away leads
      ev(1, 'home', 'score', { quarter: 4, clock: 'Q4 0:30' }), // 2-2: tie holds the leader
      ev(2, 'away', 'score', {
        points: 3,
        quarter: 4,
        clock: 'Q4 0:01',
        callout: 'BUZZER BEATER!',
      }),
    ];
    const p = plan(events);
    expect(p.get(2)).toBeUndefined();
  });

  it('reads an opponent walk-off lead change as neutral state, never a peak', () => {
    reset();
    const events = [
      ev(0, 'home', 'score', { quarter: 4, clock: 'Q4 0:30' }), // 2-0: home leads
      ev(1, 'away', 'score', {
        points: 3,
        quarter: 4,
        clock: 'Q4 0:01',
        callout: 'BUZZER BEATER!',
      }), // 2-3: the lead flips on the loss
    ];
    const p = plan(events);
    expect(p.get(1)).toEqual({ tier: 'small', kind: 'leadChange' });
  });

  it('marks the home clincher as the peak and never emits two peaks', () => {
    reset();
    const events = [
      ev(0, 'away', 'score'),
      ev(1, 'home', 'score', { points: 3 }),
      ev(2, 'home', 'score', { quarter: 4, clock: 'Q4 0:10' }),
    ];
    const p = plan(events);
    expect(p.get(2)).toEqual({ tier: 'peak', kind: 'winner' });
    const peaks = [...p.values()].filter((v) => v.tier === 'peak');
    expect(peaks).toHaveLength(1);
  });

  it('emits a small beat on the first event of each new quarter', () => {
    reset();
    const events = [
      ev(0, 'home', 'score', { quarter: 1 }),
      ev(1, 'away', 'miss', { quarter: 2 }),
      ev(2, 'home', 'miss', { quarter: 2 }),
      ev(3, 'away', 'score', { quarter: 3 }),
      ev(4, 'home', 'miss', { quarter: 4, clock: 'Q4 8:00' }),
    ];
    const p = plan(events);
    expect(p.get(1)).toEqual({ tier: 'small', kind: 'quarterBreak' });
    expect(p.get(3)).toEqual({ tier: 'small', kind: 'quarterBreak' });
    expect(p.get(4)).toEqual({ tier: 'small', kind: 'quarterBreak' });
    expect(p.get(2)).toBeUndefined();
  });

  it('selects only the first home big play of a quarter', () => {
    reset();
    const events = [
      ev(0, 'home', 'score', { action: 'dunk' }),
      ev(1, 'home', 'score', { action: 'dunk' }),
      ev(2, 'home', 'and-one', { quarter: 2 }),
      ev(3, 'home', 'score', { action: 'dunk', quarter: 2 }),
    ];
    const p = plan(events);
    expect(p.get(0)).toEqual({ tier: 'big', kind: 'bigPlay' });
    expect(p.get(1)).toBeUndefined();
    // Quarter 2's first big is the and-one; it doubles as the chapter beat and
    // the bigger tier wins the seq.
    expect(p.get(2)).toEqual({ tier: 'big', kind: 'bigPlay' });
    expect(p.get(3)).toBeUndefined();
  });

  it('never selects opponent big plays or routine threes', () => {
    reset();
    const events = [
      ev(0, 'away', 'score', { action: 'dunk' }),
      ev(1, 'away', 'and-one'),
      ev(2, 'home', 'score', { action: 'three', points: 3 }), // routine three
      ev(3, 'home', 'miss', { action: 'dunk' }), // missed dunk
    ];
    const p = plan(events);
    expect([...p.values()].filter((v) => v.kind === 'bigPlay')).toHaveLength(0);
  });

  it('lets a clutch three qualify as a big play', () => {
    reset();
    const events = [
      ev(0, 'home', 'score', { action: 'three', points: 3, isBigPlay: true }),
      ev(1, 'away', 'miss'), // keeps the three from doubling as the clincher
    ];
    const p = plan(events);
    expect(p.get(0)).toEqual({ tier: 'big', kind: 'bigPlay' });
  });

  it('fills remaining budget with crunch lead changes only', () => {
    reset();
    const events = [
      ev(0, 'home', 'score'), // 2-0: leader emerges, no change
      ev(1, 'away', 'score', { points: 3 }), // 2-3: change, but not crunch
      ev(2, 'away', 'miss', { quarter: 4, clock: 'Q4 2:30' }), // owns the chapter beat
      ev(3, 'home', 'score', { quarter: 4, clock: 'Q4 2:00' }), // 4-3: crunch change
      ev(4, 'away', 'miss', { quarter: 4, clock: 'Q4 0:30' }), // keeps 3 from clinching
    ];
    const p = plan(events);
    expect(p.get(1)).toBeUndefined();
    expect(p.get(3)?.kind).toBe('leadChange');
    expect(p.get(3)?.tier).toBe('small');
  });

  it('respects the budget on a saturated timeline', () => {
    reset();
    const events: SimEvent[] = [];
    let seq = 0;
    // Alternating scores in a one-possession game create a lead change on nearly
    // every event; dunks everywhere saturate the big-play candidates.
    for (let q = 1; q <= 4; q++) {
      for (let i = 0; i < 10; i++) {
        const team: SimTeamSide = i % 2 === 0 ? 'home' : 'away';
        events.push(
          ev(seq++, team, 'score', {
            points: 3,
            action: 'dunk',
            quarter: q,
            clock: q === 4 ? 'Q4 1:00' : `Q${q} 5:00`,
          })
        );
      }
    }
    const p = plan(events);
    expect(p.size).toBeLessThanOrEqual(CROWD_PULSE_BUDGET);
  });

  it('leaves a blowout with no peak and no lead-change fill', () => {
    reset();
    const events = [
      ev(0, 'home', 'score', { points: 3 }),
      ev(1, 'home', 'score', { points: 3 }),
      ev(2, 'home', 'score', { points: 3 }),
      ev(3, 'home', 'score', { quarter: 4, clock: 'Q4 0:05' }), // pre-margin 9: no clincher
    ];
    const p = plan(events);
    expect([...p.values()].filter((v) => v.tier === 'peak')).toHaveLength(0);
    expect([...p.values()].filter((v) => v.kind === 'leadChange')).toHaveLength(0);
  });
});
