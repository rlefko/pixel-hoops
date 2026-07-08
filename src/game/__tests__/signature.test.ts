import { describe, it, expect } from 'vitest';
import {
  SIGNATURE_TIER_NAMES,
  allSignatureChallenges,
  meetsSignatureFloor,
  momentMet,
  signatureByKey,
  signatureFor,
  signatureTier,
  stageAllows,
  type SignatureChallenge,
} from '@/game/signature';
import { NBA_LEGENDS } from '@/data/nba';
import { nameKey } from '@/types/roster';
import type { BoxLine, SimEvent } from '@/types/sim';

function line(over: Partial<BoxLine>): BoxLine {
  return {
    name: 'Legend', slot: 'SG', starter: true,
    pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
    seconds: 1200, energy: 60, load: 40,
    ...over,
  };
}

/** The context of a qualifying won game (floor met, stage met, minutes logged). */
function ctx(ch: SignatureChallenge, over: Partial<Parameters<typeof momentMet>[1]> = {}) {
  return {
    difficulty: ch.floor,
    ladderClass: 'S' as const,
    nodeType: (ch.stage === 'any' ? 'game' : ch.stage) as 'game' | 'elite' | 'boss',
    line: line({ name: ch.legendName }),
    ...over,
  };
}

describe('signature derivation (all 92 legends)', () => {
  const all = allSignatureChallenges();

  it('is total, unique, and priced: every legend gets exactly one well-formed card', () => {
    expect(all).toHaveLength(NBA_LEGENDS.length);
    expect(new Set(all.map((ch) => ch.legendKey)).size).toBe(all.length);
    for (const ch of all) {
      expect(ch.text.length).toBeGreaterThan(10);
      expect(['medium', 'hard', 'insane']).toContain(ch.floor);
      expect(['any', 'elite', 'boss']).toContain(ch.stage);
      expect(Object.values(ch.params).every((v) => v === undefined || v >= 0)).toBe(true);
    }
    // The null-playstyle legend (no baked tendency) still derives a challenge.
    const untagged = NBA_LEGENDS.filter((l) => !l.tendency?.playstyle);
    expect(untagged.length).toBeGreaterThan(0);
    for (const l of untagged) {
      expect(signatureByKey(nameKey(l.name, l.position))).toBeDefined();
    }
  });

  it('tiers derive from the baked overall: 21 GREAT / 47 ICON / 24 PANTHEON', () => {
    expect(signatureTier(92)).toBe(1);
    expect(signatureTier(93)).toBe(2);
    expect(signatureTier(96)).toBe(2);
    expect(signatureTier(97)).toBe(3);
    const byTier = { 1: 0, 2: 0, 3: 0 };
    for (const ch of all) byTier[ch.tier]++;
    expect(byTier).toEqual({ 1: 21, 2: 47, 3: 24 });
    expect(SIGNATURE_TIER_NAMES[3]).toBe('PANTHEON');
  });

  it('escalates floor and stage with tier (medium/any, hard/elite, insane/boss)', () => {
    for (const ch of all) {
      if (ch.tier === 1) expect([ch.floor, ch.stage]).toEqual(['medium', 'any']);
      if (ch.tier === 2) expect([ch.floor, ch.stage]).toEqual(['hard', 'elite']);
      if (ch.tier === 3) expect([ch.floor, ch.stage]).toEqual(['insane', 'boss']);
    }
  });

  it('spreads the pool across templates (no single condition dominates the board)', () => {
    const counts = new Map<string, number>();
    for (const ch of all) counts.set(ch.templateId, (counts.get(ch.templateId) ?? 0) + 1);
    expect(counts.size).toBeGreaterThanOrEqual(6);
    for (const n of counts.values()) expect(n).toBeLessThanOrEqual(30);
  });

  it('pins every derived card (tuning shows up loudly in review; regeneratable)', () => {
    const rendered = all.map(
      (ch) =>
        `${ch.legendName} [T${ch.tier} ${ch.floor}/${ch.stage}] ${ch.templateId}: ${ch.text}`
    );
    expect(rendered).toMatchSnapshot();
  });

  it('honors hand-authored overrides (Jordan is the CLUTCH GENE)', () => {
    const mj = NBA_LEGENDS.find((l) => l.slug === 'michael-jordan')!;
    expect(signatureFor(mj).templateId).toBe('clutch');
  });
});

describe('the signature floor (one-directional, S-ladders only)', () => {
  const floor = { floor: 'hard' as const };

  it('credits at and above the floor, never below', () => {
    expect(meetsSignatureFloor(floor, 'hard', 'S')).toBe(true);
    expect(meetsSignatureFloor(floor, 'insane', 'S')).toBe(true);
    expect(meetsSignatureFloor(floor, 'medium', 'S')).toBe(false);
    expect(meetsSignatureFloor(floor, 'easy', 'S')).toBe(false);
  });

  it('demands the S or S+ ladder (legends live at the top of the board)', () => {
    expect(meetsSignatureFloor(floor, 'insane', 'S+')).toBe(true);
    expect(meetsSignatureFloor(floor, 'insane', 'A')).toBe(false);
    expect(meetsSignatureFloor(floor, 'insane', 'C')).toBe(false);
  });

  it('stages gate node tiers one-directionally too', () => {
    expect(stageAllows('any', 'game')).toBe(true);
    expect(stageAllows('elite', 'game')).toBe(false);
    expect(stageAllows('elite', 'boss')).toBe(true);
    expect(stageAllows('boss', 'elite')).toBe(false);
    expect(stageAllows('boss', 'boss')).toBe(true);
  });
});

describe('momentMet truth tables', () => {
  const bySlug = (slug: string) =>
    allSignatureChallenges().find((ch) => ch.slug === slug)!;
  const byTemplate = (id: SignatureChallenge['templateId']) =>
    allSignatureChallenges().find((ch) => ch.templateId === id)!;

  it('counting templates read the legend box line, boundary-exact', () => {
    const cases: [SignatureChallenge['templateId'], keyof BoxLine, keyof SignatureChallenge['params']][] = [
      ['takeover', 'pts', 'pts'],
      ['rain', 'tpm', 'threes'],
      ['wall', 'blk', 'blk'],
      ['glass', 'reb', 'reb'],
      ['pickpocket', 'stl', 'stl'],
    ];
    for (const [tpl, field, param] of cases) {
      const ch = byTemplate(tpl);
      const need = ch.params[param]!;
      expect(momentMet(ch, ctx(ch, { line: line({ name: ch.legendName, [field]: need }) }))).toBe(true);
      expect(momentMet(ch, ctx(ch, { line: line({ name: ch.legendName, [field]: need - 1 }) }))).toBe(false);
    }
  });

  it('maestro demands the assists AND the clean handle', () => {
    const ch = byTemplate('maestro');
    const need = ch.params.ast!;
    const clean = line({ name: ch.legendName, ast: need, tov: ch.params.maxTov! });
    const sloppy = line({ name: ch.legendName, ast: need, tov: ch.params.maxTov! + 1 });
    expect(momentMet(ch, ctx(ch, { line: clean }))).toBe(true);
    expect(momentMet(ch, ctx(ch, { line: sloppy }))).toBe(false);
  });

  it('conductor demands points AND assists together', () => {
    const ch = byTemplate('conductor');
    const both = line({ name: ch.legendName, pts: ch.params.pts!, ast: ch.params.ast! });
    const onlyPts = line({ name: ch.legendName, pts: ch.params.pts!, ast: ch.params.ast! - 1 });
    expect(momentMet(ch, ctx(ch, { line: both }))).toBe(true);
    expect(momentMet(ch, ctx(ch, { line: onlyPts }))).toBe(false);
  });

  it('clutch counts the legend`s 4th-quarter points off the timeline', () => {
    const ch = bySlug('michael-jordan');
    const need = ch.params.q4pts!;
    const ev = (quarter: number, points: number, scorerName: string): SimEvent =>
      ({
        seq: 0, clock: 'Q4 1:00', quarter, team: 'home', scorerName, scorerPosition: 'SG',
        action: 'midrange', result: 'score', points, homeScore: 0, awayScore: 0,
        successRate: 50, isBigPlay: true, text: '',
        onCourt: { home: [], away: [] },
      }) as unknown as SimEvent;
    const enough = Array.from({ length: need }, () => ev(4, 1, ch.legendName));
    const early = Array.from({ length: need }, () => ev(3, 1, ch.legendName));
    const someoneElse = Array.from({ length: need }, () => ev(4, 1, 'Role Player'));
    expect(momentMet(ch, ctx(ch, { events: enough }))).toBe(true);
    expect(momentMet(ch, ctx(ch, { events: early }))).toBe(false);
    expect(momentMet(ch, ctx(ch, { events: someoneElse }))).toBe(false);
    expect(momentMet(ch, ctx(ch, { events: undefined }))).toBe(false);
  });

  it('never fires below the floor, off-stage, or from the bench', () => {
    const ch = byTemplate('takeover');
    const big = line({ name: ch.legendName, pts: 99 });
    expect(momentMet(ch, ctx(ch, { line: big, difficulty: 'easy' }))).toBe(false);
    expect(momentMet(ch, ctx(ch, { line: big, ladderClass: 'A' as never }))).toBe(false);
    expect(momentMet(ch, ctx(ch, { line: { ...big, seconds: 0 } }))).toBe(false);
    expect(momentMet(ch, ctx(ch, { line: undefined }))).toBe(false);
    const pantheon = allSignatureChallenges().find((c) => c.stage === 'boss')!;
    expect(
      momentMet(pantheon, {
        difficulty: 'insane',
        ladderClass: 'S',
        nodeType: 'game',
        line: line({ name: pantheon.legendName, pts: 99, tpm: 9, reb: 20, ast: 20, blk: 9, stl: 9 }),
      })
    ).toBe(false);
  });
});
