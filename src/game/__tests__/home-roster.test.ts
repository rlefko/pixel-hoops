import { describe, it, expect } from 'vitest';
import {
  createRookieRoster,
  mergeRunGainsIntoHome,
  previewRunAcquisitions,
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
import { NBA_LEGENDS } from '@/data/nba';
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
  it('deposits a copy toward a new recruit on a clear (A owns at three copies)', () => {
    const { home, runRoster, recruit } = setup();
    expect(home.players.some((p) => playerKey(p) === playerKey(recruit))).toBe(false);

    const next = mergeRunGainsIntoHome(home, runRoster, rewards, false, true, 'C', 'easy');
    // An A-class recruit needs three copies, so one clear leaves it collecting (1/3), not
    // yet owned or draftable.
    expect(next.players.some((p) => playerKey(p) === playerKey(recruit))).toBe(false);
    expect(next.players.length).toBe(home.players.length);
    const entry = next.collecting.find((c) => playerKey(c.player) === playerKey(recruit));
    expect(entry?.copies).toBe(1);
  });

  it('unlocks a C recruit immediately on a clear (C owns at one copy)', () => {
    const home = createRookieRoster(createRNG('crec'));
    const ownedKeys = new Set(home.players.map(playerKey));
    const recruit = poolByClass('C')
      .map(realPlayerToRosterPlayer)
      .find((rp) => !ownedKeys.has(playerKey(rp)))!;
    const runRoster: Roster = { starters: home.players.slice(0, 5), bench: [recruit] };
    const next = mergeRunGainsIntoHome(home, runRoster, rewards, false, true, 'C', 'easy');
    expect(next.players.some((p) => playerKey(p) === playerKey(recruit))).toBe(true);
    expect(next.players.length).toBe(home.players.length + 1);
    expect(next.collecting.some((c) => playerKey(c.player) === playerKey(recruit))).toBe(false);
  });

  it('unlocks a recruit once enough clears deposit its copies (A at three)', () => {
    const { home, recruit } = setup();
    let cur = home;
    for (let i = 0; i < 3; i++) {
      const runRoster: Roster = { starters: cur.players.slice(0, 5), bench: [recruit] };
      cur = mergeRunGainsIntoHome(cur, runRoster, rewards, false, true, 'C', 'easy');
    }
    expect(cur.players.some((p) => playerKey(p) === playerKey(recruit))).toBe(true);
    expect(cur.collecting.some((c) => playerKey(c.player) === playerKey(recruit))).toBe(false);
  });

  it('drops new recruits on a loss but never loses owned players or copies', () => {
    const { home, runRoster, recruit } = setup();
    const next = mergeRunGainsIntoHome(home, runRoster, rewards, false, false, 'C', 'easy');

    expect(next.players.some((p) => playerKey(p) === playerKey(recruit))).toBe(false);
    expect(next.collecting.some((c) => playerKey(c.player) === playerKey(recruit))).toBe(false);
    expect(next.players.length).toBe(home.players.length);
    // Every previously owned player is still present.
    for (const p of home.players) {
      expect(next.players.some((q) => playerKey(q) === playerKey(p))).toBe(true);
    }
  });

  it('owns a scouted legend you win a run with, and forfeits it on a loss', () => {
    const home = createRookieRoster(createRNG('leg'));
    // A mid-run legend is on-loan; winning with it must KEEP it (legends own at one copy).
    const legend: RosterPlayer = { ...realPlayerToRosterPlayer(NBA_LEGENDS[0]), onLoan: true };
    expect(legend.legendary).toBe(true);
    const runRoster: Roster = { starters: home.players.slice(0, 5), bench: [legend] };

    const won = mergeRunGainsIntoHome(home, runRoster, rewards, true, true, 'S', 'easy');
    const kept = won.players.find((p) => playerKey(p) === playerKey(legend));
    expect(kept).toBeDefined();
    expect(kept!.legendary).toBe(true);
    expect(kept!.onLoan).toBeUndefined(); // banked as a normal owned player (no on-loan buff)

    const lost = mergeRunGainsIntoHome(home, runRoster, rewards, true, false, 'S', 'easy');
    expect(lost.players.some((p) => playerKey(p) === playerKey(legend))).toBe(false);
    expect(lost.collecting.some((c) => playerKey(c.player) === playerKey(legend))).toBe(false);
  });

  it('banks reputation (not coins) on both a clear and a loss', () => {
    const { home, runRoster } = setup();
    const won = mergeRunGainsIntoHome(home, runRoster, rewards, false, true, 'C', 'easy');
    const lost = mergeRunGainsIntoHome(home, runRoster, rewards, false, false, 'C', 'easy');
    // Coins bank as they are earned (the useRun ledger), so the merge never touches the
    // wallet; only reputation banks at run end here.
    expect(won.coins).toBe(home.coins);
    expect(lost.coins).toBe(home.coins);
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
    // First clear of C on easy: grants C rank-1 AND opens B (the B opener): two coaches.
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

const clearedThroughA = (): HomeRoster['ladderProgress'] => ({
  easy: 'A',
  medium: null,
  hard: null,
  insane: null,
});

describe('previewRunAcquisitions', () => {
  const freshRecruits = (home: HomeRoster) => {
    const ownedKeys = new Set(home.players.map(playerKey));
    const cRecruit = poolByClass('C')
      .map(realPlayerToRosterPlayer)
      .find((rp) => !ownedKeys.has(playerKey(rp)))!;
    const aRecruit = realPlayerToRosterPlayer(poolByClass('A')[0]);
    return { cRecruit, aRecruit };
  };

  it('reports unlocked vs progressed on a clear, and nothing on a loss', () => {
    const home = createRookieRoster(createRNG('acq'));
    const { cRecruit, aRecruit } = freshRecruits(home);
    const runRoster: Roster = { starters: home.players.slice(0, 5), bench: [cRecruit, aRecruit] };

    const won = previewRunAcquisitions(home, runRoster, true);
    // C owns at one copy -> unlocked; A owns at three -> progressed 0->1.
    expect(won.unlocked.some((p) => playerKey(p) === playerKey(cRecruit))).toBe(true);
    expect(won.unlocked.some((p) => playerKey(p) === playerKey(aRecruit))).toBe(false);
    expect(won.progressed.find((p) => playerKey(p.player) === playerKey(aRecruit))).toEqual(
      expect.objectContaining({ before: 0, after: 1, threshold: 3 })
    );

    const lost = previewRunAcquisitions(home, runRoster, false);
    expect(lost.unlocked).toEqual([]);
    expect(lost.progressed).toEqual([]);
  });

  it('matches what the merge actually banks', () => {
    const home = createRookieRoster(createRNG('acq2'));
    const { cRecruit, aRecruit } = freshRecruits(home);
    const runRoster: Roster = { starters: home.players.slice(0, 5), bench: [cRecruit, aRecruit] };
    const preview = previewRunAcquisitions(home, runRoster, true);
    const merged = mergeRunGainsIntoHome(home, runRoster, rewards, false, true, 'C', 'easy');
    for (const p of preview.unlocked) {
      expect(merged.players.some((q) => playerKey(q) === playerKey(p))).toBe(true);
    }
    for (const pr of preview.progressed) {
      expect(merged.collecting.find((c) => playerKey(c.player) === playerKey(pr.player))?.copies).toBe(
        pr.after
      );
    }
  });
});

describe('applyPlayerPull', () => {
  it('unlocks a C player on the first copy (C owns at one) and deducts the price', () => {
    const home = { ...createRookieRoster(createRNG('a')), coins: 1000 };
    const { home: next, result } = applyPlayerPull(home, 'C', createRNG('pull-1'));
    expect(result.isOverflow).toBe(false);
    expect(result.unlockedNow).toBe(true); // C threshold is 1
    expect(next.coins).toBe(1000 - 250);
    expect(next.players.length).toBe(home.players.length + 1);
    expect(playerKey(next.players[0])).toBe(playerKey(result.player)); // recency-first
    expect(next.collecting.length).toBe(0);
  });

  it('is a no-op when unaffordable', () => {
    const home = { ...createRookieRoster(createRNG('b')), coins: 100 };
    const { home: next } = applyPlayerPull(home, 'C', createRNG('pull-2'));
    expect(next.coins).toBe(100);
    expect(next.players.length).toBe(home.players.length);
  });

  it('is a no-op when the machine is locked behind ladder progress', () => {
    const home = { ...createRookieRoster(createRNG('lk')), coins: 10000 }; // no ladder cleared
    const { home: next } = applyPlayerPull(home, 'S', createRNG('pull-lk'));
    expect(next.coins).toBe(10000); // the S machine is locked until the A ladder is cleared
    expect(next.players.length).toBe(home.players.length);
    expect(next.collecting.length).toBe(0);
  });

  it('accumulates copies and only unlocks a higher-tier player on the threshold copy', () => {
    let home: HomeRoster = {
      ...createRookieRoster(createRNG('acc')),
      coins: 100000,
      ladderProgress: clearedThroughA(),
    };
    const before = home.players.length;
    const S_COPIES = 6; // S owns at six copies
    let unlocks = 0;
    let targetKey = '';
    for (let i = 0; i < S_COPIES; i++) {
      const { home: next, result } = applyPlayerPull(home, 'S', createRNG(`acc-${i}`));
      home = next;
      if (i === 0) targetKey = result.targetKey;
      // Pulls concentrate on the same closest-to-unlock player until it unlocks.
      expect(result.targetKey).toBe(targetKey);
      if (result.unlockedNow) unlocks += 1;
    }
    expect(unlocks).toBe(1); // only the final (6th) copy unlocks
    expect(home.players.length).toBe(before + 1);
    expect(home.collecting.length).toBe(0);
    expect(home.coins).toBe(100000 - S_COPIES * 2500);
  });

  it('overflows into a coin bounty and adds no player once a tier is fully owned', () => {
    const ownedS = tierPool('S').map(realPlayerToRosterPlayer);
    const home: HomeRoster = {
      ...createRookieRoster(createRNG('c')),
      players: ownedS,
      coins: 10000,
      ladderProgress: clearedThroughA(),
    };
    const { home: next, result } = applyPlayerPull(home, 'S', createRNG('pull-3'));
    expect(result.isOverflow).toBe(true);
    expect(next.coins).toBe(10000 - 2500 + 1250); // overflow bounty = half the scout price
    expect(next.players.length).toBe(home.players.length);
  });
});

describe('v13 copies migration', () => {
  it('keeps every previously-owned player unlocked and defaults collecting to []', () => {
    const home = { ...createRookieRoster(createRNG('mig')), coins: 500 };
    const serialized = serializeHomeRoster(home);
    delete (serialized.data as Partial<HomeRoster>).collecting; // simulate a pre-v13 save
    const restored = deserializeHomeRoster(serialized)!;
    expect(restored.collecting).toEqual([]);
    expect(restored.players.length).toBe(home.players.length);
    for (const p of home.players) {
      expect(restored.players.some((q) => playerKey(q) === playerKey(p))).toBe(true);
    }
  });

  it('promotes a saved in-progress entry that already meets its threshold', () => {
    const home = createRookieRoster(createRNG('mig2'));
    const ownedKeys = new Set(home.players.map(playerKey));
    const cPlayer = poolByClass('C')
      .map(realPlayerToRosterPlayer)
      .find((rp) => !ownedKeys.has(playerKey(rp)))!;
    const withCollecting: HomeRoster = { ...home, collecting: [{ player: cPlayer, copies: 1 }] };
    const restored = deserializeHomeRoster(serializeHomeRoster(withCollecting))!;
    expect(restored.collecting.length).toBe(0); // C owns at one copy: promoted to owned
    expect(restored.players.some((p) => playerKey(p) === playerKey(cPlayer))).toBe(true);
  });

  it('round-trips an in-progress entry that is below its threshold', () => {
    const home = createRookieRoster(createRNG('mig3'));
    const aPlayer = realPlayerToRosterPlayer(poolByClass('A')[0]);
    const withCollecting: HomeRoster = { ...home, collecting: [{ player: aPlayer, copies: 2 }] };
    const restored = deserializeHomeRoster(serializeHomeRoster(withCollecting))!;
    const entry = restored.collecting.find((c) => playerKey(c.player) === playerKey(aPlayer));
    expect(entry?.copies).toBe(2); // A needs three, so it stays collecting
    expect(restored.players.some((p) => playerKey(p) === playerKey(aPlayer))).toBe(false);
  });
});
