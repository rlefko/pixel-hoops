import { describe, it, expect } from 'vitest';
import {
  createRookieRoster,
  mergeRunGainsIntoHome,
  applyPlayerPull,
  playerKey,
  rememberDraftRotation,
  resolveDraftRotation,
  serializeHomeRoster,
  deserializeHomeRoster,
  grantCoach,
  selectCoach,
  ownsCoach,
  type HomeRoster,
} from '@/game/home-roster';
import { STARTER_COACH_ID, earnedCoachIds, coachesByClass } from '@/game/coaches';
import { poolByClass, realPlayerToRosterPlayer } from '@/game/player-pool';
import { tierPool } from '@/game/player-gacha';
import { createRNG } from '@/game/rng';
import type { Roster, RosterPlayer } from '@/types/roster';
import type { RunRewards } from '@/types/run-map';

const rewards: RunRewards = { coins: 100, reputation: 5, trainingPoints: 0 };

/** A home roster plus a run roster that fielded five owned players and one new recruit. */
function setup(): { home: HomeRoster; runRoster: Roster; recruit: RosterPlayer } {
  const home = createRookieRoster(createRNG('home-seed'));
  // An A-class real player is never in the starting twelve (5 D + 5 C + 2 B), so it is
  // guaranteed to be a brand-new recruit.
  const recruit = realPlayerToRosterPlayer(poolByClass('A')[0]);
  const runRoster: Roster = { starters: home.players.slice(0, 5), bench: [recruit] };
  return { home, runRoster, recruit };
}

describe('mergeRunGainsIntoHome: recruits are kept only on a clear', () => {
  it('keeps new recruits when the run is cleared (champion)', () => {
    const { home, runRoster, recruit } = setup();
    expect(home.players.some((p) => playerKey(p) === playerKey(recruit))).toBe(false);

    const next = mergeRunGainsIntoHome(home, runRoster, rewards, false, true, 'C', 'easy');
    expect(next.players.some((p) => playerKey(p) === playerKey(recruit))).toBe(true);
    expect(next.players.length).toBe(home.players.length + 1);
  });

  it('drops new recruits on a loss but never loses owned players', () => {
    const { home, runRoster, recruit } = setup();
    const next = mergeRunGainsIntoHome(home, runRoster, rewards, false, false, 'C', 'easy');

    expect(next.players.some((p) => playerKey(p) === playerKey(recruit))).toBe(false);
    expect(next.players.length).toBe(home.players.length);
    // Every previously owned player is still present.
    for (const p of home.players) {
      expect(next.players.some((q) => playerKey(q) === playerKey(p))).toBe(true);
    }
  });

  it('banks coins and reputation on both a clear and a loss', () => {
    const { home, runRoster } = setup();
    const won = mergeRunGainsIntoHome(home, runRoster, rewards, false, true, 'C', 'easy');
    const lost = mergeRunGainsIntoHome(home, runRoster, rewards, false, false, 'C', 'easy');
    expect(won.coins).toBe(home.coins + rewards.coins);
    expect(lost.coins).toBe(home.coins + rewards.coins);
    expect(won.reputation).toBe(home.reputation + rewards.reputation);
    expect(lost.reputation).toBe(home.reputation + rewards.reputation);
  });

  it('advances the ladder only on a clear', () => {
    const { home, runRoster } = setup();
    expect(home.ladderProgress.easy).toBeNull();
    const won = mergeRunGainsIntoHome(home, runRoster, rewards, false, true, 'C', 'easy');
    const lost = mergeRunGainsIntoHome(home, runRoster, rewards, false, false, 'C', 'easy');
    expect(won.ladderProgress.easy).toBe('C');
    expect(lost.ladderProgress.easy).toBeNull();
  });
});

describe('draft roster memory', () => {
  const five = (tag: string): string[] =>
    [`${tag}1|PG`, `${tag}2|SG`, `${tag}3|SF`, `${tag}4|PF`, `${tag}5|C`];

  it('rememberDraftRotation writes one cell, leaves siblings, and does not mutate', () => {
    const home = createRookieRoster(createRNG('mem'));
    const next = rememberDraftRotation(home, 'hard', 'B', five('b'));
    expect(next).not.toBe(home);
    expect(next.rosterMemory.hard.B).toEqual(five('b'));
    expect(next.rosterMemory.hard.C).toBeUndefined();
    expect(next.rosterMemory.easy).toEqual({});
    expect(home.rosterMemory.hard.B).toBeUndefined(); // original untouched
  });

  it('rememberDraftRotation is a no-op for an unfieldable (<5) rotation', () => {
    const home = createRookieRoster(createRNG('mem2'));
    expect(rememberDraftRotation(home, 'easy', 'C', ['a|PG'])).toBe(home);
  });

  it('resolveDraftRotation returns the exact cell when present', () => {
    const home = rememberDraftRotation(createRookieRoster(createRNG('m')), 'medium', 'A', five('a'));
    expect(resolveDraftRotation(home, 'medium', 'A')).toEqual(five('a'));
  });

  it('resolveDraftRotation walks down to the nearest lower ladder at the same difficulty', () => {
    let home = rememberDraftRotation(createRookieRoster(createRNG('m')), 'medium', 'C', five('c'));
    // Asking for S falls through B and A to the C rotation.
    expect(resolveDraftRotation(home, 'medium', 'S')).toEqual(five('c'));
    // A nearer lower cell wins over a farther one.
    home = rememberDraftRotation(home, 'medium', 'A', five('a'));
    expect(resolveDraftRotation(home, 'medium', 'S')).toEqual(five('a'));
  });

  it('resolveDraftRotation never crosses difficulties and is undefined with nothing lower', () => {
    const home = rememberDraftRotation(createRookieRoster(createRNG('m')), 'easy', 'S', five('s'));
    // hard has no memory; it must not borrow easy's rotation.
    expect(resolveDraftRotation(home, 'hard', 'S')).toBeUndefined();
    // On easy, asking for C (below the only saved cell, S) finds nothing lower.
    expect(resolveDraftRotation(home, 'easy', 'C')).toBeUndefined();
  });
});

describe('coaches', () => {
  it('starts a fresh save owning and equipping only the starter coach', () => {
    const home = createRookieRoster(createRNG('coach'));
    expect(home.ownedCoaches).toEqual([STARTER_COACH_ID]);
    expect(home.selectedCoachId).toBe(STARTER_COACH_ID);
  });

  it('wins coaches on a championship (and keeps the equipped coach)', () => {
    const home = createRookieRoster(createRNG('coach2'));
    const runRoster: Roster = { starters: home.players.slice(0, 5), bench: [] };
    // First clear of C on easy: grants C rank-1 AND opens B (the B opener) — two coaches.
    const next = mergeRunGainsIntoHome(home, runRoster, rewards, false, true, 'C', 'easy');
    expect(next.ownedCoaches.length).toBe(home.ownedCoaches.length + 2);
    expect(next.selectedCoachId).toBe(home.selectedCoachId); // a win never changes the equip
    // A loss wins nothing.
    const lost = mergeRunGainsIntoHome(home, runRoster, rewards, false, false, 'C', 'easy');
    expect(lost.ownedCoaches).toEqual(home.ownedCoaches);
  });

  it('grant and select mutators are owned-gated and idempotent', () => {
    let home = createRookieRoster(createRNG('coach3'));
    const target = coachesByClass('B').find((c) => c.unlock.kind === 'opener')!.id;
    expect(selectCoach(home, target)).toBe(home); // not owned → no-op
    home = grantCoach(home, target);
    expect(ownsCoach(home, target)).toBe(true);
    expect(grantCoach(home, target)).toBe(home); // idempotent
    expect(grantCoach(home, 'not-a-coach')).toBe(home); // unknown id → no-op
    expect(selectCoach(home, target).selectedCoachId).toBe(target);
  });

  it('derives owned coaches from ladder progress on load (retroactive for veterans)', () => {
    // A veteran who cleared B on easy + medium and A on hard, with no saved coach fields.
    const home = createRookieRoster(createRNG('coach4'));
    home.ladderProgress = { easy: 'B', medium: 'B', hard: 'A', insane: null };
    const serialized = serializeHomeRoster(home);
    // Simulate a pre-v11 save: strip the coach fields entirely.
    delete (serialized.data as Partial<HomeRoster>).ownedCoaches;
    delete (serialized.data as Partial<HomeRoster>).selectedCoachId;
    const restored = deserializeHomeRoster(serialized)!;
    expect(restored.ownedCoaches).toEqual(earnedCoachIds(home.ladderProgress));
    expect(restored.ownedCoaches).toContain(STARTER_COACH_ID);
    expect(restored.selectedCoachId).toBe(STARTER_COACH_ID); // defaulted when absent
  });

  it('keeps a valid saved selection and drops unknown owned ids on load', () => {
    const home = createRookieRoster(createRNG('coach5'));
    home.ladderProgress = { easy: 'C', medium: null, hard: null, insane: null };
    home.ownedCoaches = [...earnedCoachIds(home.ladderProgress), 'ghost-coach'];
    const bOpener = coachesByClass('B').find((c) => c.unlock.kind === 'opener')!.id;
    home.selectedCoachId = bOpener; // owned via the C clear (B opener)
    const restored = deserializeHomeRoster(serializeHomeRoster(home))!;
    expect(restored.ownedCoaches).not.toContain('ghost-coach');
    expect(restored.selectedCoachId).toBe(bOpener);
  });
});

describe('applyPlayerPull', () => {
  it('signs a new player and deducts the full price', () => {
    const home = { ...createRookieRoster(createRNG('a')), coins: 1000 };
    const { home: next, result } = applyPlayerPull(home, 'C', createRNG('pull-1'));
    expect(result.isDupe).toBe(false);
    expect(next.coins).toBe(1000 - 250);
    expect(next.players.length).toBe(home.players.length + 1);
    expect(playerKey(next.players[0])).toBe(playerKey(result.player)); // recency-first
  });

  it('is a no-op when unaffordable', () => {
    const home = { ...createRookieRoster(createRNG('b')), coins: 100 };
    const { home: next } = applyPlayerPull(home, 'C', createRNG('pull-2'));
    expect(next.coins).toBe(100);
    expect(next.players.length).toBe(home.players.length);
  });

  it('refunds half and adds no player on a fully-collected tier', () => {
    const ownedS = tierPool('S').map(realPlayerToRosterPlayer);
    const home = { ...createRookieRoster(createRNG('c')), players: ownedS, coins: 10000 };
    const { home: next, result } = applyPlayerPull(home, 'S', createRNG('pull-3'));
    expect(result.isDupe).toBe(true);
    expect(next.coins).toBe(10000 - 2500 + 1250);
    expect(next.players.length).toBe(home.players.length);
  });
});
