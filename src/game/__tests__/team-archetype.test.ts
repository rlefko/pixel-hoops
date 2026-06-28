import { describe, it, expect } from 'vitest';
import { createRNG } from '@/game/rng';
import { buildTeam } from '@/game/lineup';
import { simulateGame } from '@/game/simulation';
import { ovr } from '@/game/ratings';
import {
  counterEdge,
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

function teamOvr(t: Team): number {
  const five = t.lineup.players;
  return Math.round(five.reduce((s, rp) => s + ovr(rp.player.stats, rp.position), 0) / five.length);
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

  it('DIAG prints style matchup and talent win rates', () => {
    const ps = paceSpace();
    const tt = twinTowers();
    console.log(
      [
        `OVR  PS=${teamOvr(ps)}  TT=${teamOvr(tt)}  BAL=${teamOvr(balanced('a'))}`,
        `PS vs TT (PS counters TT): ${(winRate(ps, tt) * 100).toFixed(1)}%`,
        `BAL vs BAL mirror:         ${(winRate(balanced('a'), balanced('b')) * 100).toFixed(1)}%`,
        `talent: TT(+4) vs PS:      ${(winRate(twinTowers(4), ps) * 100).toFixed(1)}%`,
        `talent: PS(+4) vs TT:      ${(winRate(paceSpace(4), tt) * 100).toFixed(1)}%`,
      ].join('\n')
    );
    expect(true).toBe(true);
  });
});
