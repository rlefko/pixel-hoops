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
import { NBA_STARTERS } from '@/data/nba';
import {
  runReducer,
  initRun,
  buildHomeTeam,
  buildOpponentTeam,
  TOTAL_MAPS,
  type RunModel,
} from '@/game/run-machine';
import { generateFixedMap } from '@/game/run-map';
import { applyTrainingDelta, MAX_TRAINED_STAT } from '@/game/effects';
import { tierFor } from '@/game/ratings';
import { POSITIONS } from '@/types/roster';
import { SKILL_STAT_KEYS } from '@/types/player';
import type { MapNode } from '@/types/run-map';

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

  it('offers real free agents, never an excluded or duplicate name', () => {
    const exclude = new Set(['Trae Young', 'LaMelo Ball']);
    const offers = generateRecruitOffers(4, 12, createRNG('ex'), exclude);
    const starterNames = new Set(NBA_STARTERS.map((p) => p.name));
    for (const o of offers) {
      expect(exclude.has(o.player.name)).toBe(false);
      expect(starterNames.has(o.player.name)).toBe(true); // a real free agent
      expect(o.legendary).toBeFalsy(); // keepable reals are never gold legends
    }
    expect(new Set(offers.map((o) => o.player.name)).size).toBe(offers.length);
  });
});

describe('generateFixedMap (fixed shape, random types)', () => {
  const seeds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  it('is deterministic from seed + map index', () => {
    expect(generateFixedMap({ seed: 'm', mapIndex: 0 })).toEqual(
      generateFixedMap({ seed: 'm', mapIndex: 0 })
    );
  });

  it('pins the entry to recruit (left) and boost (right)', () => {
    for (const seed of seeds) {
      const map = generateFixedMap({ seed, mapIndex: 1 });
      const [left, right] = map.startNodeIds;
      expect(map.nodes[left].type).toBe('recruit');
      expect(map.nodes[right].type).toBe('boost');
    }
  });

  it('always offers a rest before the boss and a single boss at the end', () => {
    for (const seed of seeds) {
      const map = generateFixedMap({ seed, mapIndex: 2 });
      const bossLayer = map.layers.length - 1;
      expect(map.layers[bossLayer]).toHaveLength(1);
      expect(map.nodes[map.bossNodeId].type).toBe('boss');
      const preBoss = map.layers[bossLayer - 1];
      expect(preBoss.some((id) => map.nodes[id].type === 'rest')).toBe(true);
    }
  });

  it('keeps every node reachable from an entry node', () => {
    const map = generateFixedMap({ seed: 'reach', mapIndex: 0 });
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

  it('gates elites out of the first map', () => {
    for (const seed of seeds) {
      const map = generateFixedMap({ seed, mapIndex: 0 });
      expect(Object.values(map.nodes).some((n) => n.type === 'elite')).toBe(false);
    }
  });
});

describe('home roster persistence', () => {
  it('rookie roster owns five real free agents, one per position, pre-welcome', () => {
    const r = rookie('fa-seed');
    expect(r.players).toHaveLength(5);
    expect(r.seenWelcome).toBe(false);
    expect(r.players.map((p) => p.position)).toEqual([...POSITIONS]);
    const starterNames = new Set(NBA_STARTERS.map((p) => p.name));
    expect(r.players.every((p) => starterNames.has(p.player.name))).toBe(true);
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
      trainingPoints: 0,
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

  it('mergeRunGainsIntoHome strips on-loan legends, items, and training', () => {
    const home = rookie('strip');
    const run = homeToRunRoster(home);
    const legend = legendRecruit(createRNG('lg')); // onLoan: true
    const equipped = {
      ...run.starters[0],
      item: { defId: 'grip-tape' },
      trainingDelta: { outside: 3 },
    };
    const grown = {
      starters: [equipped, ...run.starters.slice(1)],
      bench: [legend],
    };
    const merged = mergeRunGainsIntoHome(
      home,
      grown,
      { coins: 0, reputation: 0, trainingPoints: 0 },
      true
    );
    expect(merged.players.some((p) => p.onLoan)).toBe(false);
    expect(merged.players.every((p) => !p.item)).toBe(true);
    expect(merged.players.every((p) => !p.trainingDelta)).toBe(true);
    expect(merged.legendDryStreak).toBe(0); // a legend was offered this run
  });
});

describe('run reducer', () => {
  const home = rookie('reducer');
  const start = (): RunModel => initRun('seed-1', home);
  /** A bare combat node injected for resolveGameResult flow tests. */
  const node = (over: Partial<MapNode>): MapNode => ({
    id: 'x',
    type: 'game',
    layer: 1,
    next: [],
    round: 1,
    visited: true,
    cleared: false,
    ...over,
  });
  const withNode = (m: RunModel, n: MapNode): RunModel => ({
    ...m,
    core: { ...m.core, map: { ...m.core.map, nodes: { ...m.core.map.nodes, [n.id]: n } } },
  });

  it('opens on the Map-1 boost draft with five starters and no boosts', () => {
    const m = start();
    expect(m.phase.kind).toBe('boostDraft');
    expect(m.boosts).toHaveLength(0);
    expect(m.core.currentMapIndex).toBe(0);
    expect(m.core.currentNodeId).toBeNull();
    expect(m.core.roster.starters).toHaveLength(5);
  });

  it('chooseNode on the recruit entry opens the recruit screen', () => {
    const m = start();
    const recruitId = m.core.map.startNodeIds[0];
    expect(m.core.map.nodes[recruitId].type).toBe('recruit');
    const next = runReducer(m, { type: 'chooseNode', nodeId: recruitId })!;
    expect(next.phase.kind).toBe('recruit');
    expect(next.core.currentNodeId).toBe(recruitId);
  });

  it('chooseNode on a combat node opens pregame', () => {
    const m = start();
    const bossId = m.core.map.bossNodeId;
    const next = runReducer(m, { type: 'chooseNode', nodeId: bossId })!;
    expect(next.phase.kind).toBe('pregame');
  });

  it('simulates a game from pregame through postgame', () => {
    let m = start();
    const bossId = m.core.map.bossNodeId;
    m = runReducer(m, { type: 'chooseNode', nodeId: bossId })!;
    m = runReducer(m, { type: 'enterGame' })!;
    expect(m.phase.kind).toBe('game');
    expect(m.game?.result.events.length).toBeGreaterThan(0);
    m = runReducer(m, { type: 'finishReplay' })!;
    expect(m.phase.kind).toBe('postgame');
  });

  it('a regular game win returns to the map and banks 1 training point', () => {
    const m = withNode(start(), node({ id: 'g1', type: 'game', round: 1 }));
    const won = runReducer(
      { ...m, game: null, phase: { kind: 'postgame', nodeId: 'g1', won: true } },
      { type: 'resolveGameResult' }
    )!;
    expect(won.phase.kind).toBe('map');
    expect(won.wins).toBe(1);
    expect(won.core.rewards.trainingPoints).toBe(1);
  });

  it('an elite win drops gear and banks 2 training points', () => {
    const m = withNode(start(), node({ id: 'e1', type: 'elite', round: 2 }));
    const won = runReducer(
      { ...m, game: null, phase: { kind: 'postgame', nodeId: 'e1', won: true } },
      { type: 'resolveGameResult' }
    )!;
    expect(won.phase.kind).toBe('itemDrop');
    expect(won.core.rewards.trainingPoints).toBe(2);
  });

  it('a non-final boss win advances to the next map (relic then next draft)', () => {
    const m = start();
    const bossId = m.core.map.bossNodeId;
    const afterBoss = runReducer(
      { ...m, game: null, phase: { kind: 'postgame', nodeId: bossId, won: true } },
      { type: 'resolveGameResult' }
    )!;
    // Bosses always drop a relic, so the win lands on the item-drop first.
    expect(afterBoss.phase.kind).toBe('itemDrop');
    expect(afterBoss.core.currentMapIndex).toBe(1);
    expect(afterBoss.wins).toBe(1);
    expect(afterBoss.core.rewards.trainingPoints).toBe(4);
    const draft = runReducer(afterBoss, { type: 'skipDrop' })!;
    expect(draft.phase.kind).toBe('boostDraft');
  });

  it('winning the final map boss crowns a champion', () => {
    const m = start();
    const finalMap: RunModel = {
      ...m,
      core: { ...m.core, currentMapIndex: TOTAL_MAPS - 1 },
    };
    const bossId = finalMap.core.map.bossNodeId;
    const champ = runReducer(
      { ...finalMap, game: null, phase: { kind: 'postgame', nodeId: bossId, won: true } },
      { type: 'resolveGameResult' }
    )!;
    expect(champ.phase).toEqual({ kind: 'summary', champion: true });
  });

  it('a loss ends the run as a non-champion', () => {
    const m = withNode(start(), node({ id: 'g1', type: 'game' }));
    const lost = runReducer(
      { ...m, game: null, phase: { kind: 'postgame', nodeId: 'g1', won: false } },
      { type: 'resolveGameResult' }
    )!;
    expect(lost.phase).toEqual({ kind: 'summary', champion: false });
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

  it('grabbing a free boost item equips it without spending coins', () => {
    const m = start();
    const boostPhase: RunModel = {
      ...m,
      phase: {
        kind: 'boost',
        nodeId: 'n',
        stock: [
          { id: 'grip-tape', name: 'Grip Tape', rarity: 'common', blurb: '', effect: { outside: 1 }, cost: 18 },
        ],
      },
    };
    const next = runReducer(boostPhase, { type: 'takeBoostItem', defId: 'grip-tape', playerIndex: 0 })!;
    expect(next.core.roster.starters[0].item?.defId).toBe('grip-tape');
    expect(next.core.rewards.coins).toBe(0); // free
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

describe('pregame team builders', () => {
  it('builds a deterministic opponent for the same seed and node', () => {
    const m = initRun('det', rookie('det'));
    const nodeId = m.core.map.bossNodeId;
    expect(buildOpponentTeam(m.core, nodeId)).toEqual(
      buildOpponentTeam(m.core, nodeId)
    );
  });

  it('previews the exact opponent the game then simulates', () => {
    let m = initRun('preview', rookie('preview'));
    const nodeId = m.core.map.bossNodeId;
    m = runReducer(m, { type: 'chooseNode', nodeId })!;
    expect(m.phase.kind).toBe('pregame');
    const preview = buildOpponentTeam(m.core, nodeId);
    m = runReducer(m, { type: 'enterGame' })!;
    expect(preview.name).toBe(m.game!.opponentName);
    expect(preview).toEqual(m.game!.away);
  });

  it('previews the dressed home five the game then uses', () => {
    let m = initRun('home-preview', rookie('home-preview'));
    const nodeId = m.core.map.bossNodeId;
    m = runReducer(m, { type: 'chooseNode', nodeId })!;
    const preview = buildHomeTeam(m);
    m = runReducer(m, { type: 'enterGame' })!;
    expect(preview).toEqual(m.game!.home);
  });
});

describe('training points', () => {
  const withPoints = (points: number): RunModel => {
    const m = initRun('train', rookie('train'));
    return {
      ...m,
      core: { ...m.core, rewards: { coins: 0, reputation: 0, trainingPoints: points } },
      phase: { kind: 'training', nodeId: 'n' },
    };
  };

  it('spends one point for a run-scoped +1 and stays on the node', () => {
    const m = withPoints(3);
    const base = m.core.roster.starters[0].player.stats.outside;
    const next = runReducer(m, { type: 'trainPlayer', index: 0, stat: 'outside' })!;
    expect(next.core.roster.starters[0].trainingDelta?.outside).toBe(1);
    expect(next.core.rewards.trainingPoints).toBe(2);
    // Base stats are untouched: training lives in trainingDelta (run-scoped).
    expect(next.core.roster.starters[0].player.stats.outside).toBe(base);
    expect(next.phase.kind).toBe('training');
  });

  it('no-ops with no points to spend', () => {
    const m = withPoints(0);
    expect(runReducer(m, { type: 'trainPlayer', index: 0, stat: 'outside' })).toBe(m);
  });

  it('caps a single skill at MAX_TRAINED_STAT', () => {
    const m = withPoints(5);
    const base = m.core.roster.starters[0].player.stats.outside;
    const maxed: RunModel = {
      ...m,
      core: {
        ...m.core,
        roster: {
          ...m.core.roster,
          starters: [
            { ...m.core.roster.starters[0], trainingDelta: { outside: MAX_TRAINED_STAT - base } },
            ...m.core.roster.starters.slice(1),
          ],
        },
      },
    };
    // Already at the ceiling: a further point is a no-op.
    expect(runReducer(maxed, { type: 'trainPlayer', index: 0, stat: 'outside' })).toBe(maxed);
  });
});

describe('training ratings (S+/S++ tiers and the 15 ceiling)', () => {
  it('applyTrainingDelta clamps to the 3-15 surface', () => {
    const base = { inside: 9, outside: 9, playmaking: 5, perimeterD: 5, interiorD: 5, athleticism: 5, iq: 5, clutch: 5, stamina: 5, durability: 5 };
    const out = applyTrainingDelta(base, { outside: 8, inside: 99 });
    expect(out.outside).toBe(15); // 9 + 8 -> clamped at 15
    expect(out.inside).toBe(15); // clamped at 15
  });

  it('tierFor labels trained-past-10 overalls as S+ and the apex as S++', () => {
    expect(tierFor(13).label).toBe('S++');
    expect(tierFor(12).label).toBe('S+');
    expect(tierFor(11).label).toBe('S+');
    expect(tierFor(10).label).toBe('S');
    expect(tierFor(9).label).toBe('S');
  });
});

describe('item bag (run-scoped)', () => {
  const start = (): RunModel => initRun('seed-bag', rookie('bag'));
  // Give starter 0 a held item, for the swap/unequip cases.
  const withItem = (m: RunModel, defId: string): RunModel => ({
    ...m,
    core: {
      ...m.core,
      roster: {
        ...m.core.roster,
        starters: [
          { ...m.core.roster.starters[0], item: { defId } },
          ...m.core.roster.starters.slice(1),
        ],
      },
    },
  });

  it('addToBag stores an item and returns to the map from a boost node', () => {
    let m = start();
    m = { ...m, phase: { kind: 'boost', nodeId: 'n', stock: [] } };
    const next = runReducer(m, { type: 'addToBag', defId: 'grip-tape' })!;
    expect(next.bag).toEqual(['grip-tape']);
    expect(next.phase.kind).toBe('map');
  });

  it('takeBoostItem swaps an existing item into the bag (never lost)', () => {
    let m = withItem(start(), 'headband');
    m = { ...m, phase: { kind: 'boost', nodeId: 'n', stock: [] } };
    const next = runReducer(m, { type: 'takeBoostItem', defId: 'grip-tape', playerIndex: 0 })!;
    expect(next.core.roster.starters[0].item?.defId).toBe('grip-tape');
    expect(next.bag).toEqual(['headband']);
  });

  it('equipFromBag equips a bag item and returns the old one to the bag', () => {
    let m = withItem(start(), 'headband');
    m = { ...m, bag: ['grip-tape'], phase: { kind: 'bag', returnTo: { kind: 'map' } } };
    const next = runReducer(m, { type: 'equipFromBag', bagIndex: 0, playerIndex: 0 })!;
    expect(next.core.roster.starters[0].item?.defId).toBe('grip-tape');
    expect(next.bag).toEqual(['headband']); // swapped, not lost
    expect(next.phase.kind).toBe('bag'); // stays in the bag
  });

  it('unequipToBag moves a held item to the bag', () => {
    let m = withItem(start(), 'headband');
    m = { ...m, phase: { kind: 'bag', returnTo: { kind: 'map' } } };
    const next = runReducer(m, { type: 'unequipToBag', playerIndex: 0 })!;
    expect(next.core.roster.starters[0].item).toBeUndefined();
    expect(next.bag).toEqual(['headband']);
  });
});

describe('boosts, economy, and legends', () => {
  const start = (): RunModel => initRun('seed-econ', rookie('econ'));

  it('drafting a boost equips it and lands on the map (run-start draft)', () => {
    let m = start();
    expect(m.phase.kind).toBe('boostDraft');
    const offer = m.phase.kind === 'boostDraft' ? m.phase.offers[0] : null;
    m = runReducer(m, { type: 'draftBoost', offer: offer! })!;
    expect(m.boosts).toHaveLength(1);
    expect(m.phase.kind).toBe('map');
  });

  it('skipping the draft takes nothing and returns to the map', () => {
    let m = start();
    m = runReducer(m, { type: 'skipBoostDraft' })!;
    expect(m.core.rewards.coins).toBe(0); // coins come only from winning games
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

  it('skipping the full-slots drop keeps all five and declines the new boost', () => {
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
    expect(m.phase.kind === 'boostDraft' && m.phase.pendingFull).toBe(true);
    const skipped = runReducer(m, { type: 'skipBoostDraft' })!;
    expect(skipped.boosts).toHaveLength(5);
    expect(skipped.boosts.some((b) => b.id === 'splash-brothers')).toBe(false); // declined
    expect(skipped.core.rewards.coins).toBe(0); // no reward
    expect(skipped.phase.kind).toBe('map');
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
});

describe('between-game injuries', () => {
  const playWonGame = (seed: string): RunModel => {
    let m = initRun(seed, rookie(`inj-${seed}`));
    const nodeId = m.core.map.bossNodeId; // any combat node; bosses always exist
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
    const injured = {
      ...m,
      core: {
        ...m.core,
        roster: { ...m.core.roster, starters: [{ ...first, gamesOut: 2 }, ...rest] },
      },
      phase: { kind: 'rest' as const, nodeId: 'n' },
    };
    const rested = runReducer(injured, { type: 'rest' })!;
    expect(rested.core.roster.starters[0].gamesOut).toBe(0);
  });

  it('sits an injured starter when healthy depth covers it', () => {
    let m = initRun('dress', rookie('dress'));
    const bench = generateRecruitOffers(1, 1, createRNG('bp'));
    const [first, ...rest] = m.core.roster.starters;
    m = {
      ...m,
      core: {
        ...m.core,
        roster: { starters: [{ ...first, gamesOut: 1 }, ...rest], bench },
      },
    };
    const nodeId = m.core.map.bossNodeId;
    m = runReducer(m, { type: 'chooseNode', nodeId })!;
    m = runReducer(m, { type: 'enterGame' })!;
    const dressed = [
      ...m.game!.home.lineup.players,
      ...m.game!.home.bench,
    ].map((p) => p.player.name);
    expect(dressed).not.toContain(first.player.name);
  });
});
