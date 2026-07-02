import { describe, it, expect } from 'vitest';
import {
  PLAYER_MACHINES,
  PLAYER_GACHA_TIERS,
  tierPool,
  tierCounts,
  pullPlayer,
  machineUnlocked,
  machineGate,
  scoutTargetFor,
} from '@/game/player-gacha';
import { copiesToOwn, overflowBounty } from '@/game/collection';
import { createRNG } from '@/game/rng';
import type { Difficulty, LadderClass } from '@/game/difficulty-mode';

/** Owned-collection key of a real player (matches player-gacha's realKey / home playerKey). */
const keyRP = (rp: { name: string; position: string }): string => `${rp.name}|${rp.position}`;

/** A per-difficulty ladder-progress map cleared through `cleared` on easy only. */
const ladder = (cleared: LadderClass | null): Record<Difficulty, LadderClass | null> => ({
  easy: cleared,
  medium: null,
  hard: null,
  insane: null,
});

describe('player scouting machines', () => {
  it('prices match the spec (250 / 500 / 1,000 / 2,500 / 10,000)', () => {
    expect(PLAYER_MACHINES.C.cost).toBe(250);
    expect(PLAYER_MACHINES.B.cost).toBe(500);
    expect(PLAYER_MACHINES.A.cost).toBe(1000);
    expect(PLAYER_MACHINES.S.cost).toBe(2500);
    expect(PLAYER_MACHINES.legendary.cost).toBe(10000);
  });

  it('every tier draws from a non-empty pool', () => {
    for (const tier of PLAYER_GACHA_TIERS) expect(tierPool(tier).length).toBeGreaterThan(0);
  });

  it('class machines dispense their class; the legendary machine only legends', () => {
    for (const tier of ['C', 'B', 'A', 'S'] as const) {
      const r = pullPlayer(tier, new Set(), {}, createRNG(`${tier}-x`));
      expect(r.isOverflow).toBe(false);
      expect(r.player.legendary).toBe(false);
      expect(r.player.originalClass).toBe(tier);
      expect(r.cls).toBe(tier);
      expect(r.threshold).toBe(copiesToOwn(tier));
    }
    const l = pullPlayer('legendary', new Set(), {}, createRNG('L'));
    expect(l.player.legendary).toBe(true);
    expect(l.player.originalClass).toBe('S+');
  });
});

describe('copies mode', () => {
  it('concentrates copies on one player until it unlocks (A owns at three)', () => {
    const threshold = copiesToOwn('A');
    const collecting: Record<string, number> = {};
    const unlocked = new Set<string>();
    let target = '';
    for (let i = 0; i < threshold; i++) {
      const r = pullPlayer('A', unlocked, collecting, createRNG(`a-${i}`));
      if (i === 0) target = r.targetKey;
      expect(r.targetKey).toBe(target); // always the closest-to-unlock player
      expect(r.isOverflow).toBe(false);
      expect(r.newCopies).toBe(i + 1);
      expect(r.unlockedNow).toBe(i + 1 >= threshold);
      collecting[r.targetKey] = r.newCopies; // the caller records the copy
    }
  });

  it('overflows into a coin bounty once every player in a tier is owned', () => {
    for (const tier of PLAYER_GACHA_TIERS) {
      const allOwned = new Set(tierPool(tier).map(keyRP));
      const r = pullPlayer(tier, allOwned, {}, createRNG(`ov-${tier}`));
      expect(r.isOverflow).toBe(true);
      expect(r.unlockedNow).toBe(false);
      expect(r.overflowCoins).toBe(overflowBounty(r.cls));
    }
  });

  it('is deterministic from its seed', () => {
    const a = pullPlayer('A', new Set(), {}, createRNG('same'));
    const b = pullPlayer('A', new Set(), {}, createRNG('same'));
    expect(a).toEqual(b);
  });
});

describe('tierCounts', () => {
  it('reports owned/total, completion, and closest progress', () => {
    const empty = tierCounts('A', new Set());
    expect(empty.owned).toBe(0);
    expect(empty.total).toBe(tierPool('A').length);
    expect(empty.complete).toBe(false);
    expect(empty.closest).toEqual({ copies: 0, threshold: copiesToOwn('A') });

    const oneKey = keyRP(tierPool('A')[0]);
    const withProgress = tierCounts('A', new Set(), { [oneKey]: 2 });
    expect(withProgress.closest).toEqual({ copies: 2, threshold: copiesToOwn('A') });

    const full = tierCounts('A', new Set(tierPool('A').map(keyRP)));
    expect(full.owned).toBe(full.total);
    expect(full.complete).toBe(true);
    expect(full.closest).toBeUndefined();
  });
});

describe('machine access gate', () => {
  it('opens C always and gates B/A/S/legendary behind the ladder below', () => {
    expect(machineGate('C')).toBeNull();
    expect(machineGate('B')).toBe('C');
    expect(machineGate('S')).toBe('A');
    expect(machineGate('legendary')).toBe('S');

    const none = ladder(null);
    expect(machineUnlocked('C', none)).toBe(true);
    expect(machineUnlocked('B', none)).toBe(false);
    expect(machineUnlocked('S', none)).toBe(false);

    // Clearing the A ladder (on any difficulty) opens B/A/S but not the legendary machine.
    const throughA = ladder('A');
    expect(machineUnlocked('B', throughA)).toBe(true);
    expect(machineUnlocked('A', throughA)).toBe(true);
    expect(machineUnlocked('S', throughA)).toBe(true);
    expect(machineUnlocked('legendary', throughA)).toBe(false);

    expect(machineUnlocked('legendary', ladder('S'))).toBe(true);
  });
});

describe('favor-directed pulls (pin > effective progress > seeded tie-break)', () => {
  it('an empty direction reproduces the classic pull exactly', () => {
    const pool = tierPool('A');
    const copies = { [keyRP(pool[2])]: 2 };
    const bare = pullPlayer('A', new Set(), copies, createRNG('dir'));
    const directed = pullPlayer('A', new Set(), copies, createRNG('dir'), {});
    expect(directed).toEqual(bare);
  });

  it('banked favor outranks fewer copies via effective progress', () => {
    const pool = tierPool('A');
    const behind = pool[0]; // 1 whole copy
    const favored = pool[1]; // 0 copies but 60 favor = 1.5 effective copies
    const result = pullPlayer(
      'A',
      new Set(),
      { [keyRP(behind)]: 1 },
      createRNG('fav'),
      { favor: { [keyRP(favored)]: 60 } }
    );
    expect(result.targetKey).toBe(keyRP(favored));
  });

  it('a pinned target takes the copy over everyone', () => {
    const pool = tierPool('S');
    const leader = pool[0];
    const pinned = pool[4];
    const result = pullPlayer(
      'S',
      new Set(),
      { [keyRP(leader)]: 4 },
      createRNG('pin'),
      { favor: { [keyRP(leader)]: 50 }, pinnedKey: keyRP(pinned) }
    );
    expect(result.targetKey).toBe(keyRP(pinned));
  });

  it('an owned or bogus pin falls back to the effective-progress leader', () => {
    const pool = tierPool('A');
    const leader = pool[3];
    const result = pullPlayer(
      'A',
      new Set([keyRP(pool[0])]),
      { [keyRP(leader)]: 2 },
      createRNG('stale'),
      { pinnedKey: keyRP(pool[0]) } // owned: not in the un-owned pool
    );
    expect(result.targetKey).toBe(keyRP(leader));
  });

  it('legendary-tier favor orders the queue by raw points', () => {
    const pool = tierPool('legendary');
    const favored = pool[5];
    const result = pullPlayer('legendary', new Set(), {}, createRNG('leg'), {
      favor: { [keyRP(favored)]: 8 },
    });
    expect(result.targetKey).toBe(keyRP(favored));
  });

  it('is deterministic from (inputs, seed) with a favor ledger', () => {
    const pool = tierPool('B');
    const favor = { [keyRP(pool[9])]: 15 };
    const a = pullPlayer('B', new Set(), {}, createRNG('det'), { favor });
    const b = pullPlayer('B', new Set(), {}, createRNG('det'), { favor });
    expect(a).toEqual(b);
  });
});

describe('scoutTargetFor (the RNG-free card chip)', () => {
  it('returns null on a fresh tier (the pull would tie-break on RNG)', () => {
    expect(scoutTargetFor('A', new Set(), {})).toBeNull();
  });

  it('names the unique effective-progress leader', () => {
    const pool = tierPool('A');
    const leader = pool[6];
    const target = scoutTargetFor('A', new Set(), { [keyRP(leader)]: 2 }, { [keyRP(leader)]: 10 });
    expect(target).toMatchObject({
      key: keyRP(leader),
      copies: 2,
      threshold: copiesToOwn('A'),
      favor: 10,
      pinned: false,
    });
  });

  it('a pin is always the target and mirrors the pull', () => {
    const pool = tierPool('S');
    const pinnedKey = keyRP(pool[2]);
    const target = scoutTargetFor('S', new Set(), { [keyRP(pool[0])]: 3 }, {}, pinnedKey);
    expect(target?.pinned).toBe(true);
    expect(target?.key).toBe(pinnedKey);
    const pull = pullPlayer('S', new Set(), { [keyRP(pool[0])]: 3 }, createRNG('x'), {
      pinnedKey,
    });
    expect(pull.targetKey).toBe(pinnedKey);
  });

  it('returns null when the whole tier is owned', () => {
    const owned = new Set(tierPool('C').map(keyRP));
    expect(scoutTargetFor('C', owned, {})).toBeNull();
  });
});
