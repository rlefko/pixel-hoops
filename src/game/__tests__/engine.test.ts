import { describe, it, expect } from 'vitest';
import { createRNG, deriveSeed } from '@/game/rng';
import { buildStartingRoster, generateOpponentTeam } from '@/game/tournament';
import { buildTeam } from '@/game/lineup';
import { simulateGame, actionWeights } from '@/game/simulation';
import type { TeamStats } from '@/types/team';
import { generateFixedMap, getReachableNodes } from '@/game/run-map';
import { DEFAULT_GAME_PLAN, type GamePlan } from '@/types/tactics';
import { POSITIONS, POSITION_ARCHETYPE, type Roster, type RosterPlayer } from '@/types/roster';
import { createPlayer } from '@/types/player';
import type { Team } from '@/types/team';

/** Build N procedural bench players (cycling positions) for rotation tests. */
function makeBench(count: number, seed: string): RosterPlayer[] {
  return Array.from({ length: count }, (_, i) => {
    const position = POSITIONS[i % POSITIONS.length];
    return {
      player: createPlayer(`Bench${i}`, POSITION_ARCHETYPE[position], createRNG(`${seed}-${i}`).int),
      position,
    };
  });
}

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
        // Floor allows the occasional cold-shooting blowout: the rookie home five
        // can be held to the low teens by a deep-round, round-scaled real opponent.
        expect(side).toBeGreaterThan(12);
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

  it('a smarter five hunts better shots (fewer contested midranges)', () => {
    // Unit-test the tendency directly: two identical stat lines differing only
    // in IQ, at a neutral game state. (A timeline-level count is confounded
    // because the better team leads more and a lead biases toward safe shots.)
    const stats = (iq: number): TeamStats => ({
      inside: 6,
      outside: 6,
      playmaking: 6,
      perimeterD: 6,
      interiorD: 6,
      athleticism: 6,
      iq,
      clutch: 5,
      stamina: 5,
      durability: 5,
      pace: 7,
      off: 6,
      def: 6,
      ovr: 6,
    });
    const share = (iq: number) => {
      const w = actionWeights(stats(iq), 'balanced', 'mixed');
      const total = w.reduce((sum, [, x]) => sum + x, 0);
      const of = (a: string) => (w.find(([k]) => k === a)?.[1] ?? 0) / total;
      return { mid: of('midrange'), good: of('layup') + of('dunk') + of('three') };
    };
    const smart = share(10);
    const dumb = share(3);
    expect(smart.mid).toBeLessThan(dumb.mid); // shuns the contested long two
    expect(smart.good).toBeGreaterThan(dumb.good); // leans rim + three
  });
});

describe('fatigue, rotation, and box score', () => {
  const starters = buildStartingRoster(createRNG('rot')).starters;
  const deep = (): Team =>
    buildTeam('Deep', starters, DEFAULT_GAME_PLAN, '#fff', '#000', makeBench(5, 'bench'));
  const thin = (): Team => buildTeam('Thin', starters, DEFAULT_GAME_PLAN, '#fff', '#000', []);

  it('subs in fresh legs with a bench, never without one', () => {
    const withBench = simulateGame({ home: deep(), away: thin(), seed: 'subs-1' });
    const subTotal = withBench.events.reduce((n, e) => n + (e.subs?.length ?? 0), 0);
    expect(subTotal).toBeGreaterThan(0);

    const benchless = simulateGame({ home: thin(), away: thin(), seed: 'subs-2' });
    expect(benchless.events.some((e) => e.subs && e.subs.length > 0)).toBe(false);
  });

  it('keeps energy in [0,100] and minutes summing to a full game', () => {
    const r = simulateGame({ home: deep(), away: thin(), seed: 'energy' });
    for (const line of [...r.box.home, ...r.box.away]) {
      expect(line.energy).toBeGreaterThanOrEqual(0);
      expect(line.energy).toBeLessThanOrEqual(100);
    }
    const homeSeconds = r.box.home.reduce((s, b) => s + b.seconds, 0);
    const awaySeconds = r.box.away.reduce((s, b) => s + b.seconds, 0);
    // Five on the floor across four 12-minute quarters: 5 * 4 * 720 seconds.
    expect(homeSeconds).toBeCloseTo(4 * 5 * 720, 0);
    expect(awaySeconds).toBeCloseTo(4 * 5 * 720, 0);
  });

  it('reconciles box-score points with the final score', () => {
    const r = simulateGame({ home: deep(), away: thin(), seed: 'pts' });
    expect(r.box.home.reduce((s, b) => s + b.pts, 0)).toBe(r.finalHome);
    expect(r.box.away.reduce((s, b) => s + b.pts, 0)).toBe(r.finalAway);
  });

  it('lets a deep bench outlast an identical five-man team', () => {
    // Modest by design (fatigue is real but not dominant): the deep team wins a
    // majority across both orientations. Bench players are equal-quality fresh
    // legs, so the edge is fresher Q4 legs, not raw talent.
    let deepWins = 0;
    const games = 100;
    for (let s = 0; s < games; s++) {
      if (simulateGame({ home: deep(), away: thin(), seed: `dw-${s}` }).winner === 'home') deepWins += 1;
      if (simulateGame({ home: thin(), away: deep(), seed: `dw-${s}` }).winner === 'away') deepWins += 1;
    }
    expect(deepWins).toBeGreaterThan(games); // > 50% of 2*games
  });

  it('produces an identical box score for the same seed', () => {
    const a = simulateGame({ home: deep(), away: thin(), seed: 'det-box' });
    const b = simulateGame({ home: deep(), away: thin(), seed: 'det-box' });
    expect(a.box).toEqual(b.box);
  });
});

describe('run map', () => {
  it('is deterministic and well-formed', () => {
    const a = generateFixedMap({ seed: 'map-1', mapIndex: 0 });
    const b = generateFixedMap({ seed: 'map-1', mapIndex: 0 });
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
    const map = generateFixedMap({ seed: 'map-2', mapIndex: 0 });
    expect(getReachableNodes(map, null)).toEqual(map.startNodeIds.map((id) => map.nodes[id]));
    const first = map.startNodeIds[0];
    expect(getReachableNodes(map, first)).toEqual(map.nodes[first].next.map((id) => map.nodes[id]));
  });
});
