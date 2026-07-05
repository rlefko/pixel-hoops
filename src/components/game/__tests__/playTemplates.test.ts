import { describe, it, expect } from 'vitest';
import {
  TEMPLATES,
  selectTemplate,
  deriveTransition,
  deriveContest,
  assignRoles,
  type TemplateId,
} from '../playTemplates';
import { POSITIONS } from '@/types/roster';
import type { OnCourtFive, QuarterResult, SimActionId, SimEvent } from '@/types/sim';

function five(prefix: string): OnCourtFive {
  return POSITIONS.reduce((acc, pos) => {
    acc[pos] = `${prefix}-${pos}`;
    return acc;
  }, {} as OnCourtFive);
}

function makeEvent(over: Partial<SimEvent> = {}): SimEvent {
  return {
    seq: 5,
    clock: 'Q1 10:00',
    quarter: 1,
    team: 'home',
    scorerName: 'home-SG',
    scorerPosition: 'SG',
    action: 'three' as SimActionId,
    result: 'score' as QuarterResult,
    points: 3,
    homeScore: 3,
    awayScore: 0,
    successRate: 55,
    isBigPlay: false,
    text: 'bucket',
    onCourt: { home: five('home'), away: five('away') },
    ...over,
  };
}

describe('selectTemplate', () => {
  it('maps actions to plausible plays', () => {
    const assist = { name: 'home-PG', position: 'PG' as const };
    expect(selectTemplate(makeEvent({ action: 'post' }))).toBe('postUp');
    expect(selectTemplate(makeEvent({ action: 'dunk' }))).toBe('transition'); // leak-out
    expect(selectTemplate(makeEvent({ action: 'drive', assist }))).toBe('pnr');
    expect(selectTemplate(makeEvent({ action: 'layup', assist }))).toBe('pnr');
    expect(selectTemplate(makeEvent({ action: 'midrange' }))).toBe('iso'); // unassisted
    expect(selectTemplate(makeEvent({ action: 'three' }))).toBe('iso'); // unassisted
    // Assisted jumpers spread across catch-and-shoot sets by seq.
    const sets = new Set([0, 1, 2].map((s) => selectTemplate(makeEvent({ action: 'three', assist, seq: s }))));
    expect(sets).toEqual(new Set(['spotUp', 'dho', 'pindown']));
  });

  it('only returns templates that can dress the event, and the template exists', () => {
    for (const action of ['three', 'midrange', 'drive', 'layup', 'dunk', 'post'] as SimActionId[]) {
      for (const assisted of [true, false]) {
        const e = makeEvent({ action, assist: assisted ? { name: 'home-PG', position: 'PG' } : undefined });
        const id = selectTemplate(e);
        expect(TEMPLATES[id]).toBeDefined();
      }
    }
  });
});

describe('deriveTransition', () => {
  const home = (over: Partial<SimEvent>) => makeEvent({ team: 'home', ...over });
  const away = (over: Partial<SimEvent>) => makeEvent({ team: 'away', ...over });

  it('runs a break off a live-ball turnover the other way', () => {
    expect(deriveTransition(home({}), away({ result: 'steal' }))).toBe(true);
    expect(deriveTransition(home({}), away({ result: 'turnover' }))).toBe(true);
  });
  it('walks it up after a made basket', () => {
    expect(deriveTransition(home({}), away({ result: 'score' }))).toBe(false);
  });
  it('has no transition on the opening possession', () => {
    expect(deriveTransition(home({}), undefined)).toBe(false);
  });
});

describe('deriveContest', () => {
  it('reads blocks and low-percentage shots as contested, kickouts as open', () => {
    expect(deriveContest(makeEvent({ result: 'block', points: 0 }))).toBe('contested');
    expect(deriveContest(makeEvent({ successRate: 30 }))).toBe('contested');
    expect(deriveContest(makeEvent({ successRate: 70, assist: { name: 'home-PG', position: 'PG' } }))).toBe('open');
  });
});

describe('assignRoles', () => {
  it('gives the scorer the terminal role and the assister the feeder role', () => {
    const e = makeEvent({ action: 'three', scorerPosition: 'SF', assist: { name: 'home-PG', position: 'PG' } });
    const template = TEMPLATES[selectTemplate(e)];
    const { posOf, roleOf } = assignRoles(template, e);
    expect(posOf[template.terminal]).toBe('SF');
    if (template.feeder) expect(posOf[template.feeder]).toBe('PG');
    // Every position gets exactly one role; every role a distinct position.
    const positionsUsed = POSITIONS.filter((p) => roleOf[p]);
    expect(positionsUsed.length).toBe(Object.keys(template.roles).length);
    const rolesUsed = new Set(POSITIONS.map((p) => roleOf[p]).filter(Boolean));
    expect(rolesUsed.size).toBe(positionsUsed.length);
  });

  it('fills bigs into big roles (not the ball-handler) by preference', () => {
    // Unassisted, so no position is forced into the feeder role: the fill honors
    // archetype preference, and a guard takes the ball-handler.
    const e = makeEvent({ action: 'midrange', scorerPosition: 'SG', assist: undefined });
    const { roleOf } = assignRoles(TEMPLATES.pnr, e);
    for (const pos of POSITIONS) {
      const role = roleOf[pos];
      if ((pos === 'C' || pos === 'PF') && role) expect(role).not.toBe('ballHandler');
    }
  });

  it('is deterministic', () => {
    const e = makeEvent({ action: 'three', assist: { name: 'home-PG', position: 'PG' } });
    const t = TEMPLATES.spotUp;
    expect(assignRoles(t, e)).toEqual(assignRoles(t, e));
  });
});

describe('templates', () => {
  it('each template has five roles and a valid terminal/feeder', () => {
    for (const id of Object.keys(TEMPLATES) as TemplateId[]) {
      const t = TEMPLATES[id];
      const roleIds = Object.keys(t.roles);
      expect(roleIds.length).toBe(5);
      expect(roleIds).toContain(t.terminal);
      if (t.feeder) expect(roleIds).toContain(t.feeder);
      // The ball's final leg feeds the terminal (the credited assist).
      expect(t.ball[t.ball.length - 1].to).toBe(t.terminal);
      // Ball leg times are ordered fractions ending at 1.0.
      expect(t.ball[t.ball.length - 1].end).toBeCloseTo(1, 5);
    }
  });
});
