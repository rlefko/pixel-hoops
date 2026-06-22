import { describe, it, expect } from 'vitest';
import { createRNG, deriveSeed } from '@/game/rng';
import { buildStartingRoster, generateOpponentTeam } from '@/game/tournament';
import { buildTeam } from '@/game/lineup';
import { simulateGame } from '@/game/simulation';
import { generateRunMap, getReachableNodes } from '@/game/run-map';
import { DEFAULT_GAME_PLAN, type GamePlan } from '@/types/tactics';
import type { Roster } from '@/types/roster';
import type { Team } from '@/types/team';

function teamFromRoster(name: string, roster: Roster, plan: GamePlan = DEFAULT_GAME_PLAN): Team {
  return buildTeam(name, roster.starters, plan, '#FFD54F', '#1D428A');
}

function makeMatchup(seed: number | string, round = 1): { home: Team; away: Team } {
  const rng = createRNG(seed);
  const home = teamFromRoster('You', buildStartingRoster(rng));
  const opp = generateOpponentTeam(round, rng);
  return { home, away: teamFromRoster(opp.name, opp.roster) };
}

describe('rng', () => {
  it('is reproducible for the same seed', () => {
    const a = createRNG('seed-1');
    const b = createRNG('seed-1');
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('differs across seeds', () => {
    const a = Array.from({ length: 20 }, createRNG('seed-1').next);
    const b = Array.from({ length: 20 }, createRNG('seed-2').next);
    expect(a).not.toEqual(b);
  });

  it('produces values in [0, 1)', () => {
    const rng = createRNG(123);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('deriveSeed is stable and label-sensitive', () => {
    expect(deriveSeed('run', 'n-1-0')).toBe(deriveSeed('run', 'n-1-0'));
    expect(deriveSeed('run', 'n-1-0')).not.toBe(deriveSeed('run', 'n-1-1'));
  });
});

describe('simulateGame determinism', () => {
  it('produces an identical timeline for the same seed', () => {
    const { home, away } = makeMatchup('match-7');
    const a = simulateGame({ home, away, seed: 'game-7' });
    const b = simulateGame({ home, away, seed: 'game-7' });
    expect(a.events).toEqual(b.events);
    expect(a.finalHome).toBe(b.finalHome);
    expect(a.finalAway).toBe(b.finalAway);
    expect(a.winner).toBe(b.winner);
  });

  it('changes with the seed', () => {
    const { home, away } = makeMatchup('match-7');
    const a = simulateGame({ home, away, seed: 'game-A' });
    const b = simulateGame({ home, away, seed: 'game-B' });
    // Overwhelmingly likely to differ; guards against a frozen sim.
    expect(a.events).not.toEqual(b.events);
  });
});

describe('simulateGame integrity', () => {
  it('never ends in a tie and the winner has the higher score', () => {
    for (let s = 0; s < 50; s++) {
      const { home, away } = makeMatchup(`tie-${s}`, (s % 7) + 1);
      const r = simulateGame({ home, away, seed: `g-${s}` });
      expect(r.finalHome).not.toBe(r.finalAway);
      const winnerScore = r.winner === 'home' ? r.finalHome : r.finalAway;
      const loserScore = r.winner === 'home' ? r.finalAway : r.finalHome;
      expect(winnerScore).toBeGreaterThan(loserScore);
    }
  });

  it('keeps running scores consistent with the final score', () => {
    const { home, away } = makeMatchup('consistency');
    const r = simulateGame({ home, away, seed: 'c-1' });
    expect(r.events.length).toBeGreaterThan(0);
    const last = r.events[r.events.length - 1];
    expect(last.homeScore).toBe(r.finalHome);
    expect(last.awayScore).toBe(r.finalAway);
    // Running scores are monotonic non-decreasing.
    let prevHome = 0;
    let prevAway = 0;
    for (const e of r.events) {
      expect(e.homeScore).toBeGreaterThanOrEqual(prevHome);
      expect(e.awayScore).toBeGreaterThanOrEqual(prevAway);
      prevHome = e.homeScore;
      prevAway = e.awayScore;
    }
  });

  it('produces believable basketball scores', () => {
    let total = 0;
    let count = 0;
    for (let s = 0; s < 40; s++) {
      const { home, away } = makeMatchup(`score-${s}`, (s % 7) + 1);
      const r = simulateGame({ home, away, seed: `sg-${s}` });
      for (const side of [r.finalHome, r.finalAway]) {
        expect(side).toBeGreaterThan(15);
        expect(side).toBeLessThan(130);
        total += side;
        count += 1;
      }
    }
    const avg = total / count;
    // Sanity band for an arcade game over 4 quarters.
    expect(avg).toBeGreaterThan(30);
    expect(avg).toBeLessThan(90);
  });

  it('rewards the stronger roster but still allows upsets', () => {
    // The player's baseline five vs a weaker round-1 opponent: should win a
    // clear majority, but not every time (upsets keep tension alive).
    let homeWins = 0;
    const games = 60;
    for (let s = 0; s < games; s++) {
      const { home, away } = makeMatchup('strength', 1);
      const r = simulateGame({ home, away, seed: `str-${s}` });
      if (r.winner === 'home') homeWins += 1;
    }
    expect(homeWins).toBeGreaterThan(games * 0.5); // stats matter
    expect(homeWins).toBeLessThan(games); // randomness still allows upsets
  });

  it('keeps an even matchup roughly balanced', () => {
    // Identical teams on both sides: neither should dominate.
    const rng = createRNG('even');
    const team = teamFromRoster('Mirror', buildStartingRoster(rng));
    let homeWins = 0;
    const games = 60;
    for (let s = 0; s < games; s++) {
      const r = simulateGame({ home: team, away: team, seed: `even-${s}` });
      if (r.winner === 'home') homeWins += 1;
    }
    expect(homeWins).toBeGreaterThan(games * 0.3);
    expect(homeWins).toBeLessThan(games * 0.7);
  });
});

describe('run map', () => {
  it('is deterministic and well-formed', () => {
    const a = generateRunMap({ seed: 'map-1' });
    const b = generateRunMap({ seed: 'map-1' });
    expect(Object.keys(a.nodes)).toEqual(Object.keys(b.nodes));

    // Exactly one boss, reachable structure, no orphaned non-entry nodes.
    const bossNodes = Object.values(a.nodes).filter((n) => n.type === 'boss');
    expect(bossNodes.length).toBe(1);
    expect(a.bossNodeId).toBe(bossNodes[0].id);

    const inbound = new Set<string>();
    for (const node of Object.values(a.nodes)) {
      for (const next of node.next) inbound.add(next);
    }
    for (const node of Object.values(a.nodes)) {
      if (node.layer === 0) continue;
      expect(inbound.has(node.id)).toBe(true);
    }
  });

  it('reachable nodes come from the current position', () => {
    const map = generateRunMap({ seed: 'map-2' });
    expect(getReachableNodes(map, null)).toEqual(map.startNodeIds.map((id) => map.nodes[id]));
    const first = map.startNodeIds[0];
    expect(getReachableNodes(map, first)).toEqual(map.nodes[first].next.map((id) => map.nodes[id]));
  });
});
