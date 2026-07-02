import { describe, it, expect } from 'vitest';
import { createRNG } from '@/game/rng';
import { generateRecruitOffers } from '@/game/tournament';
import {
  applyUpgrade,
  createRookieRoster,
  homeToRunRoster,
  mergeRunGainsIntoHome,
  rememberDraftRotation,
  serializeHomeRoster,
  deserializeHomeRoster,
  type HomeRoster,
} from '@/game/home-roster';
import { legendRecruit, realPlayerToRosterPlayer } from '@/game/player-pool';
import { NBA_LEGENDS, NBA_POOL } from '@/data/nba';
import {
  runReducer,
  initRun,
  buildHomeTeam,
  buildOpponentTeam,
  coachReorderRoster,
  computeCoachRec,
  pendingWinRewards,
  steppingInSubs,
  TOTAL_MAPS,
  MAX_BANISHES,
  type RunModel,
} from '@/game/run-machine';
import { generateFixedMap } from '@/game/run-map';
import { applyTrainingDelta, MAX_TRAINED_STAT } from '@/game/effects';
import { tierFor } from '@/game/ratings';
import { MAX_DRAFT_ROTATION, MAX_RUN_ROSTER } from '@/game/draft';
import { POSITIONS, type RosterPlayer } from '@/types/roster';
import type { MapNode } from '@/types/run-map';

function rookie(seed = 'home'): HomeRoster {
  return createRookieRoster(createRNG(seed));
}

/** Start a run and confirm the default loadout, landing on the boost draft, the
 * way the downstream reducer tests expect. */
function started(runSeed: string, homeSeed = runSeed): RunModel {
  const m = initRun(runSeed, rookie(homeSeed));
  if (m.phase.kind !== 'draft') return m;
  return runReducer(m, {
    type: 'confirmDraft',
    starters: m.phase.defaultStarters,
    bench: m.phase.defaultBench,
  })!;
}

/** Like {@link started} but also skips the boost draft, landing on the map (where
 * a node can be chosen). chooseNode is only valid from the map phase. */
function atMap(runSeed: string, homeSeed = runSeed): RunModel {
  return runReducer(started(runSeed, homeSeed), { type: 'skipBoostDraft' })!;
}

describe('generateRecruitOffers', () => {
  it('is deterministic and honors count', () => {
    const a = generateRecruitOffers('C', 'easy', 0, 3, createRNG('r1'));
    const b = generateRecruitOffers('C', 'easy', 0, 3, createRNG('r1'));
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
  });

  it('differs by seed', () => {
    const a = generateRecruitOffers('C', 'easy', 0, 3, createRNG('r1'));
    const b = generateRecruitOffers('C', 'easy', 0, 3, createRNG('r2'));
    expect(a).not.toEqual(b);
  });

  it('shapes C-ladder offers as mostly C with only a rare reach-up to B (never A/S)', () => {
    const offers = generateRecruitOffers('C', 'easy', 0.5, 40, createRNG('cshape'));
    for (const o of offers) {
      expect(['C', 'B']).toContain(o.originalClass); // never D (no pool) or A/S
      expect(POSITIONS).toContain(o.position);
      expect(o.legendary).toBeFalsy();
    }
    expect(offers.filter((o) => o.originalClass === 'C').length).toBeGreaterThan(offers.length / 2);
  });

  it('never leaks S-class stars onto the A ladder, even at insane (heaviest reach-up)', () => {
    const offers = generateRecruitOffers('A', 'insane', 1, 40, createRNG('aleak'));
    for (const o of offers) {
      expect(o.originalClass).not.toBe('S'); // the A->S leak is closed at every difficulty
      expect(['A', 'B']).toContain(o.originalClass); // A primary, B for depth
      expect(o.legendary).toBeFalsy();
    }
  });

  it('mixes S and A on the S ladder so S stays scarce under repeat farming', () => {
    const offers = generateRecruitOffers('S', 'easy', 0.5, 40, createRNG('smix'));
    const classes = new Set(offers.map((o) => o.originalClass));
    expect(classes.has('S')).toBe(true);
    expect(classes.has('A')).toBe(true);
    for (const o of offers) {
      expect(['S', 'A']).toContain(o.originalClass);
      expect(o.legendary).toBeFalsy(); // legends come only via the pity-gated reveal
    }
  });

  it('a harder difficulty reaches up more often (better recruit quality as a risk/reward)', () => {
    // C-ladder reach-up is to B; insane weights it far heavier than easy, so a brutal run
    // trickles more B-class recruits (kept only on a clear). Deterministic per seed.
    const countB = (d: 'easy' | 'insane') =>
      generateRecruitOffers('C', d, 0.5, 40, createRNG('reachup')).filter(
        (o) => o.originalClass === 'B'
      ).length;
    expect(countB('insane')).toBeGreaterThan(countB('easy'));
  });

  it('raises the S share on the S ladder as difficulty climbs', () => {
    const countS = (d: 'easy' | 'insane') =>
      generateRecruitOffers('S', d, 0.5, 30, createRNG('sshare')).filter(
        (o) => o.originalClass === 'S'
      ).length;
    expect(countS('insane')).toBeGreaterThanOrEqual(countS('easy'));
  });

  it('offers real players, never an excluded or duplicate name', () => {
    const exclude = new Set(['Trae Young', 'LaMelo Ball']);
    const offers = generateRecruitOffers('B', 'easy', 0.5, 12, createRNG('ex'), exclude);
    const poolNames = new Set(NBA_POOL.map((p) => p.name));
    for (const o of offers) {
      expect(exclude.has(o.player.name)).toBe(false);
      expect(poolNames.has(o.player.name)).toBe(true); // a real player
      expect(o.legendary).toBeFalsy();
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
  it('rookie roster owns the starting twelve (5 D + 5 C + 2 B), pre-welcome', () => {
    const r = rookie('fa-seed');
    expect(r.players).toHaveLength(12);
    expect(r.seenWelcome).toBe(false);
    expect(r.selectedDifficulty).toBe('easy');
    expect(r.selectedLadderClass).toBe('C');
    const classes = r.players.map((p) => p.originalClass);
    expect(classes.filter((c) => c === 'D')).toHaveLength(5);
    expect(classes.filter((c) => c === 'C')).toHaveLength(5);
    expect(classes.filter((c) => c === 'B')).toHaveLength(2);
    // C and B starters are real players; D are procedural.
    const poolNames = new Set(NBA_POOL.map((p) => p.name));
    const realCount = r.players.filter((p) => poolNames.has(p.player.name)).length;
    expect(realCount).toBe(7);
  });

  it('homeToRunRoster puts five in starters and the rest on the bench', () => {
    const base = rookie();
    const home = {
      ...base,
      players: [...base.players, ...generateRecruitOffers('C', 'easy', 0, 3, createRNG('x'))],
    };
    const run = homeToRunRoster(home);
    expect(run.starters).toHaveLength(5);
    expect(run.bench).toHaveLength(home.players.length - 5);
  });

  it('banks new recruits on a clear (owned or in-progress) and carries rewards', () => {
    const home = rookie();
    const run = homeToRunRoster(home);
    const homeKeys = new Set(home.players.map((p) => `${p.player.name}|${p.position}`));
    const recruits = generateRecruitOffers('B', 'easy', 0.5, 6, createRNG('m')).filter(
      (r) => !homeKeys.has(`${r.player.name}|${r.position}`)
    );
    expect(recruits.length).toBeGreaterThan(0);
    const grown = { ...run, bench: [...run.bench, ...recruits] };
    // champion = true: recruits are kept only when the run is cleared.
    const merged = mergeRunGainsIntoHome(home, grown, {
      rewards: { coins: 5, reputation: 3, trainingPoints: 0 },
      champion: true,
    });
    // Each new recruit is banked, never lost: B/C own on the first copy (into players), A
    // accrues a copy (into collecting). So the gains land across players + collecting.
    const playersGained = merged.players.length - home.players.length;
    expect(playersGained + merged.collecting.length).toBeGreaterThan(0);
    // Coins bank as-earned (the useRun ledger), so the merge leaves the wallet untouched.
    expect(merged.coins).toBe(home.coins);
    expect(merged.reputation).toBe(home.reputation + 3);
    // Owned players stay unique by name|position (no duplicates).
    const keys = merged.players.map((p) => `${p.player.name}|${p.position}`);
    expect(new Set(keys).size).toBe(keys.length);

    // Flooding with many C recruits (own on the first copy) grows past any old 17-player cap.
    const cRecruits = generateRecruitOffers('C', 'easy', 0, 30, createRNG('big')).filter(
      (r) => !homeKeys.has(`${r.player.name}|${r.position}`)
    );
    const flooded = { ...run, bench: cRecruits };
    expect(mergeRunGainsIntoHome(home, flooded, { champion: true }).players.length).toBeGreaterThan(17);
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
    const home = { ...rookie('up'), coins: 5000 };
    const before = home.players[0].player.stats.inside;
    const up = applyUpgrade(home, 0, 'inside');
    expect(up.players[0].player.stats.inside).toBe(Math.min(30, before + 1));
    expect(up.coins).toBe(4800); // first standard buy costs 200
    // The 2nd +1 is twice the first.
    const up2 = applyUpgrade(up, 0, 'inside');
    expect(up.coins - up2.coins).toBe(400);
    // Unaffordable is a no-op (same reference).
    const broke = { ...home, coins: 100 };
    expect(applyUpgrade(broke, 0, 'inside')).toBe(broke);
  });

  it('mergeRunGainsIntoHome strips on-loan legends, items, training, and injuries', () => {
    const home = rookie('strip');
    const run = homeToRunRoster(home);
    const legend = legendRecruit(createRNG('lg')); // onLoan: true
    const equipped = {
      ...run.starters[0],
      item: { defId: 'grip-tape' },
      trainingDelta: { outside: 3 },
      gamesOut: 2, // a run-scoped injury must not follow the player home
    };
    const grown = {
      starters: [equipped, ...run.starters.slice(1)],
      bench: [legend],
    };
    const merged = mergeRunGainsIntoHome(home, grown, {
      rewards: { coins: 0, reputation: 0, trainingPoints: 0 },
      legendOffered: true,
    });
    expect(merged.players.some((p) => p.onLoan)).toBe(false);
    expect(merged.players.every((p) => !p.item)).toBe(true);
    expect(merged.players.every((p) => !p.trainingDelta)).toBe(true);
    expect(merged.players.every((p) => !p.gamesOut)).toBe(true);
    expect(merged.legendDryStreak).toBe(0); // a legend was offered this run
  });

  it('mergeRunGainsIntoHome heals an injured-only starter (no item or training)', () => {
    // Guards against the early-return skipping a player who is *only* injured.
    const home = rookie('inj-only');
    const run = homeToRunRoster(home);
    const injured = { ...run.starters[0], gamesOut: 2 };
    const grown = { starters: [injured, ...run.starters.slice(1)], bench: run.bench };
    const merged = mergeRunGainsIntoHome(home, grown);
    expect(merged.players.every((p) => !p.gamesOut)).toBe(true);
  });

  it('deserializeHomeRoster strips a leaked injury counter', () => {
    const home = rookie('inj-deser');
    const leaked = serializeHomeRoster({
      ...home,
      players: [{ ...home.players[0], gamesOut: 1 }, ...home.players.slice(1)],
    });
    expect(deserializeHomeRoster(leaked)?.players.every((p) => !p.gamesOut)).toBe(true);
  });

  it('the next run starts fully healthy after ending the prior run injured', () => {
    // The regression that matches the report: an end-of-run injury reordered the
    // starting five on the next run's first game. Injuries must heal at the boundary.
    const home = rookie('cross-run');
    const ended = homeToRunRoster(home);
    ended.starters[1] = { ...ended.starters[1], gamesOut: 1 };
    ended.starters[3] = { ...ended.starters[3], gamesOut: 2 };
    const merged = mergeRunGainsIntoHome(home, ended);
    const next = homeToRunRoster(merged);
    expect([...next.starters, ...next.bench].every((p) => !p.gamesOut)).toBe(true);
  });

  it('a cleared run grows the collection uncapped and never leaks injuries at merge', () => {
    const home = rookie('inj-cap');
    const run = homeToRunRoster(home);
    const flooded = {
      starters: [{ ...run.starters[0], gamesOut: 2 }, ...run.starters.slice(1)],
      bench: generateRecruitOffers('C', 'easy', 0, 30, createRNG('flood')),
    };
    const merged = mergeRunGainsIntoHome(home, flooded, { champion: true }); // champion keeps recruits
    expect(merged.players.length).toBeGreaterThan(17); // no 17-player cap any more
    // Every owned player is still present (recency reorders, never drops).
    const key = (p: RosterPlayer) => `${p.player.name}|${p.position}`;
    const mergedKeys = new Set(merged.players.map(key));
    expect(home.players.every((p) => mergedKeys.has(key(p)))).toBe(true);
    // The five fielded starters sort to the front (most recently used).
    expect(merged.players.slice(0, 5).map(key)).toEqual(run.starters.map(key));
    expect(merged.players.every((p) => !p.gamesOut)).toBe(true);
  });

  it('preserves rosterMemory across a merge (the rotation is captured at draft confirm)', () => {
    const rotation = ['a|PG', 'b|SG', 'c|SF', 'd|PF', 'e|C'];
    const home = rememberDraftRotation(rookie('rot'), 'easy', 'C', rotation);
    const merged = mergeRunGainsIntoHome(home, homeToRunRoster(home));
    // The merge no longer writes a global rotation; the per-cell memory survives intact.
    expect('lastRotation' in merged).toBe(false);
    expect(merged.rosterMemory.easy.C).toEqual(rotation);
  });

  it('migrates a pre-v9 save: a single lastRotation seeds the selected rosterMemory cell', () => {
    const base = rookie('v9mig');
    const five = base.players.slice(0, 5).map((p) => `${p.player.name}|${p.position}`);
    const legacy = {
      version: 8,
      data: {
        players: base.players,
        coins: 11,
        upgrades: {},
        ladderProgress: base.ladderProgress,
        selectedDifficulty: 'hard',
        selectedLadderClass: 'B',
        lastRotation: five,
      },
    };
    const restored = deserializeHomeRoster(legacy);
    expect(restored).not.toBeNull();
    // The legacy rotation lands in the selected (difficulty, ladder) cell.
    expect(restored!.rosterMemory.hard.B).toEqual(five);
    // Other cells stay empty, and the old flat field is gone.
    expect(restored!.rosterMemory.easy).toEqual({});
    expect(restored!.rosterMemory.hard.C).toBeUndefined();
    expect('lastRotation' in restored!).toBe(false);
  });

  it('advances the ladder on the difficulty actually played, not the selection', () => {
    // Selected easy, but the run was played on medium: clearing it must advance
    // medium's ladder, never easy's.
    const home = { ...rookie('played'), selectedDifficulty: 'easy' as const };
    const run = homeToRunRoster(home);
    const merged = mergeRunGainsIntoHome(home, run, { champion: true, clearedClass: 'C', playedDifficulty: 'medium' });
    expect(merged.ladderProgress.medium).toBe('C');
    expect(merged.ladderProgress.easy).toBeNull();
  });

  it('migrates a pre-v6 (League-tier) save and backfills new fields', () => {
    const home = rookie('mig');
    // Simulate an old serialized save: v5 fields, no v6 fields.
    const legacy = {
      version: 5,
      data: {
        players: home.players.map((p) => {
          const { originalClass: _omit, ...rest } = p;
          return rest;
        }),
        coins: 42,
        reputation: 7,
        upgrades: {},
        legendDryStreak: 2,
        leagueTier: 3,
        selectedTier: 1,
        seenWelcome: true,
      },
    };
    const restored = deserializeHomeRoster(legacy);
    expect(restored).not.toBeNull();
    expect(restored!.coins).toBe(42);
    expect(restored!.selectedDifficulty).toBe('easy');
    expect(restored!.selectedLadderClass).toBe('C');
    expect(restored!.abilityInventory).toEqual({});
    expect(restored!.equippedAbilities).toEqual({});
    expect(restored!.ladderProgress.easy).toBeNull();
    // originalClass is backfilled from base stats for every player.
    expect(restored!.players.every((p) => !!p.originalClass)).toBe(true);
    // The dropped League-tier fields are gone.
    expect('leagueTier' in restored!).toBe(false);
  });
});

describe('initRun draft pre-fill (roster memory)', () => {
  const key = (p: RosterPlayer) => `${p.player.name}|${p.position}`;
  const starterKeys = (m: RunModel): string[] =>
    m.phase.kind === 'draft' ? m.phase.defaultStarters.map(key) : [];

  it('pre-fills the draft from the saved rotation for the exact (difficulty, ladder)', () => {
    const base = rookie('prefill'); // easy / C, empty memory
    const fresh = starterKeys(initRun('s0', base)); // freshly built, PG..C ordered
    const saved = [...fresh].reverse(); // a distinct yet legal order proves a restore
    const home = rememberDraftRotation(base, 'easy', 'C', saved);
    expect(starterKeys(initRun('s1', home))).toEqual(saved);
  });

  it('falls back to the nearest lower ladder at the same difficulty', () => {
    const base = rookie('inherit');
    const cFive = [...starterKeys(initRun('s0', base))].reverse(); // saved on easy / C
    const home = {
      ...rememberDraftRotation(base, 'easy', 'C', cFive),
      selectedLadderClass: 'B' as const,
    };
    // B / easy has no memory of its own, so the draft inherits the C / easy team.
    expect(starterKeys(initRun('s1', home))).toEqual(cFive);
  });
});

describe('run reducer', () => {
  const home = rookie('reducer');
  // A run now opens on the pre-run five pick; confirm it so the helper returns the
  // model at the Map-1 boost draft, the way the downstream tests expect.
  const start = (): RunModel => {
    const m = initRun('seed-1', home);
    if (m.phase.kind !== 'draft') return m;
    return runReducer(m, {
      type: 'confirmDraft',
      starters: m.phase.defaultStarters,
      bench: m.phase.defaultBench,
    })!;
  };
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

  it('opens on the pre-run draft with the full collection and a default loadout', () => {
    const m = initRun('seed-1', home);
    expect(m.phase.kind).toBe('draft');
    expect(m.difficulty).toBe(home.selectedDifficulty);
    expect(m.ladderClass).toBe(home.selectedLadderClass);
    if (m.phase.kind === 'draft') {
      expect(m.phase.available).toHaveLength(home.players.length);
      // Default loadout fills all five starter slots, one per position by default.
      expect(m.phase.defaultStarters).toHaveLength(5);
      expect(m.phase.defaultStarters.map((p) => p.position)).toEqual([...POSITIONS]);
      expect(m.phase.defaultStarters.length + m.phase.defaultBench.length).toBeLessThanOrEqual(
        MAX_DRAFT_ROTATION
      );
    }
  });

  it('opens on the Map-1 boost draft with five starters and no boosts', () => {
    const m = start();
    expect(m.phase.kind).toBe('boostDraft');
    expect(m.boosts).toHaveLength(0);
    expect(m.core.currentMapIndex).toBe(0);
    expect(m.core.currentNodeId).toBeNull();
    expect(m.core.roster.starters).toHaveLength(5);
  });

  it('confirming the draft opens the boost draft and slots the starters as given', () => {
    const m = initRun('seed-1', home);
    if (m.phase.kind !== 'draft') throw new Error('expected draft');
    const { defaultStarters, defaultBench } = m.phase;
    const next = runReducer(m, {
      type: 'confirmDraft',
      starters: defaultStarters,
      bench: defaultBench,
    })!;
    expect(next.phase.kind).toBe('boostDraft');
    // Starters are set verbatim (slot order preserved, no OVR re-sort).
    expect(next.core.roster.starters).toEqual(defaultStarters);
    expect(next.core.roster.bench).toEqual(defaultBench);
  });

  it('rejects a draft over the difficulty point budget', () => {
    // Insane = 2 draft points: the squeeze is real but never a full collection ban.
    const insaneHome = {
      ...rookie('reducer'),
      selectedDifficulty: 'insane' as const,
      selectedLadderClass: 'C' as const,
    };
    const m = initRun('rich', insaneHome);
    if (m.phase.kind !== 'draft') throw new Error('expected draft');
    const dOnly = m.phase.available.filter((p) => p.originalClass === 'D').slice(0, 5);
    const cs = m.phase.available.filter((p) => p.originalClass === 'C');
    // Three free D players plus two at-ladder C players (1 point each) fit 2 points:
    // "my guys, against the wall" instead of a forced all-D five.
    const mixed = [...dOnly.slice(0, 3), ...cs.slice(0, 2)];
    const ok = runReducer(m, { type: 'confirmDraft', starters: mixed, bench: [] })!;
    expect(ok.phase.kind).toBe('boostDraft');
    // A third C player (3 points total) blows the 2-point budget -> rejected.
    const over = runReducer(m, { type: 'confirmDraft', starters: mixed, bench: [cs[2]] })!;
    expect(over.phase.kind).toBe('draft'); // rejected, still drafting
  });

  it('chooseNode on the recruit entry opens the recruit screen', () => {
    const m = atMap('seed-1', 'reducer');
    const recruitId = m.core.map.startNodeIds[0];
    expect(m.core.map.nodes[recruitId].type).toBe('recruit');
    const next = runReducer(m, { type: 'chooseNode', nodeId: recruitId })!;
    expect(next.phase.kind).toBe('recruit');
    expect(next.core.currentNodeId).toBe(recruitId);
  });

  it('chooseNode on a combat node opens pregame', () => {
    const m = atMap('seed-1', 'reducer');
    const bossId = m.core.map.bossNodeId;
    const next = runReducer(m, { type: 'chooseNode', nodeId: bossId })!;
    expect(next.phase.kind).toBe('pregame');
  });

  it('simulates a game from pregame through postgame', () => {
    let m = atMap('seed-1', 'reducer');
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

  it('pendingWinRewards matches exactly what resolveGameResult banks', () => {
    // Run a real sim so the payout includes the dominance bonus, then compare the
    // UI-facing tally against the banked deltas.
    const pre = withNode(start(), node({ id: 'g1', type: 'game', round: 1 }));
    const game = runReducer({ ...pre, phase: { kind: 'pregame', nodeId: 'g1' } }, {
      type: 'enterGame',
    })!;
    const postgame = { ...game, phase: { kind: 'postgame', nodeId: 'g1', won: true } as const };
    const pending = pendingWinRewards(postgame);
    const resolved = runReducer(postgame, { type: 'resolveGameResult' })!;
    expect(pending).not.toBeNull();
    expect(resolved.core.rewards.coins - postgame.core.rewards.coins).toBe(pending!.coins);
    expect(resolved.core.rewards.trainingPoints - postgame.core.rewards.trainingPoints).toBe(
      pending!.trainingPoints
    );
    expect(resolved.core.rewards.reputation - postgame.core.rewards.reputation).toBe(
      pending!.reputation
    );
    // And it stays null anywhere but a winning postgame.
    expect(pendingWinRewards(pre)).toBeNull();
    expect(
      pendingWinRewards({ ...game, phase: { kind: 'postgame', nodeId: 'g1', won: false } })
    ).toBeNull();
  });

  it('stamps a played combat node with its result so the map tile can show W/score', () => {
    // Run a real sim so the model carries genuine scores, then resolve the node.
    const pre = withNode(start(), node({ id: 'g1', type: 'game', round: 1 }));
    const game = runReducer({ ...pre, phase: { kind: 'pregame', nodeId: 'g1' } }, {
      type: 'enterGame',
    })!;
    const { finalHome, finalAway } = game.game!.result;
    // Force a win so the W path is exercised regardless of the sim's outcome.
    const won = runReducer(
      { ...game, phase: { kind: 'postgame', nodeId: 'g1', won: true } },
      { type: 'resolveGameResult' }
    )!;
    expect(won.phase.kind).toBe('map');
    expect(won.core.map.nodes.g1.result).toEqual({ won: true, home: finalHome, away: finalAway });
  });

  it('stamps a red L on a run-ending loss (no timeouts left)', () => {
    const pre = withNode(start(), node({ id: 'g1', type: 'game', round: 1 }));
    const game = runReducer({ ...pre, phase: { kind: 'pregame', nodeId: 'g1' } }, {
      type: 'enterGame',
    })!;
    const lost = runReducer(
      { ...game, secondChancesRemaining: 0, phase: { kind: 'postgame', nodeId: 'g1', won: false } },
      { type: 'resolveGameResult' }
    )!;
    expect(lost.phase.kind).toBe('summary');
    expect(lost.core.map.nodes.g1.result?.won).toBe(false);
  });

  it('does not stamp a node when a loss is forgiven by a timeout (it may be replayed)', () => {
    const pre = withNode(start(), node({ id: 'g1', type: 'game', round: 1 }));
    const game = runReducer({ ...pre, phase: { kind: 'pregame', nodeId: 'g1' } }, {
      type: 'enterGame',
    })!;
    const forgiven = runReducer(
      { ...game, secondChancesRemaining: 1, phase: { kind: 'postgame', nodeId: 'g1', won: false } },
      { type: 'resolveGameResult' }
    )!;
    expect(forgiven.phase.kind).toBe('pregame');
    expect(forgiven.core.map.nodes.g1.result).toBeUndefined();
  });

  it('an elite win drops no gear but banks 2 training points', () => {
    const m = withNode(start(), node({ id: 'e1', type: 'elite', round: 2 }));
    const won = runReducer(
      { ...m, game: null, phase: { kind: 'postgame', nodeId: 'e1', won: true } },
      { type: 'resolveGameResult' }
    )!;
    // Elites no longer drop items (only bosses do); the win returns to the map.
    expect(won.phase.kind).toBe('map');
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

  it('a loss ends the run as a non-champion when no timeouts remain', () => {
    const m = withNode({ ...start(), secondChancesRemaining: 0 }, node({ id: 'g1', type: 'game' }));
    const lost = runReducer(
      { ...m, game: null, phase: { kind: 'postgame', nodeId: 'g1', won: false } },
      { type: 'resolveGameResult' }
    )!;
    expect(lost.phase).toEqual({ kind: 'summary', champion: false });
  });

  it('a loss spends a timeout and replays the game instead of ending the run', () => {
    const m = withNode(start(), node({ id: 'g1', type: 'game' }));
    expect(m.secondChancesRemaining).toBeGreaterThan(0);
    const forgiven = runReducer(
      { ...m, game: null, phase: { kind: 'postgame', nodeId: 'g1', won: false } },
      { type: 'resolveGameResult' }
    )!;
    // coachRec resolves to null on a replay: the banner stays quiet and the async
    // scout (which only fills undefined) never recomputes for it.
    expect(forgiven.phase).toEqual({ kind: 'pregame', nodeId: 'g1', timeoutUsed: true, coachRec: null });
    expect(forgiven.secondChancesRemaining).toBe(m.secondChancesRemaining - 1);
    expect(forgiven.forgivenLosses).toBe(1);
  });

  it('replays a forgiven game with a fresh roll (seed varies by timeouts spent)', () => {
    const base = withNode(start(), node({ id: 'g1', type: 'game' }));
    const first = runReducer(
      { ...base, forgivenLosses: 0, phase: { kind: 'pregame', nodeId: 'g1' } },
      { type: 'enterGame' }
    )!;
    const replay = runReducer(
      { ...base, forgivenLosses: 1, phase: { kind: 'pregame', nodeId: 'g1' } },
      { type: 'enterGame' }
    )!;
    expect(first.game).not.toBeNull();
    expect(replay.game).not.toBeNull();
    // A spent timeout salts the seed, so the replay is a new roll, not the same loss.
    expect(replay.game!.result.events).not.toEqual(first.game!.result.events);
  });

  it('recruit appends to the bench and returns to the map', () => {
    const m = start();
    const before = m.core.roster.bench.length;
    const [offer] = generateRecruitOffers('C', 'easy', 0, 1, createRNG('o'));
    const next = runReducer(
      { ...m, phase: { kind: 'recruit', nodeId: 'n', offers: [offer], rerolled: [false] } },
      { type: 'recruit', player: offer }
    )!;
    expect(next.core.roster.bench).toHaveLength(before + 1);
    expect(next.core.roster.bench).toContainEqual(offer);
    expect(next.phase.kind).toBe('map');
  });

  it('recruiting past the 12-man cap asks for a drop', () => {
    let m = start();
    // Pad the roster to the 12-man cap.
    const fillers = generateRecruitOffers('C', 'easy', 0, 12, createRNG('fill'));
    const all = [...m.core.roster.starters, ...m.core.roster.bench, ...fillers].slice(0, MAX_RUN_ROSTER);
    m = { ...m, core: { ...m.core, roster: { starters: all.slice(0, 5), bench: all.slice(5) } } };
    const [offer] = generateRecruitOffers('B', 'easy', 0, 1, createRNG('over'));
    const next = runReducer(
      { ...m, phase: { kind: 'recruit', nodeId: 'n', offers: [offer], rerolled: [false] } },
      { type: 'recruit', player: offer }
    )!;
    expect(next.phase.kind).toBe('dropForRecruit');
    // Dropping a player takes the recruit and returns to the map at the cap.
    const dropped = runReducer(next, { type: 'dropForRecruit', index: 0 })!;
    expect(dropped.phase.kind).toBe('map');
    expect(dropped.core.roster.starters.length + dropped.core.roster.bench.length).toBe(MAX_RUN_ROSTER);
  });

  it('keeping the squad from dropForRecruit discards the incoming and leaves the roster unchanged', () => {
    let m = start();
    // Pad the roster to the 12-man cap so recruiting forces the drop screen.
    const fillers = generateRecruitOffers('C', 'easy', 0, 12, createRNG('fill'));
    const all = [...m.core.roster.starters, ...m.core.roster.bench, ...fillers].slice(0, MAX_RUN_ROSTER);
    m = { ...m, core: { ...m.core, roster: { starters: all.slice(0, 5), bench: all.slice(5) } } };
    const [offer] = generateRecruitOffers('B', 'easy', 0, 1, createRNG('over'));
    const next = runReducer(
      { ...m, phase: { kind: 'recruit', nodeId: 'n', offers: [offer], rerolled: [false] } },
      { type: 'recruit', player: offer }
    )!;
    expect(next.phase.kind).toBe('dropForRecruit');
    // Keeping the squad backs out: roster untouched, bag untouched, recruit dropped.
    const kept = runReducer(next, { type: 'backToMap' })!;
    expect(kept.phase.kind).toBe('map');
    expect(kept.core.roster).toEqual(m.core.roster);
    expect([...kept.core.roster.starters, ...kept.core.roster.bench]).not.toContainEqual(offer);
    expect(kept.bag).toEqual(next.bag);
  });

  it('rerolls one recruit option once, deterministically, then refuses a second reroll', () => {
    const m = start();
    const offers = generateRecruitOffers('C', 'easy', 0, 3, createRNG('offers'));
    const recruitModel: RunModel = {
      ...m,
      phase: { kind: 'recruit', nodeId: 'n1', offers, rerolled: [false, false, false] },
    };
    const after = runReducer(recruitModel, { type: 'rerollRecruit', index: 1 })!;
    expect(after.phase.kind).toBe('recruit');
    if (after.phase.kind !== 'recruit') return;
    expect(after.phase.rerolled).toEqual([false, true, false]);
    expect(after.phase.offers[0]).toBe(offers[0]); // other options untouched
    expect(after.phase.offers[2]).toBe(offers[2]);
    expect(after.phase.offers[1].player.name).not.toBe(offers[1].player.name); // replaced
    // A second reroll of the same option is a no-op (one reroll per option per node).
    const again = runReducer(after, { type: 'rerollRecruit', index: 1 })!;
    expect(again.phase.kind === 'recruit' && again.phase.offers[1].player.name).toBe(
      after.phase.offers[1].player.name
    );
    // Deterministic: the same model + action yields the same replacement.
    const repeat = runReducer(recruitModel, { type: 'rerollRecruit', index: 1 })!;
    expect(repeat.phase.kind === 'recruit' && repeat.phase.offers[1].player.name).toBe(
      after.phase.offers[1].player.name
    );
  });

  it('grabbing a free boost item equips it without spending coins', () => {
    const m = start();
    const boostPhase: RunModel = {
      ...m,
      phase: {
        kind: 'boost',
        nodeId: 'n',
        stock: [
          { id: 'grip-tape', name: 'Grip Tape', rarity: 'common', blurb: '', effect: { outside: 1 } },
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
    const m = started('det');
    const nodeId = m.core.map.bossNodeId;
    expect(buildOpponentTeam(m.core, nodeId, m.mods)).toEqual(
      buildOpponentTeam(m.core, nodeId, m.mods)
    );
  });

  it('previews the exact opponent the game then simulates', () => {
    let m = atMap('preview');
    const nodeId = m.core.map.bossNodeId;
    m = runReducer(m, { type: 'chooseNode', nodeId })!;
    expect(m.phase.kind).toBe('pregame');
    const preview = buildOpponentTeam(m.core, nodeId, m.mods);
    m = runReducer(m, { type: 'enterGame' })!;
    expect(preview.name).toBe(m.game!.opponentName);
    expect(preview).toEqual(m.game!.away);
  });

  it('previews the dressed home five the game then uses', () => {
    let m = atMap('home-preview');
    const nodeId = m.core.map.bossNodeId;
    m = runReducer(m, { type: 'chooseNode', nodeId })!;
    const preview = buildHomeTeam(m);
    m = runReducer(m, { type: 'enterGame' })!;
    expect(preview).toEqual(m.game!.home);
  });
});

describe('training points', () => {
  const withPoints = (points: number): RunModel => {
    const m = started('train');
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

describe('training ratings (S+/S++ tiers and the 30 ceiling)', () => {
  it('applyTrainingDelta clamps to the 6-30 surface', () => {
    const base = { inside: 18, outside: 18, playmaking: 10, perimeterD: 10, interiorD: 10, athleticism: 10, iq: 10, clutch: 10, stamina: 10, durability: 10, blocking: 10, stealing: 10, strength: 10, rebounding: 10 };
    const out = applyTrainingDelta(base, { outside: 16, inside: 99 });
    expect(out.outside).toBe(30); // 18 + 16 -> clamped at 30
    expect(out.inside).toBe(30); // clamped at 30
  });

  it('tierFor labels trained-past-20 overalls as S+ and the apex as S++', () => {
    expect(tierFor(26).label).toBe('S++');
    expect(tierFor(24).label).toBe('S+');
    expect(tierFor(22).label).toBe('S+');
    expect(tierFor(20).label).toBe('S');
    expect(tierFor(18).label).toBe('S');
  });
});

describe('item bag (run-scoped)', () => {
  const start = (): RunModel => started('seed-bag', 'bag');
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
  // Open the run and confirm the draft so the helper lands on the boost draft.
  const start = (): RunModel => started('seed-econ', 'econ');

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
        { id: 'lockdown' },
        { id: 'closer' },
        { id: 'deep-rotation' },
        { id: 'iron-legs' },
        { id: 'no-easy-buckets' },
      ],
      phase: { kind: 'boostDraft', round: 5, offers: [], pendingFull: false, drawLabel: 'boost-m0' },
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
        { id: 'lockdown' },
        { id: 'closer' },
        { id: 'deep-rotation' },
        { id: 'iron-legs' },
        { id: 'no-easy-buckets' },
      ],
      phase: { kind: 'boostDraft', round: 5, offers: [], pendingFull: false, drawLabel: 'boost-m0' },
    };
    m = runReducer(m, { type: 'draftBoost', offer: { kind: 'new', defId: 'splash-brothers' } })!;
    expect(m.phase.kind === 'boostDraft' && m.phase.pendingFull).toBe(true);
    const skipped = runReducer(m, { type: 'skipBoostDraft' })!;
    expect(skipped.boosts).toHaveLength(5);
    expect(skipped.boosts.some((b) => b.id === 'splash-brothers')).toBe(false); // declined
    expect(skipped.core.rewards.coins).toBe(0); // no reward
    expect(skipped.phase.kind).toBe('map');
  });

  it('a run-ending loss still banks coins', () => {
    const m = { ...start(), secondChancesRemaining: 0 };
    const lost = runReducer(
      { ...m, phase: { kind: 'postgame', nodeId: 'n', won: false } },
      { type: 'resolveGameResult' }
    )!;
    expect(lost.core.rewards.coins).toBeGreaterThanOrEqual(10);
    expect(lost.phase).toEqual({ kind: 'summary', champion: false });
  });

  it('banishes an offered boost, replaces it, and keeps the board full', () => {
    const m = start();
    if (m.phase.kind !== 'boostDraft') throw new Error('expected boostDraft');
    const count = m.phase.offers.length;
    const target = m.phase.offers[0];
    const after = runReducer(m, { type: 'banishBoost', offer: target })!;
    expect(after.banishedBoosts).toContain(target.defId);
    const board = after.phase.kind === 'boostDraft' ? after.phase.offers : [];
    expect(board).toHaveLength(count);
    expect(board.some((o) => o.defId === target.defId)).toBe(false);
    // A second banish on the new board still never re-surfaces the first one.
    const next = after.phase.kind === 'boostDraft' ? after.phase.offers[0] : target;
    const after2model = runReducer(after, { type: 'banishBoost', offer: next })!;
    const board2 = after2model.phase.kind === 'boostDraft' ? after2model.phase.offers : [];
    expect(board2.some((o) => o.defId === target.defId)).toBe(false);
  });

  it('caps banishes per run', () => {
    let m = start();
    for (let i = 0; i < MAX_BANISHES; i++) {
      if (m.phase.kind !== 'boostDraft' || m.phase.offers.length === 0) break;
      m = runReducer(m, { type: 'banishBoost', offer: m.phase.offers[0] })!;
    }
    expect(m.banishedBoosts.length).toBe(MAX_BANISHES);
    // One more banish is a no-op (cap reached).
    if (m.phase.kind === 'boostDraft' && m.phase.offers.length) {
      const after = runReducer(m, { type: 'banishBoost', offer: m.phase.offers[0] })!;
      expect(after.banishedBoosts.length).toBe(MAX_BANISHES);
    }
  });

  it('advances pity on a dry board and resets it on an epic+ pick', () => {
    const base = start();
    if (base.phase.kind !== 'boostDraft') throw new Error('expected boostDraft');
    // Force an all-common (dry) board, then skip: the streak ticks up.
    const dry: RunModel = { ...base, phase: { ...base.phase, offers: [{ kind: 'new', defId: 'splash-brothers' }] } };
    expect(runReducer(dry, { type: 'skipBoostDraft' })!.boostPity).toBe(1);
    // Drafting an epic ('lockdown') off a non-dry board resets the streak.
    const seeded: RunModel = {
      ...base,
      boostPity: 3,
      phase: { kind: 'boostDraft', round: 2, offers: [{ kind: 'new', defId: 'lockdown' }], pendingFull: false, drawLabel: 'boost-m1' },
    };
    expect(runReducer(seeded, { type: 'draftBoost', offer: { kind: 'new', defId: 'lockdown' } })!.boostPity).toBe(0);
  });
});

describe('between-game injuries', () => {
  const playWonGame = (seed: string): RunModel => {
    let m = atMap(seed, `inj-${seed}`);
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
    const m = started('rest');
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
    let m = atMap('dress');
    const bench = generateRecruitOffers('C', 'easy', 0, 1, createRNG('bp'));
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

  it('steppingInSubs names the healthy sub for an injured starter, else none', () => {
    const m = started('subs');
    expect(steppingInSubs(m.core.roster)).toEqual([]); // a healthy five subs nobody
    const bench = generateRecruitOffers('C', 'easy', 0, 1, createRNG('sub-bp'));
    const [first, ...rest] = m.core.roster.starters;
    const roster = { starters: [{ ...first, gamesOut: 1 }, ...rest], bench };
    const subs = steppingInSubs(roster);
    // Identity by reference, not name: real data can have two players share a
    // name, so the bench call-up steps in and the injured starter does not.
    expect(subs).toEqual([bench[0]]);
    expect(subs).not.toContain(roster.starters[0]);
  });
});

describe('coaches in a run', () => {
  it('equips the selected coach at run start and applies its plan', () => {
    const m = atMap('coach-plan');
    // The starter coach is a no-op: no forced star.
    expect(buildHomeTeam(m).tactic.starPlayerIndex).toBeNull();
    // A star-centric coach features the team's best player.
    const starVariant: RunModel = { ...m, coachId: 'phil-jackson' };
    expect(buildHomeTeam(starVariant).tactic.starPlayerIndex).not.toBeNull();
  });

  it('acceptCoachRec commits the suggested five and clears the banner', () => {
    const m = atMap('coach-accept');
    const bossId = m.core.map.bossNodeId;
    const pregame = runReducer(m, { type: 'chooseNode', nodeId: bossId })!;
    expect(pregame.phase.kind).toBe('pregame');
    const original = pregame.core.roster;
    const rec = {
      starters: [...original.starters].reverse(),
      bench: original.bench,
      edge: 'solid' as const,
      changes: 5,
      summary: 'test swap',
    };
    const withRec: RunModel = { ...pregame, phase: { kind: 'pregame', nodeId: bossId, coachRec: rec } };
    const accepted = runReducer(withRec, { type: 'acceptCoachRec' })!;
    expect(accepted.core.roster.starters[0]).toBe(original.starters[4]);
    expect(accepted.phase.kind).toBe('pregame');
    // Resolved to null (not undefined): the async scout never recomputes for this pregame.
    expect(accepted.phase.kind === 'pregame' && accepted.phase.coachRec).toBeNull();
  });

  it('acceptCoachRec is a no-op when there is no suggestion', () => {
    const m = atMap('coach-noop');
    const bossId = m.core.map.bossNodeId;
    const pregame = runReducer(m, { type: 'chooseNode', nodeId: bossId })!;
    const after = runReducer(pregame, { type: 'acceptCoachRec' })!;
    expect(after.core.roster).toEqual(pregame.core.roster);
  });

  it('the node tap defers the scout; computeCoachRec + setCoachRec land it once', () => {
    const m = atMap('coach-async');
    const bossId = m.core.map.bossNodeId;
    const pregame = runReducer(m, { type: 'chooseNode', nodeId: bossId })!;
    // The tap no longer computes anything: the scout starts unresolved.
    expect(pregame.phase.kind === 'pregame' && pregame.phase.coachRec).toBeUndefined();
    // The deferred compute derives the identical rec from the model alone (the same
    // seeded opponent and counters the inline path used) and lands it.
    const rec = computeCoachRec(pregame, bossId);
    const landed = runReducer(pregame, { type: 'setCoachRec', nodeId: bossId, rec })!;
    expect(landed.phase.kind === 'pregame' && landed.phase.coachRec).toBe(rec);
    // A second landing is a no-op: the first result (even null) resolves the pregame.
    const stale = {
      starters: pregame.core.roster.starters,
      bench: pregame.core.roster.bench,
      edge: 'minor' as const,
      changes: 1,
      summary: 'stale',
    };
    expect(runReducer(landed, { type: 'setCoachRec', nodeId: bossId, rec: stale })).toBe(landed);
  });

  it('setCoachRec refuses a result for another node or phase', () => {
    const m = atMap('coach-stale');
    const bossId = m.core.map.bossNodeId;
    const rec = {
      starters: m.core.roster.starters,
      bench: m.core.roster.bench,
      edge: 'minor' as const,
      changes: 1,
      summary: 'stale',
    };
    expect(runReducer(m, { type: 'setCoachRec', nodeId: bossId, rec })).toBe(m); // map phase
    const pregame = runReducer(m, { type: 'chooseNode', nodeId: bossId })!;
    expect(runReducer(pregame, { type: 'setCoachRec', nodeId: 'not-this-node', rec })).toBe(pregame);
  });

  it('a manual lineup edit resolves the scout so a late result cannot land', () => {
    const m = atMap('coach-edit');
    const bossId = m.core.map.bossNodeId;
    const pregame = runReducer(m, { type: 'chooseNode', nodeId: bossId })!;
    const lineup = runReducer(pregame, { type: 'openLineupBuilder' })!;
    const { starters, bench } = pregame.core.roster;
    const back = runReducer(lineup, { type: 'setLineup', starters, bench })!;
    expect(back.phase.kind === 'pregame' && back.phase.coachRec).toBeNull();
    const rec = {
      starters,
      bench,
      edge: 'minor' as const,
      changes: 1,
      summary: 'late',
    };
    expect(runReducer(back, { type: 'setCoachRec', nodeId: bossId, rec })).toBe(back);
  });

  it('coachReorderRoster slots a position-scrambled lineup back into PG..C order', () => {
    const m = atMap('coach-reslot');
    const bossId = m.core.map.bossNodeId;
    const pregame = runReducer(m, { type: 'chooseNode', nodeId: bossId })!;
    const five = pregame.core.roster.starters; // drafted in PG..C slot order
    // Scramble the slots (center first); the coach button should re-slot it.
    const scrambled = {
      starters: [five[4], five[0], five[1], five[2], five[3]],
      bench: pregame.core.roster.bench,
    };
    const out = coachReorderRoster(pregame, scrambled);
    expect(out).not.toBeNull();
    const ranks = out!.starters.map((p) => POSITIONS.indexOf(p.position));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b)); // natural slot order
    expect(out!.starters[0].position).not.toBe('C'); // never a center at the PG slot
  });

  it('keeps the snowball scaling on the coached home team (run counters threaded)', () => {
    // 'momentum' grows +1 team outside every 2 wins. The coach home-team path must
    // pass RunCounters into teamModifierFor, or the snowball is silently dropped.
    const withBoost: RunModel = { ...atMap('coach-scaling'), boosts: [{ id: 'momentum' }] };
    const early = buildHomeTeam({ ...withBoost, wins: 0 });
    const late = buildHomeTeam({ ...withBoost, wins: 4 }); // floor(4 / 2) = 2 stacks
    expect(late.teamStats.outside).toBeGreaterThan(early.teamStats.outside);
  });
});

describe('boss legend signings (hard/insane, S and S+ ladders)', () => {
  /** A home tuned for a signing run; ladder selection is not gated inside initRun. */
  const signHome = (
    difficulty: HomeRoster['selectedDifficulty'],
    ladderClass: HomeRoster['selectedLadderClass']
  ): HomeRoster => ({
    ...rookie('sign-home'),
    selectedDifficulty: difficulty,
    selectedLadderClass: ladderClass,
  });

  /** Drive a run to a NON-FINAL boss win on an injected boss node and resolve it. */
  const bossWin = (
    seed: string,
    difficulty: HomeRoster['selectedDifficulty'],
    ladderClass: HomeRoster['selectedLadderClass'],
    over: Partial<RunModel> = {}
  ): RunModel => {
    let m = initRun(seed, signHome(difficulty, ladderClass));
    if (m.phase.kind === 'draft') {
      m = runReducer(m, {
        type: 'confirmDraft',
        starters: m.phase.defaultStarters,
        bench: m.phase.defaultBench,
      })!;
    }
    const boss: MapNode = {
      id: 'bx',
      type: 'boss',
      layer: 5,
      next: [],
      round: 6,
      visited: true,
      cleared: false,
    };
    m = {
      ...m,
      ...over,
      core: {
        ...m.core,
        currentMapIndex: 5, // the 6th map: non-final, near the top of the chance ramp
        map: { ...m.core.map, nodes: { ...m.core.map.nodes, bx: boss } },
      },
      phase: { kind: 'postgame', nodeId: 'bx', won: true },
      game: null,
    };
    return runReducer(m, { type: 'resolveGameResult' })!;
  };

  /** The signing offer chained behind the boss item drop, if this seed rolled one. */
  const signPhaseOf = (m: RunModel) => {
    if (m.phase.kind === 'legendSign') return m.phase;
    if (m.phase.kind === 'itemDrop' && m.phase.returnTo.kind === 'legendSign') {
      return m.phase.returnTo;
    }
    return null;
  };

  const SEEDS = Array.from({ length: 80 }, (_, i) => `sign-${i}`);

  it('never fires on easy/medium, nor below the S ladder', () => {
    for (const seed of SEEDS.slice(0, 30)) {
      expect(signPhaseOf(bossWin(seed, 'easy', 'S'))).toBeNull();
      expect(signPhaseOf(bossWin(seed, 'medium', 'S+'))).toBeNull();
      expect(signPhaseOf(bossWin(seed, 'insane', 'A'))).toBeNull();
    }
  });

  it('fires on insane S with an on-loan natural legend and consumes the run legend offer', () => {
    const hit = SEEDS.map((s) => bossWin(s, 'insane', 'S')).find((m) => signPhaseOf(m));
    expect(hit).toBeDefined();
    const phase = signPhaseOf(hit!)!;
    expect(phase.offer.legendary).toBe(true);
    expect(phase.offer.onLoan).toBe(true);
    expect(phase.returnTo.kind).toBe('boostDraft'); // resolves into the next map's draft
    expect(hit!.legend.offeredThisRun).toBe(true); // shared with the recruit-node gate
  });

  it('is deterministic: the same seed produces the same offer', () => {
    const seed = SEEDS.find((s) => signPhaseOf(bossWin(s, 'insane', 'S')))!;
    const a = signPhaseOf(bossWin(seed, 'insane', 'S'))!;
    const b = signPhaseOf(bossWin(seed, 'insane', 'S'))!;
    expect(a.offer).toEqual(b.offer);
  });

  it('stays silent when the run already saw its legend offer', () => {
    const seed = SEEDS.find((s) => signPhaseOf(bossWin(s, 'insane', 'S')))!;
    const m = bossWin(seed, 'insane', 'S', {
      legend: { dryStreak: 0, offeredThisRun: true },
    });
    expect(signPhaseOf(m)).toBeNull();
  });

  it('accepting signs the legend to the bench and lands on the boost draft', () => {
    const seed = SEEDS.find((s) => signPhaseOf(bossWin(s, 'insane', 'S')))!;
    let m = bossWin(seed, 'insane', 'S');
    if (m.phase.kind === 'itemDrop') m = runReducer(m, { type: 'skipDrop' })!;
    expect(m.phase.kind).toBe('legendSign');
    const before = m.core.roster.bench.length;
    const accepted = runReducer(m, { type: 'acceptLegendSign' })!;
    expect(accepted.core.roster.bench.length).toBe(before + 1);
    expect(accepted.core.roster.bench.at(-1)!.onLoan).toBe(true);
    expect(accepted.phase.kind).toBe('boostDraft');
    const declined = runReducer(m, { type: 'declineLegendSign' })!;
    expect(declined.core.roster.bench.length).toBe(before);
    expect(declined.phase.kind).toBe('boostDraft');
  });

  it('never offers a legend already in the owned collection', () => {
    // Claim every legend as owned: the eligibility check must veto every roll.
    const allLegendKeys = NBA_LEGENDS.map((l) => {
      const rp = realPlayerToRosterPlayer(l);
      return `${rp.player.name}|${rp.position}`;
    });
    for (const seed of SEEDS) {
      const m = bossWin(seed, 'insane', 'S', { ownedLegendKeys: allLegendKeys });
      const phase = signPhaseOf(m);
      if (phase) {
        throw new Error(`offered ${phase.offer.player.name} despite full ownership`);
      }
    }
  });
});
