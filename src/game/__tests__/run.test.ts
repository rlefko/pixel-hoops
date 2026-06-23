import { describe, it, expect } from 'vitest';
import { createRNG } from '@/game/rng';
import { generateRecruitOffers, getRoundStatRange } from '@/game/tournament';
import {
  applyUpgrade,
  createRookieRoster,
  homeToRunRoster,
  mergeRunGainsIntoHome,
  serializeHomeRoster,
  deserializeHomeRoster,
  type HomeRoster,
} from '@/game/home-roster';
import { legendRecruit } from '@/game/player-pool';
import { runReducer, initRun, type RunModel } from '@/game/run-machine';
import { generateRunMap } from '@/game/run-map';
import { POSITIONS } from '@/types/roster';
import { SKILL_STAT_KEYS } from '@/types/player';

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

  it('scales skill stats into the round range with valid positions', () => {
    const { min, max } = getRoundStatRange(5);
    const offers = generateRecruitOffers(5, 8, createRNG('rs'));
    for (const o of offers) {
      // Only the eight skill ratings are round-scaled; stamina/durability
      // stay at their neutral baseline (condition is not a difficulty tier).
      for (const key of SKILL_STAT_KEYS) {
        expect(o.player.stats[key]).toBeGreaterThanOrEqual(min);
        expect(o.player.stats[key]).toBeLessThanOrEqual(max);
      }
      expect(POSITIONS).toContain(o.position);
    }
  });
});

describe('generateRunMap branching', () => {
  it('is deterministic from a seed', () => {
    expect(generateRunMap({ seed: 'map-1' })).toEqual(
      generateRunMap({ seed: 'map-1' })
    );
  });

  it('never forces a single route: every node forks when the next layer allows', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const map = generateRunMap({ seed });
      map.layers.forEach((layer, li) => {
        if (li >= map.layers.length - 1) return; // boss layer has no next
        const nextCount = map.layers[li + 1].length;
        for (const id of layer) {
          const edges = map.nodes[id].next.length;
          expect(edges).toBeGreaterThanOrEqual(Math.min(2, nextCount));
        }
      });
    }
  });

  it('keeps every node reachable (no orphans)', () => {
    const map = generateRunMap({ seed: 'orphan-check' });
    const reached = new Set(map.startNodeIds);
    for (let li = 0; li < map.layers.length - 1; li++) {
      for (const id of map.layers[li]) {
        for (const n of map.nodes[id].next) reached.add(n);
      }
    }
    for (const id of Object.keys(map.nodes)) {
      expect(reached.has(id)).toBe(true);
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

  it('applyUpgrade spends coins, raises the stat, and no-ops when broke', () => {
    const home = { ...rookie('up'), coins: 1000 };
    const before = home.players[0].player.stats.inside;
    const up = applyUpgrade(home, 0, 'inside');
    expect(up.players[0].player.stats.inside).toBe(Math.min(10, before + 1));
    expect(up.coins).toBe(980); // first standard buy costs 20
    // Second buy of the same stat costs more (tier rises).
    const up2 = applyUpgrade(up, 0, 'inside');
    expect(up.coins - up2.coins).toBe(25);
    // Unaffordable is a no-op (same reference).
    const broke = { ...home, coins: 0 };
    expect(applyUpgrade(broke, 0, 'inside')).toBe(broke);
  });

  it('mergeRunGainsIntoHome strips on-loan legends and items', () => {
    const home = rookie('strip');
    const run = homeToRunRoster(home);
    const legend = legendRecruit(createRNG('lg')); // onLoan: true
    const equipped = { ...run.starters[0], item: { defId: 'grip-tape' } };
    const grown = {
      starters: [equipped, ...run.starters.slice(1)],
      bench: [legend],
    };
    const merged = mergeRunGainsIntoHome(
      home,
      grown,
      { coins: 0, reputation: 0, trainingXP: 0 },
      true
    );
    expect(merged.players.some((p) => p.onLoan)).toBe(false);
    expect(merged.players.every((p) => !p.item)).toBe(true);
    expect(merged.legendDryStreak).toBe(0); // a legend was offered this run
  });
});

describe('run reducer', () => {
  const home = rookie('reducer');
  const start = (): RunModel => initRun('seed-1', home);

  it('opens on the round-1 boost draft with five starters and no boosts', () => {
    const m = start();
    expect(m.phase.kind).toBe('boostDraft');
    expect(m.boosts).toHaveLength(0);
    expect(m.core.currentNodeId).toBeNull();
    expect(m.core.roster.starters).toHaveLength(5);
  });

  it('chooseNode on a round-1 (game) node opens pregame without re-drafting', () => {
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
    const before = m.core.roster.starters[0].player.stats.outside;
    const next = runReducer(
      { ...m, phase: { kind: 'training', nodeId: 'n' } },
      { type: 'trainPlayer', index: 0, stat: 'outside' }
    )!;
    expect(next.core.roster.starters[0].player.stats.outside).toBe(
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

describe('boosts, economy, and legends', () => {
  const start = (): RunModel => initRun('seed-econ', rookie('econ'));

  it('drafting a boost equips it and lands on the map (run-start draft)', () => {
    let m = start();
    expect(m.phase.kind).toBe('boostDraft');
    const offer =
      m.phase.kind === 'boostDraft' ? m.phase.offers[0] : null;
    m = runReducer(m, { type: 'draftBoost', offer: offer! })!;
    expect(m.boosts).toHaveLength(1);
    expect(m.phase.kind).toBe('map');
  });

  it('skipping the draft grants consolation coins', () => {
    let m = start();
    m = runReducer(m, { type: 'skipBoostDraft' })!;
    expect(m.core.rewards.coins).toBe(15);
    expect(m.boosts).toHaveLength(0);
    expect(m.phase.kind).toBe('map');
  });

  it('a sixth boost forces a lossy drop', () => {
    let m = start();
    m = {
      ...m,
      boosts: [
        { id: 'lockdown', tier: 1 },
        { id: 'closer', tier: 1 },
        { id: 'deep-rotation', tier: 1 },
        { id: 'iron-legs', tier: 1 },
        { id: 'no-easy-buckets', tier: 1 },
      ],
      phase: { kind: 'boostDraft', round: 5, offers: [], pendingFull: false },
    };
    m = runReducer(m, { type: 'draftBoost', offer: { kind: 'new', defId: 'splash-brothers' } })!;
    expect(m.phase.kind).toBe('boostDraft');
    expect(m.phase.kind === 'boostDraft' && m.phase.pendingFull).toBe(true);
    m = runReducer(m, { type: 'dropBoostForNew', dropIndex: 0 })!;
    expect(m.boosts).toHaveLength(5);
    expect(m.boosts.some((b) => b.id === 'splash-brothers')).toBe(true);
    expect(m.boosts.some((b) => b.id === 'lockdown')).toBe(false); // dropped
    expect(m.phase.kind).toBe('map');
  });

  it('a loss still banks coins', () => {
    const m = start();
    const lost = runReducer(
      { ...m, phase: { kind: 'postgame', nodeId: 'n', won: false } },
      { type: 'resolveGameResult' }
    )!;
    expect(lost.core.rewards.coins).toBeGreaterThanOrEqual(10);
    expect(lost.phase).toEqual({ kind: 'summary', champion: false });
  });

  it('buying an item equips it and deducts coins', () => {
    let m = start();
    m = { ...m, core: { ...m.core, rewards: { ...m.core.rewards, coins: 100 } } };
    m = {
      ...m,
      phase: {
        kind: 'itemShop',
        nodeId: 'n',
        stock: [{ id: 'grip-tape', name: 'Grip Tape', rarity: 'common', blurb: '', effect: { outside: 1 }, cost: 18 }],
      },
    };
    m = runReducer(m, { type: 'buyItem', defId: 'grip-tape', playerIndex: 0 })!;
    expect(m.core.rewards.coins).toBe(82);
    expect(m.core.roster.starters[0].item?.defId).toBe('grip-tape');
  });
});

describe('between-game injuries', () => {
  const playWonGame = (seed: string): RunModel => {
    let m = initRun(seed, rookie(`inj-${seed}`));
    const nodeId = m.core.map.startNodeIds[0];
    m = runReducer(m, { type: 'chooseNode', nodeId })!;
    m = runReducer(m, { type: 'enterGame' })!;
    m = runReducer(m, { type: 'finishReplay' })!;
    return runReducer(
      { ...m, phase: { kind: 'postgame', nodeId, won: true } },
      { type: 'resolveGameResult' }
    )!;
  };
  const gamesOut = (m: RunModel): number[] =>
    [...m.core.roster.starters, ...m.core.roster.bench].map((p) => p.gamesOut ?? 0);

  it('is reproducible from the run seed', () => {
    expect(gamesOut(playWonGame('repro'))).toEqual(gamesOut(playWonGame('repro')));
  });

  it('keeps injuries rare and bounded', () => {
    let injuredGames = 0;
    const games = 40;
    for (let s = 0; s < games; s++) {
      const outs = gamesOut(playWonGame(`rare-${s}`));
      for (const g of outs) expect(g).toBeLessThanOrEqual(2); // never sidelines too long
      if (outs.some((g) => g > 0)) injuredGames += 1;
    }
    // Most games injure nobody; a roguelike injury should be the exception.
    expect(injuredGames).toBeLessThan(games * 0.5);
  });

  it('a rest node clears injuries', () => {
    const m = initRun('rest', rookie('rest'));
    const [first, ...rest] = m.core.roster.starters;
    const injured = { ...m, core: {
      ...m.core,
      roster: { ...m.core.roster, starters: [{ ...first, gamesOut: 2 }, ...rest] },
    }, phase: { kind: 'rest' as const, nodeId: 'n' } };
    const rested = runReducer(injured, { type: 'rest' })!;
    expect(rested.core.roster.starters[0].gamesOut).toBe(0);
  });

  it('sits an injured starter when healthy depth covers it', () => {
    let m = initRun('dress', rookie('dress'));
    const bench = generateRecruitOffers(1, 1, createRNG('bp'));
    const [first, ...rest] = m.core.roster.starters;
    m = { ...m, core: {
      ...m.core,
      roster: { starters: [{ ...first, gamesOut: 1 }, ...rest], bench },
    } };
    const nodeId = m.core.map.startNodeIds[0];
    m = runReducer(m, { type: 'chooseNode', nodeId })!;
    m = runReducer(m, { type: 'enterGame' })!;
    const dressed = [
      ...m.game!.home.lineup.players,
      ...m.game!.home.bench,
    ].map((p) => p.player.name);
    expect(dressed).not.toContain(first.player.name);
  });
});
