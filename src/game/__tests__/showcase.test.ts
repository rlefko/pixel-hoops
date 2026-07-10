import { describe, it, expect } from 'vitest';
import {
  CHASE_HINT,
  MOMENT_ODDS,
  SHOWCASE_CALL_COPY,
  SHOWCASE_CALL_DETAIL,
  activeShowcase,
  momentOddsLadder,
  momentOddsWord,
  showcaseBias,
  showcaseEligibility,
  showcasePlan,
} from '@/game/showcase';
import {
  allSignatureChallenges,
  momentGap,
  momentMet,
  signatureFor,
  type SignatureChallenge,
  type SignatureTemplateId,
} from '@/game/signature';
import { NBA_LEGENDS } from '@/data/nba';
import { computeUsageWeights } from '@/game/lineup';
import { createRNG } from '@/game/rng';
import { DEFAULT_GAME_PLAN, type GamePlan } from '@/types/tactics';
import { POSITIONS, POSITION_ARCHETYPE, type RosterPlayer } from '@/types/roster';
import { createPlayer } from '@/types/player';
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

describe('the showcase usage lever under a star coach', () => {
  const five = (): RosterPlayer[] =>
    POSITIONS.map((position, i) => ({
      player: createPlayer(`P${i}`, POSITION_ARCHETYPE[position], createRNG(`sc-five-${i}`).int),
      position,
    }));

  it('an up-call never demotes the star coach feature on the same player', () => {
    const players = five();
    // The coach stars slot 2; the takeover call (1.2x) lands on the same player.
    const coachOnly: GamePlan = { ...DEFAULT_GAME_PLAN, starPlayerIndex: 2 };
    const both: GamePlan = {
      ...coachOnly,
      showcase: { playerName: players[2].player.name, templateId: 'takeover' },
    };
    const coachShare = computeUsageWeights(players, coachOnly)[2];
    const bothShare = computeUsageWeights(players, both)[2];
    // The call keeps the coach's 1.6x (never a demotion to 1.2x, which would
    // make arming strictly worse for the chase it advertises helping).
    expect(bothShare).toBeCloseTo(coachShare, 10);
  });

  it("the table-setter's down-call keeps its deliberate inversion", () => {
    const players = five();
    const coachOnly: GamePlan = { ...DEFAULT_GAME_PLAN, starPlayerIndex: 2 };
    const maestro: GamePlan = {
      ...coachOnly,
      showcase: { playerName: players[2].player.name, templateId: 'maestro' },
    };
    expect(computeUsageWeights(players, maestro)[2]).toBeLessThan(
      computeUsageWeights(players, coachOnly)[2]
    );
  });

  it('a star coach aiming a DIFFERENT player keeps both features', () => {
    const players = five();
    const plan: GamePlan = {
      ...DEFAULT_GAME_PLAN,
      starPlayerIndex: 1,
      showcase: { playerName: players[3].player.name, templateId: 'takeover' },
    };
    const base = computeUsageWeights(players, DEFAULT_GAME_PLAN);
    const withPlan = computeUsageWeights(players, plan);
    expect(withPlan[1]).toBeGreaterThan(base[1]);
    expect(withPlan[3]).toBeGreaterThan(base[3]);
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
    const gap = momentGap(ch, line({ name: ch.legendName, pts: target - 2 }), []);
    expect(gap!.parts).toEqual([
      { unit: 'PTS', actual: target - 2, target, kind: 'atLeast', ok: false },
    ]);
  });

  it('maestro carries both axes: assists reached but turnovers blown = not met', () => {
    const ch = challengeOf('maestro');
    const gap = momentGap(
      ch,
      line({ name: ch.legendName, ast: ch.params.ast!, tov: (ch.params.maxTov ?? 0) + 1 }),
      []
    );
    expect(gap!.met).toBe(false);
    expect(gap!.parts.find((p) => p.unit === 'AST')?.ok).toBe(true);
    expect(gap!.parts.find((p) => p.unit === 'TOV')?.ok).toBe(false);
  });

  it('clutch reads the play-by-play; an empty timeline reads zero, never met', () => {
    const ch = challengeOf('clutch');
    const target = ch.params.q4pts!;
    const events = Array.from({ length: target }, () => q4Event(ch.legendName, 1));
    expect(momentGap(ch, line({ name: ch.legendName }), events)!.met).toBe(true);
    expect(momentGap(ch, line({ name: ch.legendName }), [])!.met).toBe(false);
  });

  it('never checked in (no line / zero seconds) reads null', () => {
    const ch = challengeOf('takeover');
    expect(momentGap(ch, undefined, [])).toBeNull();
    expect(momentGap(ch, line({ name: ch.legendName, seconds: 0 }), [])).toBeNull();
  });
});

describe('the odds ladder (qualitative, never a percentage)', () => {
  it('maps rates onto the four rungs at the documented cuts', () => {
    expect(momentOddsWord(0.05)).toBe('A LONG SHOT');
    expect(momentOddsWord(0.12)).toBe("A PUNCHER'S CHANCE");
    expect(momentOddsWord(0.3)).toBe('A LIVE LOOK');
    expect(momentOddsWord(0.55)).toBe('HIS KIND OF NIGHT');
  });

  it('every template/tier cell is measured and the word never demotes under the call', () => {
    const RANK = ['A LONG SHOT', "A PUNCHER'S CHANCE", 'A LIVE LOOK', 'HIS KIND OF NIGHT'];
    for (const t of TEMPLATES) {
      for (const tier of [1, 2, 3] as const) {
        const { base, showcased } = MOMENT_ODDS[t][tier];
        // The call never reads as hurting the chase (a flat cell is honest: the
        // T3 conductor tension nets near-zero), and no cell is a dead letter or
        // a certainty. The hard ceilings live in the signature-sim harness; this
        // table is the card's display read.
        expect(showcased, `${t} T${tier} never demotes`).toBeGreaterThanOrEqual(base);
        expect(base, `${t} T${tier} base above the dead-letter floor`).toBeGreaterThan(0);
        expect(showcased, `${t} T${tier} never a certainty`).toBeLessThan(1);
        const ladder = momentOddsLadder(t, tier);
        expect(
          RANK.indexOf(ladder.showcased),
          `${t} T${tier} word never demotes`
        ).toBeGreaterThanOrEqual(RANK.indexOf(ladder.base));
      }
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
