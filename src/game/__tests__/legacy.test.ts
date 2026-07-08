import { describe, it, expect } from 'vitest';
import {
  ICON_PERKS,
  LEGACY_AT_CLASS_GRACE,
  LEGACY_LEVELS,
  LEGACY_MVP_FEE,
  addLegacyGame,
  emptyLegacyLine,
  isIconPerkId,
  legacyAppearanceFees,
  legacyEligible,
  legacyLevel,
  mergeLegacyIntoHome,
  nextLegacyLevel,
  sanitizeLegacy,
  type LegacyLedger,
} from '@/game/legacy';
import {
  createRookieRoster,
  deserializeHomeRoster,
  mergeRunGainsIntoHome,
  playerKey,
  serializeHomeRoster,
  setIconPerk,
} from '@/game/home-roster';
import { classLevel } from '@/game/classes';
import { createRNG } from '@/game/rng';
import type { Roster } from '@/types/roster';
import type { RunRewards } from '@/types/run-map';

const rewards: RunRewards = { coins: 100, reputation: 5, trainingPoints: 0 };

describe('legacy levels', () => {
  it('thresholds escalate monotonically across every counter', () => {
    for (let i = 1; i < LEGACY_LEVELS.length; i++) {
      expect(LEGACY_LEVELS[i].w).toBeGreaterThan(LEGACY_LEVELS[i - 1].w);
      expect(LEGACY_LEVELS[i].mvp).toBeGreaterThanOrEqual(LEGACY_LEVELS[i - 1].mvp);
      expect(LEGACY_LEVELS[i].titles).toBeGreaterThanOrEqual(LEGACY_LEVELS[i - 1].titles);
    }
  });

  it('legacyLevel reads the highest tier every counter clears', () => {
    expect(legacyLevel(undefined)).toBe(0);
    expect(legacyLevel(emptyLegacyLine())).toBe(0);
    expect(legacyLevel({ w: 5, mvp: 0, titles: 0 })).toBe(1);
    expect(legacyLevel({ w: 15, mvp: 3, titles: 0 })).toBe(2);
    // Wins alone never skip a tier: the mvp shortfall holds STARTER back.
    expect(legacyLevel({ w: 40, mvp: 2, titles: 0 })).toBe(1);
    expect(legacyLevel({ w: 35, mvp: 10, titles: 1 })).toBe(3);
    expect(legacyLevel({ w: 60, mvp: 20, titles: 3 })).toBe(4);
  });

  it('nextLegacyLevel names the climb and caps at ICON', () => {
    expect(nextLegacyLevel(undefined)?.name).toBe('ROTATION');
    expect(nextLegacyLevel({ w: 15, mvp: 3, titles: 0 })?.name).toBe('FRANCHISE');
    expect(nextLegacyLevel({ w: 60, mvp: 20, titles: 3 })).toBeNull();
  });
});

describe('the at-class grace (legends do not pad careers against rookies)', () => {
  it('is exactly one class rung', () => {
    // The grace must stay under the ~3-point class-level step, or a legend could
    // farm careers two rungs down.
    expect(classLevel('S') - classLevel('A')).toBeLessThanOrEqual(LEGACY_AT_CLASS_GRACE);
    expect(classLevel('S+') - classLevel('B')).toBeGreaterThan(LEGACY_AT_CLASS_GRACE);
  });

  it('credits at-class and one rung down, never further', () => {
    expect(legacyEligible('C', 'C')).toBe(true);
    expect(legacyEligible('A', 'B')).toBe(true);
    expect(legacyEligible('A', 'C')).toBe(false);
    expect(legacyEligible('S', 'A')).toBe(true);
    expect(legacyEligible('S', 'B')).toBe(false);
    expect(legacyEligible('S+', 'S')).toBe(true);
    expect(legacyEligible('S+', 'A')).toBe(false);
    expect(legacyEligible('S+', 'C')).toBe(false);
  });

  it('a low-class player always earns on a higher ladder', () => {
    expect(legacyEligible('D', 'S+')).toBe(true);
    expect(legacyEligible('C', 'S')).toBe(true);
  });
});

describe('addLegacyGame', () => {
  it('is a same-reference no-op with nothing to add', () => {
    const ledger: LegacyLedger = { 'A|PG': { w: 1, mvp: 0, titles: 0 } };
    expect(addLegacyGame(ledger, [])).toBe(ledger);
  });

  it('folds a win, an MVP crown, and a title immutably', () => {
    const before: LegacyLedger = {};
    const after = addLegacyGame(before, [
      { key: 'A|PG', mvp: true, title: false },
      { key: 'B|SG', mvp: false, title: false },
    ]);
    expect(before).toEqual({});
    expect(after['A|PG']).toEqual({ w: 1, mvp: 1, titles: 0 });
    expect(after['B|SG']).toEqual({ w: 1, mvp: 0, titles: 0 });
    const crowned = addLegacyGame(after, [{ key: 'A|PG', mvp: false, title: true }]);
    expect(crowned['A|PG']).toEqual({ w: 2, mvp: 1, titles: 1 });
  });
});

describe('mergeLegacyIntoHome (owned-only crediting)', () => {
  it('credits owned keys, drops rentals, and no-ops by reference when empty', () => {
    const home: LegacyLedger = { 'Own|PG': { w: 4, mvp: 1, titles: 0 } };
    const owned = new Set(['Own|PG']);
    expect(mergeLegacyIntoHome(home, undefined, owned)).toBe(home);
    expect(mergeLegacyIntoHome(home, { 'Rental|C': { w: 9, mvp: 9, titles: 1 } }, owned)).toBe(
      home
    );
    const next = mergeLegacyIntoHome(
      home,
      { 'Own|PG': { w: 3, mvp: 1, titles: 1 }, 'Rental|C': { w: 9, mvp: 9, titles: 1 } },
      owned
    );
    expect(next['Own|PG']).toEqual({ w: 7, mvp: 2, titles: 1 });
    expect(next['Rental|C']).toBeUndefined();
  });
});

describe('sanitizeLegacy', () => {
  it('degrades garbage to an empty ledger', () => {
    expect(sanitizeLegacy(undefined)).toEqual({});
    expect(sanitizeLegacy(null)).toEqual({});
    expect(sanitizeLegacy('nope')).toEqual({});
  });

  it('sanitizes values but keeps membership (careers never orphan)', () => {
    const out = sanitizeLegacy({
      'Kept|PG': { w: 3.9, mvp: -2, titles: Infinity },
      'Zeroed|SG': { w: 0, mvp: 0, titles: 0 },
      'Bad|SF': 'garbage',
      'Departed|C': { w: 12, mvp: 4, titles: 1 },
    });
    expect(out['Kept|PG']).toEqual({ w: 3, mvp: 0, titles: 0 });
    expect(out['Zeroed|SG']).toBeUndefined();
    expect(out['Bad|SF']).toBeUndefined();
    // A key with no matching owned player is kept: values sanitize, membership stays.
    expect(out['Departed|C']).toEqual({ w: 12, mvp: 4, titles: 1 });
  });
});

describe('legacy at the settle (merge + persistence)', () => {
  it('mergeRunGainsIntoHome banks careers for pre-merge-owned players, win or lose', () => {
    const home = createRookieRoster(createRNG('legacy-merge'));
    const ownKey = playerKey(home.players[0]);
    const runRoster: Roster = { starters: home.players.slice(0, 5), bench: [] };
    const runLegacy: LegacyLedger = {
      [ownKey]: { w: 6, mvp: 2, titles: 0 },
      'Nobody|PG': { w: 6, mvp: 2, titles: 0 },
    };
    // A LOSS still banks the wins its games earned (the no-wasted-runs rule).
    const lost = mergeRunGainsIntoHome(home, runRoster, {
      rewards,
      playedDifficulty: 'easy',
      ladderClass: 'C',
      runLegacy,
    });
    expect(lost.legacy[ownKey]).toEqual({ w: 6, mvp: 2, titles: 0 });
    expect(lost.legacy['Nobody|PG']).toBeUndefined();
    // A second settle accumulates rather than replaces.
    const again = mergeRunGainsIntoHome(lost, runRoster, {
      rewards,
      champion: true,
      clearedClass: 'C',
      playedDifficulty: 'easy',
      ladderClass: 'C',
      runLegacy: { [ownKey]: { w: 8, mvp: 1, titles: 1 } },
    });
    expect(again.legacy[ownKey]).toEqual({ w: 14, mvp: 3, titles: 1 });
  });

  it('post-ICON MVP crowns pay appearance fees; pre-ICON crowns feed the climb', () => {
    const home = createRookieRoster(createRNG('legacy-fee'));
    const key = playerKey(home.players[0]);
    const runRoster: Roster = { starters: home.players.slice(0, 5), bench: [] };
    const runLegacy: LegacyLedger = { [key]: { w: 3, mvp: 2, titles: 0 } };
    const icon = { ...home, legacy: { [key]: { w: 60, mvp: 20, titles: 3 } } };
    const settled = mergeRunGainsIntoHome(icon, runRoster, {
      rewards: { ...rewards, reputation: 0 },
      playedDifficulty: 'easy',
      ladderClass: 'C',
      runLegacy,
    });
    expect(settled.coins - icon.coins).toBe(2 * LEGACY_MVP_FEE);
    const climbing = { ...home, legacy: { [key]: { w: 10, mvp: 2, titles: 0 } } };
    const settled2 = mergeRunGainsIntoHome(climbing, runRoster, {
      rewards: { ...rewards, reputation: 0 },
      playedDifficulty: 'easy',
      ladderClass: 'C',
      runLegacy,
    });
    expect(settled2.coins).toBe(climbing.coins);
    // The pure helper agrees with the merge.
    expect(legacyAppearanceFees(icon.legacy, runLegacy, new Set([key]))).toBe(2 * LEGACY_MVP_FEE);
    expect(legacyAppearanceFees(icon.legacy, runLegacy, new Set())).toBe(0);
  });

  it('setIconPerk holds until ICON, then picks and swaps freely', () => {
    expect(ICON_PERKS.map((p) => p.id).every(isIconPerkId)).toBe(true);
    expect(isIconPerkId('rocket-boots')).toBe(false);
    const home = createRookieRoster(createRNG('legacy-perk'));
    const key = playerKey(home.players[0]);
    expect(setIconPerk(home, key, 'mentor')).toBe(home); // career not at ICON yet
    const icon = { ...home, legacy: { [key]: { w: 60, mvp: 20, titles: 3 } } };
    const picked = setIconPerk(icon, key, 'mentor');
    expect(picked.iconPerks?.[key]).toBe('mentor');
    const swapped = setIconPerk(picked, key, 'film-room');
    expect(swapped.iconPerks?.[key]).toBe('film-room');
    expect(setIconPerk(swapped, key, 'film-room')).toBe(swapped); // same pick no-ops
  });

  it('round-trips through serialize/deserialize and backfills empty on old saves', () => {
    const home = createRookieRoster(createRNG('legacy-serde'));
    const key = playerKey(home.players[0]);
    const withCareer = { ...home, legacy: { [key]: { w: 20, mvp: 5, titles: 1 } } };
    const restored = deserializeHomeRoster(serializeHomeRoster(withCareer))!;
    expect(restored.legacy[key]).toEqual({ w: 20, mvp: 5, titles: 1 });

    // A pre-v21 save has no ledger: it backfills empty, never fabricated.
    const serialized = serializeHomeRoster(home) as { version: number; data: unknown };
    const old = { version: 20, data: { ...(serialized.data as object), legacy: undefined } };
    expect(deserializeHomeRoster(old)!.legacy).toEqual({});
  });
});
