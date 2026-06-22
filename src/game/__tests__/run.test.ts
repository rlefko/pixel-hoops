import { describe, it, expect } from 'vitest';
import { createRNG } from '@/game/rng';
import { generateRecruitOffers, getRoundStatRange } from '@/game/tournament';
import {
  createRookieRoster,
  homeToRunRoster,
  mergeRunGainsIntoHome,
  serializeHomeRoster,
  deserializeHomeRoster,
  type HomeRoster,
} from '@/game/home-roster';
import { runReducer, initRun, type RunModel } from '@/game/run-machine';
import { POSITIONS } from '@/types/roster';

function rookie(seed = 'home'): HomeRoster {
  return createRookieRoster(createRNG(seed));
}

describe('generateRecruitOffers', () => {
  it('is deterministic and honors count', () => {
    const a = generateRecruitOffers(3, 3, createRNG('r1'));
    const b = generateRecruitOffers(3, 3, createRNG('r1'));
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
  });

  it('differs by seed', () => {
    const a = generateRecruitOffers(3, 3, createRNG('r1'));
    const b = generateRecruitOffers(3, 3, createRNG('r2'));
    expect(a).not.toEqual(b);
  });

  it('scales stats into the round range with valid positions', () => {
    const { min, max } = getRoundStatRange(5);
    const offers = generateRecruitOffers(5, 8, createRNG('rs'));
    for (const o of offers) {
      for (const stat of Object.values(o.player.stats)) {
        expect(stat).toBeGreaterThanOrEqual(min);
        expect(stat).toBeLessThanOrEqual(max);
      }
      expect(POSITIONS).toContain(o.position);
    }
  });
});

describe('home roster persistence', () => {
  it('rookie roster owns five players', () => {
    expect(rookie().players).toHaveLength(5);
  });

  it('homeToRunRoster puts five in starters and the rest on the bench', () => {
    const base = rookie();
    const home = {
      ...base,
      players: [
        ...base.players,
        ...generateRecruitOffers(1, 3, createRNG('x')),
      ],
    };
    const run = homeToRunRoster(home);
    expect(run.starters).toHaveLength(5);
    expect(run.bench).toHaveLength(3);
  });

  it('merge appends recruits, carries rewards, and caps growth', () => {
    const home = rookie();
    const run = homeToRunRoster(home);
    const grown = {
      ...run,
      bench: [...run.bench, ...generateRecruitOffers(2, 4, createRNG('m'))],
    };
    const merged = mergeRunGainsIntoHome(home, grown, {
      coins: 5,
      reputation: 3,
      trainingXP: 0,
    });
    expect(merged.players).toHaveLength(9);
    expect(merged.coins).toBe(5);
    expect(merged.reputation).toBe(3);

    const flooded = {
      ...run,
      bench: generateRecruitOffers(1, 30, createRNG('big')),
    };
    expect(mergeRunGainsIntoHome(home, flooded).players).toHaveLength(17); // 5 + cap(12)
  });

  it('serialize/deserialize round-trips and rejects garbage', () => {
    const home = rookie();
    expect(deserializeHomeRoster(serializeHomeRoster(home))).toEqual(home);
    expect(deserializeHomeRoster(null)).toBeNull();
    expect(deserializeHomeRoster({ data: { players: [] } })).toBeNull();
    expect(
      deserializeHomeRoster({ data: { players: [1, 2, 3, 4, 5] } })
    ).toBeNull();
    // Players present but with malformed stats are rejected (no NaN sims).
    expect(
      deserializeHomeRoster({
        data: { players: Array(5).fill({ position: 'PG', player: {} }) },
      })
    ).toBeNull();
  });
});

describe('run reducer', () => {
  const home = rookie('reducer');
  const start = (): RunModel => initRun('seed-1', home);

  it('initializes on the map with five starters', () => {
    const m = start();
    expect(m.phase.kind).toBe('map');
    expect(m.core.currentNodeId).toBeNull();
    expect(m.core.roster.starters).toHaveLength(5);
  });

  it('chooseNode on a start (game) node opens pregame', () => {
    const m = start();
    const nodeId = m.core.map.startNodeIds[0];
    const next = runReducer(m, { type: 'chooseNode', nodeId })!;
    expect(next.phase.kind).toBe('pregame');
    expect(next.core.currentNodeId).toBe(nodeId);
  });

  it('plays a game and resolves win/loss correctly', () => {
    let m = start();
    const nodeId = m.core.map.startNodeIds[0];
    m = runReducer(m, { type: 'chooseNode', nodeId })!;
    m = runReducer(m, { type: 'enterGame' })!;
    expect(m.phase.kind).toBe('game');
    expect(m.game?.result.events.length).toBeGreaterThan(0);
    m = runReducer(m, { type: 'finishReplay' })!;
    expect(m.phase.kind).toBe('postgame');

    const won = runReducer(
      { ...m, phase: { kind: 'postgame', nodeId, won: true } },
      { type: 'resolveGameResult' }
    )!;
    expect(won.phase.kind).toBe('map');
    expect(won.wins).toBe(1);

    const lost = runReducer(
      { ...m, phase: { kind: 'postgame', nodeId, won: false } },
      { type: 'resolveGameResult' }
    )!;
    expect(lost.phase).toEqual({ kind: 'summary', champion: false });
  });

  it('winning the boss crowns a champion', () => {
    const m = start();
    const bossId = m.core.map.bossNodeId;
    const champ = runReducer(
      { ...m, phase: { kind: 'postgame', nodeId: bossId, won: true } },
      { type: 'resolveGameResult' }
    )!;
    expect(champ.phase).toEqual({ kind: 'summary', champion: true });
  });

  it('recruit appends to the bench and returns to the map', () => {
    const m = start();
    const [offer] = generateRecruitOffers(1, 1, createRNG('o'));
    const next = runReducer(
      { ...m, phase: { kind: 'recruit', nodeId: 'n', offers: [offer] } },
      { type: 'recruit', player: offer }
    )!;
    expect(next.core.roster.bench).toHaveLength(1);
    expect(next.phase.kind).toBe('map');
  });

  it('training boosts a stat, capped at 10', () => {
    const m = start();
    const before = m.core.roster.starters[0].player.stats.shooting;
    const next = runReducer(
      { ...m, phase: { kind: 'training', nodeId: 'n' } },
      { type: 'trainPlayer', index: 0, stat: 'shooting' }
    )!;
    expect(next.core.roster.starters[0].player.stats.shooting).toBe(
      Math.min(10, before + 1)
    );
    expect(next.phase.kind).toBe('map');
  });

  it('setLineup requires exactly five', () => {
    const m = start();
    const lineupPhase: RunModel = {
      ...m,
      phase: { kind: 'lineup', returnTo: { kind: 'map' } },
    };
    const five = m.core.roster.starters;
    const ok = runReducer(lineupPhase, {
      type: 'setLineup',
      starters: five,
      bench: [],
    })!;
    expect(ok.phase.kind).toBe('map');
    const bad = runReducer(lineupPhase, {
      type: 'setLineup',
      starters: five.slice(0, 4),
      bench: [],
    })!;
    expect(bad.phase.kind).toBe('lineup');
  });
});
