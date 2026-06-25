import { describe, it, expect } from 'vitest';
import { createRNG, deriveSeed } from '@/game/rng';
import { buildStartingRoster, generateOpponentTeam } from '@/game/tournament';
import { buildTeam } from '@/game/lineup';
import { simulateGame, actionWeights } from '@/game/simulation';
import { ovr } from '@/game/ratings';
import type { TeamStats } from '@/types/team';
import { generateFixedMap, getReachableNodes } from '@/game/run-map';
import { DEFAULT_GAME_PLAN, type GamePlan } from '@/types/tactics';
import { POSITIONS, POSITION_ARCHETYPE, type Position, type Roster, type RosterPlayer } from '@/types/roster';
import { createPlayer, STAT_ELITE_MAX, type PlayerStats } from '@/types/player';
import { teamModifierFromPartial } from '@/game/effects';
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

function makeMatchup(seed: number | string, level = 10): { home: Team; away: Team } {
  const rng = createRNG(seed);
  const home = teamFromRoster('You', buildStartingRoster(rng));
  const opp = generateOpponentTeam(level, rng);
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
      const { home, away } = makeMatchup(`tie-${s}`, (s % 6) * 2 + 10);
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
      const { home, away } = makeMatchup(`score-${s}`, (s % 6) * 2 + 10);
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
    // The player's baseline five vs a near-parity opponent: should win a clear
    // majority, but not every time (upsets keep tension alive). A much weaker
    // opponent is a near-certain win now that neither side has a possession edge,
    // so this uses a level close to the player's own to exercise both bounds.
    let homeWins = 0;
    const games = 60;
    for (let s = 0; s < games; s++) {
      const { home, away } = makeMatchup('strength', 10);
      const r = simulateGame({ home, away, seed: `str-${s}` });
      if (r.winner === 'home') homeWins += 1;
    }
    expect(homeWins).toBeGreaterThan(games * 0.5); // stats matter
    expect(homeWins).toBeLessThan(games); // randomness still allows upsets
  });

  it('is fair home/away: a team vs itself wins about half at home', () => {
    // Identical teams on both sides must be a true coin flip. The possessions
    // alternate which side leads each quarter, so neither side gets a standing
    // last-possession edge (the player is always the sim's "home", so any home or
    // away bias would silently handicap every game). Tight bounds catch a bias.
    const rng = createRNG('even');
    const team = teamFromRoster('Mirror', buildStartingRoster(rng));
    let homeWins = 0;
    const games = 200;
    for (let s = 0; s < games; s++) {
      const r = simulateGame({ home: team, away: team, seed: `even-${s}` });
      if (r.winner === 'home') homeWins += 1;
    }
    const rate = homeWins / games;
    expect(rate).toBeGreaterThan(0.42);
    expect(rate).toBeLessThan(0.58);
  });

  it('does not field an unscaled, full-power legend on an early-map boss', () => {
    // Regression guard: bosses headline a franchise legend, but on an early/low
    // node the legend must be scaled to a fair headliner, not its un-capped ~20 OVR.
    let maxLegendOvr = 0;
    for (let k = 0; k < 24; k++) {
      const opp = generateOpponentTeam(9, createRNG(`boss-legend-${k}`), { isBoss: true });
      const legend = opp.roster.starters.find((p) => p.legendary);
      if (legend) maxLegendOvr = Math.max(maxLegendOvr, ovr(legend.player.stats, legend.position));
    }
    expect(maxLegendOvr).toBeGreaterThan(0); // bosses do field a legend
    expect(maxLegendOvr).toBeLessThan(16); // scaled down from the full ~20 OVR
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

  it('keeps healthy starters off a 48-minute night when a bench exists', () => {
    // The bug this guards: starters used to play all 48 while the bench got 0,
    // because a sub only fired when the fresh player was strictly better than the
    // tired starter. With a viable bench, nobody should run the full game.
    for (let s = 0; s < 20; s++) {
      const r = simulateGame({ home: deep(), away: deep(), seed: `mins-${s}` });
      for (const box of [r.box.home, r.box.away]) {
        for (const line of box.filter((b) => b.starter)) {
          expect(line.seconds / 60).toBeLessThanOrEqual(44);
        }
      }
    }
  });

  it('gives every bench player real minutes with a deep bench', () => {
    const r = simulateGame({ home: deep(), away: deep(), seed: 'bench-mins' });
    for (const box of [r.box.home, r.box.away]) {
      const bench = box.filter((b) => !b.starter);
      expect(bench.length).toBeGreaterThan(0);
      for (const line of bench) expect(line.seconds).toBeGreaterThan(0);
    }
  });

  it('rests starters more in blowouts than in even games', () => {
    // Same strong home team; only the opponent strength (and thus the margin)
    // changes. Garbage-time rest should hand the bench more minutes when the home
    // team is blowing the game open than when the game stays close.
    const strongStarters = generateOpponentTeam(6, createRNG('bw-strong')).roster.starters;
    const strongHome = (): Team =>
      buildTeam('Strong', strongStarters, DEFAULT_GAME_PLAN, '#fff', '#000', makeBench(5, 'bw-bench'));
    const benchSeconds = (away: () => Team, label: string): number => {
      let total = 0;
      const games = 20;
      for (let s = 0; s < games; s++) {
        const r = simulateGame({ home: strongHome(), away: away(), seed: `${label}-${s}` });
        total += r.box.home.filter((b) => !b.starter).reduce((n, b) => n + b.seconds, 0);
      }
      return total / games;
    };
    const blowout = benchSeconds(thin, 'bw'); // weak opponent => frequent blowouts
    const even = benchSeconds(strongHome, 'ev'); // mirror => few blowouts
    expect(blowout).toBeGreaterThan(even);
  });

  it('rewards stamina with more minutes at equal skill', () => {
    // Two runs identical except the SG-slot player's stamina: the high-stamina
    // version drains slower, dips to the sub zone less, and logs more minutes.
    const base = createPlayer('Iron', POSITION_ARCHETYPE.SG, createRNG('iron').int);
    const sgMinutes = (stamina: number): number => {
      const five = buildStartingRoster(createRNG('rot')).starters.slice();
      five[1] = { player: { ...base, stats: { ...base.stats, stamina } }, position: 'SG' };
      const team = buildTeam('Stamina', five, DEFAULT_GAME_PLAN, '#fff', '#000', makeBench(5, 'sbench'));
      return simulateGame({ home: team, away: deep(), seed: 'stamina' }).box.home[1].seconds;
    };
    expect(sgMinutes(10)).toBeGreaterThan(sgMinutes(3));
  });
});

describe('reward stacking guard', () => {
  // Guards the soft cap (items/abilities now reach the elite band 24, not the old
  // hard 20) against the unclamped Q4 quarterDelta hooks: stacking the best of every
  // reward channel must not let the make-probability clamp [0.03, 0.97] break and
  // explode the score. If a future change removes the clamp, this catches it.
  const eliteFive = (): RosterPlayer[] =>
    POSITIONS.map((position: Position) => {
      const base = createPlayer('Apex', POSITION_ARCHETYPE[position], createRNG(`apex-${position}`).int);
      const stats = { ...base.stats };
      for (const k of Object.keys(stats) as (keyof PlayerStats)[]) stats[k] = STAT_ELITE_MAX;
      return { player: { ...base, stats }, position };
    });

  // The fattest plausible team modifier: boost extras at the cap, big team auras,
  // and two Q4 spikes (Ice Water + a Dame-Time-style takeover) that bypass the clamp.
  const stacked = teamModifierFromPartial({
    offenseBonus: 6,
    defenseBonus: 6,
    paceBonus: 6,
    clutchBonus: 6,
    extra: { outside: 8, inside: 8, perimeterD: 8, interiorD: 8 },
    hooks: [
      { kind: 'quarterDelta', quarter: 4, delta: { outside: 8, clutch: 8 } },
      { kind: 'quarterDelta', quarter: 4, delta: { inside: 8 } },
    ],
  });

  it('keeps scores realistic (no runaway) with a maximally juiced roster', () => {
    const home = buildTeam('Juiced', eliteFive(), DEFAULT_GAME_PLAN, '#fff', '#000', makeBench(5, 'jb'), stacked);
    const away = teamFromRoster('Weak', buildStartingRoster(createRNG('weak')));
    let homeWins = 0;
    let maxScore = 0;
    const games = 30;
    for (let s = 0; s < games; s++) {
      const r = simulateGame({ home, away, seed: `stack-${s}` });
      maxScore = Math.max(maxScore, r.finalHome, r.finalAway);
      // The clamp holds: an arcade game over four quarters cannot run away.
      expect(r.finalHome).toBeLessThan(200);
      expect(r.finalAway).toBeLessThan(200);
      if (r.winner === 'home') homeWins += 1;
    }
    expect(homeWins).toBe(games); // a maxed roster should never lose to rookies
    expect(maxScore).toBeLessThan(200);
  });

  it('a maximally juiced roster is still deterministic', () => {
    const home = buildTeam('Juiced', eliteFive(), DEFAULT_GAME_PLAN, '#fff', '#000', makeBench(5, 'jb'), stacked);
    const away = teamFromRoster('Weak', buildStartingRoster(createRNG('weak')));
    const a = simulateGame({ home, away, seed: 'stack-det' });
    const b = simulateGame({ home, away, seed: 'stack-det' });
    expect(a.events).toEqual(b.events);
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
