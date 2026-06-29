import { describe, it, expect } from 'vitest';
import { createRNG } from '@/game/rng';
import { buildTeam } from '@/game/lineup';
import { simulateGame } from '@/game/simulation';
import {
  counterEdge,
  counterVerdict,
  deriveArchetype,
  type TeamArchetype,
} from '@/game/team-archetype';
import { DEFAULT_GAME_PLAN, type GamePlan } from '@/types/tactics';
import { POSITION_ARCHETYPE, type Position, type RosterPlayer } from '@/types/roster';
import { createPlayer, type PlayerStats } from '@/types/player';
import type { Team } from '@/types/team';

const ALL: TeamArchetype[] = [
  'pace-and-space',
  'three-point-barrage',
  'run-and-gun',
  'twin-towers',
  'bully-ball',
  'grit-and-grind',
  'iso-heavy',
  'balanced',
];

/** A controlled five: every stat starts at `base`, then per-player overrides. */
function makeFive(
  name: string,
  specs: { pos: Position; over?: Partial<PlayerStats> }[],
  tactic: GamePlan,
  base = 13,
  delta = 0
): Team {
  const players: RosterPlayer[] = specs.map((sp, i) => {
    const seed = createPlayer(`${name}${i}`, POSITION_ARCHETYPE[sp.pos], createRNG(`${name}-${i}`).int);
    const stats = {} as PlayerStats;
    for (const k of Object.keys(seed.stats) as (keyof PlayerStats)[]) stats[k] = base + delta;
    Object.assign(stats, sp.over);
    return { player: { ...seed, stats }, position: sp.pos };
  });
  return buildTeam(name, players, tactic, '#fff', '#000');
}

// Two-way competent fives: both can score AND defend (so OVR parity tracks sim
// parity), differing in STYLE so the matchup edge, not raw incompetence, decides.
const paceSpace = (delta = 0): Team =>
  makeFive(
    'PS',
    [
      { pos: 'PG', over: { outside: 16, inside: 14, playmaking: 15, athleticism: 16 } },
      { pos: 'SG', over: { outside: 17, inside: 14, athleticism: 16 } },
      { pos: 'SF', over: { outside: 16, inside: 14, athleticism: 15 } },
      { pos: 'SF', over: { outside: 16, inside: 13 } },
      { pos: 'PF', over: { outside: 15, inside: 15, interiorD: 14 } },
    ],
    { pace: 'fast', focus: 'outside', starPlayerIndex: null },
    13,
    delta
  );

const twinTowers = (delta = 0): Team =>
  makeFive(
    'TT',
    [
      { pos: 'SF', over: { inside: 15, interiorD: 16, rebounding: 15 } },
      { pos: 'PF', over: { inside: 16, interiorD: 17, rebounding: 16, strength: 15 } },
      { pos: 'PF', over: { inside: 16, interiorD: 17, rebounding: 16, strength: 15 } },
      { pos: 'C', over: { inside: 17, interiorD: 18, rebounding: 17, strength: 16 } },
      { pos: 'C', over: { inside: 17, interiorD: 18, rebounding: 17, strength: 16 } },
    ],
    { pace: 'slow', focus: 'inside', starPlayerIndex: null },
    13,
    delta
  );

const balanced = (tag: string, delta = 0): Team =>
  makeFive(
    `BAL${tag}`,
    [{ pos: 'PG' }, { pos: 'SG' }, { pos: 'SF' }, { pos: 'PF' }, { pos: 'C' }],
    DEFAULT_GAME_PLAN,
    13,
    delta
  );

/** Win rate for `a` over `b` across both home/away orientations (cancels any
 * residual side bias), seeded so it is fully deterministic. */
function winRate(a: Team, b: Team, games = 150): number {
  let aWins = 0;
  for (let s = 0; s < games; s++) {
    if (simulateGame({ home: a, away: b, seed: `t-${s}` }).winner === 'home') aWins += 1;
    if (simulateGame({ home: b, away: a, seed: `t-${s}` }).winner === 'away') aWins += 1;
  }
  return aWins / (games * 2);
}

describe('team archetype counter matrix', () => {
  it('keeps every edge bounded to +/- 0.06', () => {
    for (const a of ALL) for (const b of ALL) {
      expect(Math.abs(counterEdge(a, b))).toBeLessThanOrEqual(0.06);
    }
  });

  it('is even on the diagonal and against balanced (no-op anchor)', () => {
    for (const a of ALL) {
      expect(counterEdge(a, a)).toBe(0);
      expect(counterEdge(a, 'balanced')).toBe(0);
      expect(counterEdge('balanced', a)).toBe(0);
    }
  });

  it('forms readable rock-paper-scissors cycles', () => {
    // Spacing drags out the towers; the towers wall the bully; the bully muscles
    // the shooters; grit smothers the barrage; pace overruns grit.
    expect(counterEdge('pace-and-space', 'twin-towers')).toBeGreaterThan(0);
    expect(counterEdge('twin-towers', 'pace-and-space')).toBeLessThan(0);
    expect(counterEdge('twin-towers', 'bully-ball')).toBeGreaterThan(0);
    expect(counterEdge('grit-and-grind', 'three-point-barrage')).toBeGreaterThan(0);
    expect(counterEdge('pace-and-space', 'grit-and-grind')).toBeGreaterThan(0);
  });

  it('classifies the constructed fives as intended', () => {
    expect(deriveArchetype(paceSpace())).toBe('pace-and-space');
    expect(deriveArchetype(twinTowers())).toBe('twin-towers');
    expect(deriveArchetype(balanced('x'))).toBe('balanced');
  });

  it('no longer labels a standard inflated five as Twin Towers', () => {
    // A standard PG/SG/SF/PF/C five whose ratings all rise with difficulty used to
    // trip the old twin-towers rule (any two bigs with interiorD >= 15). It now needs
    // an inside scheme AND genuine size, so a flat strong five is never Twin Towers.
    for (const delta of [2, 3, 5]) {
      expect(deriveArchetype(balanced(`infl-${delta}`, delta))).not.toBe('twin-towers');
    }
  });

  it('telegraphs the matchup verdict (even / slight / strong, signed)', () => {
    // Even vs balanced or a mirror; a real counter reads strong and favorable;
    // the reverse reads as an unfavorable mismatch.
    expect(counterVerdict('pace-and-space', 'balanced').tier).toBe('even');
    expect(counterVerdict('pace-and-space', 'pace-and-space').tier).toBe('even');
    const good = counterVerdict('pace-and-space', 'twin-towers');
    expect(good.favorable).toBe(true);
    expect(good.tier).toBe('strong');
    const bad = counterVerdict('twin-towers', 'pace-and-space');
    expect(bad.favorable).toBe(false);
    expect(bad.tier).toBe('strong');
  });
});

describe('team archetype counter efficacy (sim)', () => {
  // Clean isolation of the counter MAGNITUDE: a competent balanced team vs an
  // identical clone is a coin flip; giving one clone exactly the max counter
  // delta (edge 0.06 -> outside/inside +0.84, playmaking +0.42, via the same
  // TeamModifier.extra channel the counter uses) measures purely what a maximal
  // counter is worth, free of any style/construction confound.
  it('a maximal counter is a real but bounded swing (~10-20%)', () => {
    const base = (): Team => balanced('iso-base');
    const buffed = makeFive(
      'BUFFED',
      [{ pos: 'PG' }, { pos: 'SG' }, { pos: 'SF' }, { pos: 'PF' }, { pos: 'C' }],
      DEFAULT_GAME_PLAN,
      13
    );
    // Apply the max-edge delta through the modifier path, mirroring counterDelta.
    const e = 0.06 * 14;
    const buffedTeam: Team = {
      ...buffed,
      teamStats: {
        ...buffed.teamStats,
        outside: buffed.teamStats.outside + e,
        inside: buffed.teamStats.inside + e,
        playmaking: buffed.teamStats.playmaking + e * 0.5,
      },
    };
    const rate = winRate(buffedTeam, base());
    console.log(`max-counter buff win rate: ${(rate * 100).toFixed(1)}%`);
    expect(rate).toBeGreaterThan(0.5); // a real edge
    expect(rate).toBeLessThan(0.72); // not a hard counter
  });

  it('keeps styles competitive (no single dominant build)', () => {
    // Pace-and-space vs twin-towers is a real matchup, not a blowout either way:
    // neither style is an auto-win, so build variety holds.
    const rate = winRate(paceSpace(), twinTowers());
    expect(rate).toBeGreaterThan(0.2);
    expect(rate).toBeLessThan(0.8);
  });

  it('mirror matchups stay a coin flip (no archetype self-edge)', () => {
    const rate = winRate(balanced('a'), balanced('b'));
    expect(rate).toBeGreaterThan(0.42);
    expect(rate).toBeLessThan(0.58);
  });

  it('lets raw talent win through an unfavorable style matchup', () => {
    // A +4 OVR twin-towers five beats a pace-and-space five clearly, even though
    // pace-and-space is the style that counters it: OVR still decides a real gap.
    expect(winRate(twinTowers(4), paceSpace())).toBeGreaterThan(0.75);
  });
});
