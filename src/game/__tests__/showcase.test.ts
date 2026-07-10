import { describe, it, expect } from 'vitest';
import {
  CHASE_HINT,
  MOMENT_ODDS,
  SHOWCASE_CALL_COPY,
  SHOWCASE_CALL_DETAIL,
  activeShowcase,
  momentGap,
  momentOddsLadder,
  momentOddsWord,
  showcaseBias,
  showcaseEligibility,
  showcasePlan,
} from '@/game/showcase';
import {
  allSignatureChallenges,
  momentMet,
  signatureFor,
  type SignatureChallenge,
  type SignatureTemplateId,
} from '@/game/signature';
import { NBA_LEGENDS } from '@/data/nba';
import { DEFAULT_GAME_PLAN, type GamePlan } from '@/types/tactics';
import type { RosterPlayer } from '@/types/roster';
import type { BoxLine, SimEvent } from '@/types/sim';

const TEMPLATES: SignatureTemplateId[] = [
  'takeover',
  'rain',
  'maestro',
  'conductor',
  'wall',
  'glass',
  'pickpocket',
  'clutch',
];

function line(over: Partial<BoxLine>): BoxLine {
  return {
    name: 'Legend', slot: 'SG', starter: true,
    pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
    seconds: 1200, energy: 60, load: 40,
    ...over,
  };
}

function q4Event(scorerName: string, points: number, quarter = 4): SimEvent {
  return {
    seq: 1,
    clock: `Q${quarter} 2:00`,
    quarter,
    team: 'home',
    scorerName,
    scorerPosition: 'SG',
    action: 'midrange',
    result: 'score',
    points,
    homeScore: points,
    awayScore: 0,
    successRate: 50,
    isBigPlay: false,
    text: `${scorerName} hits the midrange`,
    onCourt: {
      home: { PG: 'a', SG: scorerName, SF: 'c', PF: 'd', C: 'e' },
      away: { PG: 'v', SG: 'w', SF: 'x', PF: 'y', C: 'z' },
    },
  } as SimEvent;
}

function challengeOf(templateId: SignatureTemplateId): SignatureChallenge {
  const legend = NBA_LEGENDS.find(
    (l) => signatureFor(l).templateId === templateId
  );
  expect(legend, `a legend with template ${templateId} exists`).toBeDefined();
  return signatureFor(legend!);
}

describe('showcase bias packages', () => {
  it('covers all eight templates with well-formed, bounded packages', () => {
    for (const t of TEMPLATES) {
      const b = showcaseBias(t);
      expect(b.usageMult).toBeGreaterThan(0);
      expect(b.usageMult).toBeLessThanOrEqual(2);
      expect(b.assistRateMult).toBeGreaterThanOrEqual(1);
      expect(b.assistPickMult).toBeGreaterThanOrEqual(1);
      expect(b.stealPickMult).toBeGreaterThanOrEqual(1);
      expect(b.reboundPickMult).toBeGreaterThanOrEqual(1);
      expect(b.rimFunnelMult).toBeGreaterThanOrEqual(1);
      // Every cost entry is a tax, never a hidden buff.
      for (const v of Object.values(b.costDelta)) expect(v).toBeLessThan(0);
      // Every call has its card language.
      expect(SHOWCASE_CALL_COPY[t].length).toBeGreaterThan(5);
      expect(SHOWCASE_CALL_DETAIL[t].length).toBeGreaterThan(10);
      expect(CHASE_HINT[t].length).toBeGreaterThan(10);
    }
  });

  it('maestro inverts usage (the assists-credit-non-scorers lever)', () => {
    expect(showcaseBias('maestro').usageMult).toBeLessThan(1);
    expect(showcaseBias('maestro').assistPickMult).toBeGreaterThan(1);
  });

  it('every call pays a cost: a tax delta, or the wall funnel conceding rim looks', () => {
    for (const t of TEMPLATES) {
      const b = showcaseBias(t);
      const taxed = Object.keys(b.costDelta).length > 0;
      expect(taxed || b.rimFunnelMult > 1, `${t} is never free`).toBe(true);
    }
  });
});

describe('activeShowcase (the on-court gate)', () => {
  const legendRp = { player: { name: 'Chase Legend' } } as RosterPlayer;
  const otherRp = { player: { name: 'Someone Else' } } as RosterPlayer;
  const plan: GamePlan = {
    ...DEFAULT_GAME_PLAN,
    showcase: { playerName: 'Chase Legend', templateId: 'takeover' },
  };

  it('resolves the showcased player by name within the five', () => {
    const active = activeShowcase(plan, [otherRp, legendRp]);
    expect(active?.index).toBe(1);
    expect(active?.bias.usageMult).toBe(showcaseBias('takeover').usageMult);
  });

  it('is null with no call armed, and null while the player sits', () => {
    expect(activeShowcase(DEFAULT_GAME_PLAN, [legendRp])).toBeNull();
    expect(activeShowcase(plan, [otherRp, otherRp])).toBeNull();
  });
});

describe('showcaseEligibility (qualification with reasons)', () => {
  const pantheon = { floor: 'insane', stage: 'boss' } as const;
  const great = { floor: 'medium', stage: 'any' } as const;

  it('demands the S ladder first', () => {
    const r = showcaseEligibility(pantheon, 'insane', 'A', 'boss');
    expect(r).toEqual({ ok: false, reason: 'S LADDER AND UP' });
  });

  it('demands the tier floor, one-directionally', () => {
    const below = showcaseEligibility(pantheon, 'hard', 'S', 'boss');
    expect(below).toEqual({ ok: false, reason: 'NEEDS INSANE OR HIGHER' });
    const above = showcaseEligibility(great, 'insane', 'S+', 'game');
    expect(above).toEqual({ ok: true });
  });

  it('demands the stage, with the exact copy', () => {
    expect(showcaseEligibility(pantheon, 'insane', 'S', 'elite')).toEqual({
      ok: false,
      reason: 'BOSS GAMES ONLY',
    });
    expect(
      showcaseEligibility({ floor: 'hard', stage: 'elite' }, 'hard', 'S', 'game')
    ).toEqual({ ok: false, reason: 'ELITE OR BOSS GAMES ONLY' });
    expect(showcaseEligibility(pantheon, 'insane', 'S', 'boss')).toEqual({ ok: true });
  });
});

describe('momentGap (the quantitative near-miss read)', () => {
  it('reads every counting template and agrees with momentMet on qualifying games', () => {
    for (const t of TEMPLATES) {
      const ch = challengeOf(t);
      // A monster line that clears every axis of every template.
      const bigLine = line({
        name: ch.legendName,
        pts: 40, tpm: 6, ast: 15, tov: 0, blk: 6, reb: 18, stl: 6,
      });
      const events = [q4Event(ch.legendName, 3), q4Event(ch.legendName, 3), q4Event(ch.legendName, 3)];
      const gap = momentGap(ch, bigLine, events);
      expect(gap, `${t} gap`).not.toBeNull();
      expect(gap!.met, `${t} met on a monster line`).toBe(true);
      const met = momentMet(ch, {
        difficulty: ch.floor,
        ladderClass: 'S',
        nodeType: ch.stage === 'any' ? 'game' : ch.stage,
        line: bigLine,
        events,
      });
      expect(gap!.met, `${t} agrees with momentMet`).toBe(met);
    }
  });

  it('a blank line misses every template, and agrees with momentMet', () => {
    for (const t of TEMPLATES) {
      const ch = challengeOf(t);
      // maxTov is satisfied by a zero line, but the atLeast axis never is.
      const gap = momentGap(ch, line({ name: ch.legendName }), []);
      expect(gap!.met, `${t} blank line misses`).toBe(false);
    }
  });

  it('shows the exact gap: 22/24 PTS on a takeover card', () => {
    const ch = challengeOf('takeover');
    const target = ch.params.pts!;
    const gap = momentGap(ch, line({ name: ch.legendName, pts: target - 2 }));
    expect(gap!.parts).toEqual([
      { unit: 'PTS', actual: target - 2, target, kind: 'atLeast', ok: false },
    ]);
  });

  it('maestro carries both axes: assists reached but turnovers blown = not met', () => {
    const ch = challengeOf('maestro');
    const gap = momentGap(
      ch,
      line({ name: ch.legendName, ast: ch.params.ast!, tov: (ch.params.maxTov ?? 0) + 1 })
    );
    expect(gap!.met).toBe(false);
    expect(gap!.parts.find((p) => p.unit === 'AST')?.ok).toBe(true);
    expect(gap!.parts.find((p) => p.unit === 'TOV')?.ok).toBe(false);
  });

  it('clutch reads the play-by-play, and returns null without one', () => {
    const ch = challengeOf('clutch');
    const target = ch.params.q4pts!;
    const events = Array.from({ length: target }, () => q4Event(ch.legendName, 1));
    expect(momentGap(ch, line({ name: ch.legendName }), events)!.met).toBe(true);
    expect(momentGap(ch, line({ name: ch.legendName }))).toBeNull();
  });

  it('never checked in (no line / zero seconds) reads null', () => {
    const ch = challengeOf('takeover');
    expect(momentGap(ch, undefined)).toBeNull();
    expect(momentGap(ch, line({ name: ch.legendName, seconds: 0 }))).toBeNull();
  });
});

describe('the odds ladder (qualitative, never a percentage)', () => {
  it('maps rates onto the four rungs at the documented cuts', () => {
    expect(momentOddsWord(0.05)).toBe('A LONG SHOT');
    expect(momentOddsWord(0.12)).toBe("A PUNCHER'S CHANCE");
    expect(momentOddsWord(0.3)).toBe('A LIVE LOOK');
    expect(momentOddsWord(0.55)).toBe('HIS KIND OF NIGHT');
  });

  it('every template/tier cell is measured, lifts, and stays under the gift line', () => {
    for (const t of TEMPLATES) {
      for (const tier of [1, 2, 3] as const) {
        const { base, showcased } = MOMENT_ODDS[t][tier];
        expect(showcased, `${t} T${tier} showcased > base`).toBeGreaterThan(base);
        // The calibration ceiling: a showcased moment is never a gift.
        expect(showcased, `${t} T${tier} under the 0.70 ceiling`).toBeLessThanOrEqual(0.7);
        expect(base, `${t} T${tier} base above the dead-letter floor`).toBeGreaterThan(0);
      }
      // The ladder never renders a nonsense word.
      const ladder = momentOddsLadder(t, 3);
      expect(ladder.base.length).toBeGreaterThan(3);
    }
  });
});

describe('showcasePlan', () => {
  it('builds the plan from a challenge (name + template)', () => {
    const all = allSignatureChallenges();
    for (const ch of all.slice(0, 5)) {
      expect(showcasePlan(ch)).toEqual({
        playerName: ch.legendName,
        templateId: ch.templateId,
      });
    }
  });
});
