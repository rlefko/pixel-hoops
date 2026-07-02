import { describe, it, expect } from 'vitest';
import {
  createRookieRoster,
  crestMilestonesCrossed,
  currentHubSeen,
  deserializeHomeRoster,
  hubCopyTotal,
  hubDeltas,
  mergeRunGainsIntoHome,
  newCrestCells,
  playerKey,
  serializeHomeRoster,
  stampHubSeen,
  type HomeRoster,
} from '@/game/home-roster';
import { cellKey } from '@/game/difficulty-mode';
import { poolByClass, realPlayerToRosterPlayer } from '@/game/player-pool';
import { createRNG } from '@/game/rng';
import type { Roster, RosterPlayer } from '@/types/roster';
import type { RunRewards } from '@/types/run-map';

const rewards: RunRewards = { coins: 100, reputation: 5, trainingPoints: 0 };

function setup(): { home: HomeRoster; runRoster: Roster; recruit: RosterPlayer } {
  const home = createRookieRoster(createRNG('hub-seed'));
  const recruit = realPlayerToRosterPlayer(poolByClass('A')[0]);
  const runRoster: Roster = { starters: home.players.slice(0, 5), bench: [recruit] };
  return { home, runRoster, recruit };
}

/** A serialized payload with an editable data bag, for posing as older/corrupt saves. */
function mutablePayload(home: HomeRoster) {
  return serializeHomeRoster(home) as unknown as {
    version: number;
    data: Record<string, unknown>;
  };
}

/** A payload posing as a pre-v19 save (no hubSeen field). Version 18 is used so no
 * OTHER migration (the v18 A-favor goodwill) muddies what is measured. */
function preV19Payload(home: HomeRoster) {
  const payload = mutablePayload(home);
  payload.version = 18;
  delete payload.data.hubSeen;
  return payload;
}

describe('v19 hubSeen migration', () => {
  it('backfills a veteran save to current values: zero deltas, no ceremony replay', () => {
    const base = createRookieRoster(createRNG('vet'));
    const home: HomeRoster = {
      ...base,
      coins: 4321,
      clearedCells: [cellKey('easy', 'C'), cellKey('easy', 'B')],
      collecting: [{ player: realPlayerToRosterPlayer(poolByClass('A')[0]), copies: 2 }],
    };
    const restored = deserializeHomeRoster(preV19Payload(home))!;
    expect(restored.hubSeen).toEqual(currentHubSeen(restored));
    expect(hubDeltas(restored)).toEqual({ coins: 0, crests: 0, copies: 0 });
    expect(newCrestCells(restored)).toEqual([]);
  });

  it('round-trips a stamped ledger through serialize/deserialize', () => {
    const base = createRookieRoster(createRNG('rt'));
    const home: HomeRoster = {
      ...base,
      coins: 900,
      clearedCells: [cellKey('easy', 'C')],
      hubSeen: { coins: 500, crestCells: [], copyTotal: hubCopyTotal(base) },
    };
    const restored = deserializeHomeRoster(serializeHomeRoster(home))!;
    expect(restored.hubSeen).toEqual(home.hubSeen);
    expect(hubDeltas(restored).coins).toBe(400);
    expect(newCrestCells(restored)).toEqual([cellKey('easy', 'C')]);
  });

  it('degrades garbage fields to current values, field-wise', () => {
    const base = createRookieRoster(createRNG('garbage'));
    const home: HomeRoster = { ...base, coins: 250, clearedCells: [cellKey('easy', 'C')] };
    const payload = mutablePayload(home);
    payload.data.hubSeen = { coins: 'lots', crestCells: 42, copyTotal: Number.NaN };
    const restored = deserializeHomeRoster(payload)!;
    expect(hubDeltas(restored)).toEqual({ coins: 0, crests: 0, copies: 0 });
  });

  it('drops invalid crest keys but keeps valid ones', () => {
    const base = createRookieRoster(createRNG('keys'));
    const home: HomeRoster = {
      ...base,
      clearedCells: [cellKey('easy', 'C'), cellKey('easy', 'B')],
    };
    const payload = mutablePayload(home);
    payload.data.hubSeen = {
      coins: 0,
      crestCells: ['bogus:key', cellKey('easy', 'C')],
      copyTotal: hubCopyTotal(home),
    };
    const restored = deserializeHomeRoster(payload)!;
    expect(restored.hubSeen?.crestCells).toEqual([cellKey('easy', 'C')]);
    expect(newCrestCells(restored)).toEqual([cellKey('easy', 'B')]);
  });

  it('folds the pre-v10 ability refund into the backfilled coins (no fake delta)', () => {
    const home = createRookieRoster(createRNG('refund'));
    const payload = preV19Payload(home);
    // A dead ability id triggers the sanitizeAbilities coin refund on load.
    payload.data.abilityInventory = { 'long-dead-ability': 3 };
    const restored = deserializeHomeRoster(payload)!;
    expect(restored.coins).toBeGreaterThan(home.coins);
    expect(hubDeltas(restored).coins).toBe(0);
  });

  it('starts a rookie (and the Settings reset) fully acknowledged', () => {
    const rookie = createRookieRoster(createRNG('rookie'));
    expect(hubDeltas(rookie)).toEqual({ coins: 0, crests: 0, copies: 0 });
    expect(newCrestCells(rookie)).toEqual([]);
  });
});

describe('hubDeltas and hubCopyTotal', () => {
  it('reports a banked coin rise and clamps a fall to zero', () => {
    const home = createRookieRoster(createRNG('coins'));
    expect(hubDeltas({ ...home, coins: home.coins + 120 }).coins).toBe(120);
    const stamped = stampHubSeen(home, { coins: 999 });
    expect(hubDeltas(stamped).coins).toBe(0);
  });

  it('rises by exactly one per deposited copy, including the graduating copy', () => {
    const { home, runRoster, recruit } = setup();
    const threshold = 4; // A-class owns at four copies
    let cur = home;
    for (let clear = 1; clear <= threshold; clear++) {
      const before = hubCopyTotal(cur);
      cur = mergeRunGainsIntoHome(cur, runRoster, {
        rewards,
        champion: true,
        clearedClass: 'C',
        playedDifficulty: 'easy',
      });
      expect(hubCopyTotal(cur) - before).toBe(1);
    }
    // The fourth copy graduated the recruit into the owned collection.
    expect(cur.players.some((p) => playerKey(p) === playerKey(recruit))).toBe(true);
    expect(cur.collecting.some((c) => playerKey(c.player) === playerKey(recruit))).toBe(false);
  });

  it('does not move when a run fields only owned players', () => {
    const home = createRookieRoster(createRNG('idle'));
    const runRoster: Roster = { starters: home.players.slice(0, 5), bench: [] };
    const next = mergeRunGainsIntoHome(home, runRoster, {
      rewards,
      champion: true,
      clearedClass: 'C',
      playedDifficulty: 'easy',
    });
    expect(hubCopyTotal(next)).toBe(hubCopyTotal(home));
  });

  it('surfaces a champion clear as one new crest', () => {
    const { home, runRoster } = setup();
    const next = mergeRunGainsIntoHome(home, runRoster, {
      rewards,
      champion: true,
      clearedClass: 'C',
      playedDifficulty: 'easy',
    });
    expect(newCrestCells(next)).toEqual([cellKey('easy', 'C')]);
    expect(hubDeltas(next).crests).toBe(1);
  });
});

describe('stampHubSeen one-shot invariants', () => {
  it('clears only the stamped surface; other deltas survive', () => {
    const { home, runRoster } = setup();
    const settled = mergeRunGainsIntoHome({ ...home, coins: home.coins + 300 }, runRoster, {
      rewards,
      champion: true,
      clearedClass: 'C',
      playedDifficulty: 'easy',
    });
    const stamped = stampHubSeen(settled, { coins: settled.coins });
    expect(hubDeltas(stamped).coins).toBe(0);
    expect(hubDeltas(stamped).crests).toBe(1);
    expect(hubDeltas(stamped).copies).toBe(1);
  });

  it('acknowledging the crest cells empties newCrestCells across a save round-trip', () => {
    const { home, runRoster } = setup();
    const settled = mergeRunGainsIntoHome(home, runRoster, {
      rewards,
      champion: true,
      clearedClass: 'C',
      playedDifficulty: 'easy',
    });
    const stamped = stampHubSeen(settled, { crestCells: [...settled.clearedCells] });
    expect(newCrestCells(stamped)).toEqual([]);
    const restored = deserializeHomeRoster(serializeHomeRoster(stamped))!;
    expect(newCrestCells(restored)).toEqual([]);
  });

  it('returns the SAME reference when nothing changes (the no-save-loop guard)', () => {
    const home = createRookieRoster(createRNG('noop'));
    expect(stampHubSeen(home, { coins: home.coins })).toBe(home);
    expect(stampHubSeen(home, { crestCells: [...(home.hubSeen?.crestCells ?? [])] })).toBe(home);
    expect(stampHubSeen(home, {})).toBe(home);
    expect(stampHubSeen(home, { coins: home.coins + 5 })).not.toBe(home);
  });
});

describe('crestMilestonesCrossed', () => {
  it('reports the milestones a rise crosses, ascending', () => {
    expect(crestMilestonesCrossed(3, 5)).toEqual([5]);
    expect(crestMilestonesCrossed(4, 11)).toEqual([5, 10]);
    expect(crestMilestonesCrossed(19, 20)).toEqual([20]);
    expect(crestMilestonesCrossed(5, 5)).toEqual([]);
    expect(crestMilestonesCrossed(0, 20)).toEqual([5, 10, 15, 20]);
  });
});
