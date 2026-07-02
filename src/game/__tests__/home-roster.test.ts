import { describe, it, expect } from 'vitest';
import {
  createRookieRoster,
  mergeRunGainsIntoHome,
  previewRunAcquisitions,
  applyPlayerPull,
  claimRunBounty,
  clearScoutTarget,
  pinScoutTarget,
  playerKey,
  rememberDraftRotation,
  resolveDraftRotation,
  serializeHomeRoster,
  deserializeHomeRoster,
  grantCoach,
  selectCoach,
  ownsCoach,
  settleDailyRewards,
  type DailySettleInput,
  type HomeRoster,
} from '@/game/home-roster';
import { STARTER_COACH_ID, earnedCoachIds, coachesByClass } from '@/game/coaches';
import { poolByClass, realPlayerToRosterPlayer } from '@/game/player-pool';
import { tierPool } from '@/game/player-gacha';
import { FAVOR_RESIDUAL_COIN_RATE } from '@/game/favor';
import { overflowBounty } from '@/game/collection';
import { GRANDMASTER_KEY, bountyKey } from '@/game/bounties';
import { DAILY_BOUNTY_COINS, FIRST_WIN_COINS, WEEKLY_TIERS, spotlightCell } from '@/game/daily';
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
  it('deposits a copy toward a new recruit on a clear (A owns at four copies)', () => {
    const { home, runRoster, recruit } = setup();
    expect(home.players.some((p) => playerKey(p) === playerKey(recruit))).toBe(false);

    const next = mergeRunGainsIntoHome(home, runRoster, { rewards, champion: true, clearedClass: 'C', playedDifficulty: 'easy' });
    // An A-class recruit needs four copies, so one clear leaves it collecting (1/4), not
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
    const next = mergeRunGainsIntoHome(home, runRoster, { rewards, champion: true, clearedClass: 'C', playedDifficulty: 'easy' });
    expect(next.players.some((p) => playerKey(p) === playerKey(recruit))).toBe(true);
    expect(next.players.length).toBe(home.players.length + 1);
    expect(next.collecting.some((c) => playerKey(c.player) === playerKey(recruit))).toBe(false);
  });

  it('unlocks a recruit once enough clears deposit its copies (A at four)', () => {
    const { home, recruit } = setup();
    let cur = home;
    for (let i = 0; i < 4; i++) {
      const runRoster: Roster = { starters: cur.players.slice(0, 5), bench: [recruit] };
      cur = mergeRunGainsIntoHome(cur, runRoster, { rewards, champion: true, clearedClass: 'C', playedDifficulty: 'easy' });
    }
    expect(cur.players.some((p) => playerKey(p) === playerKey(recruit))).toBe(true);
    expect(cur.collecting.some((c) => playerKey(c.player) === playerKey(recruit))).toBe(false);
  });

  it('drops new recruits on a loss but never loses owned players or copies', () => {
    const { home, runRoster, recruit } = setup();
    const next = mergeRunGainsIntoHome(home, runRoster, { rewards, clearedClass: 'C', playedDifficulty: 'easy' });

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

    const won = mergeRunGainsIntoHome(home, runRoster, { rewards, legendOffered: true, champion: true, clearedClass: 'S', playedDifficulty: 'easy' });
    const kept = won.players.find((p) => playerKey(p) === playerKey(legend));
    expect(kept).toBeDefined();
    expect(kept!.legendary).toBe(true);
    expect(kept!.onLoan).toBeUndefined(); // banked as a normal owned player (no on-loan buff)

    const lost = mergeRunGainsIntoHome(home, runRoster, { rewards, legendOffered: true, clearedClass: 'S', playedDifficulty: 'easy' });
    expect(lost.players.some((p) => playerKey(p) === playerKey(legend))).toBe(false);
    expect(lost.collecting.some((c) => playerKey(c.player) === playerKey(legend))).toBe(false);
  });

  it('banks reputation (not coins) on both a clear and a loss', () => {
    const { home, runRoster } = setup();
    const won = mergeRunGainsIntoHome(home, runRoster, { rewards, champion: true, clearedClass: 'C', playedDifficulty: 'easy' });
    const lost = mergeRunGainsIntoHome(home, runRoster, { rewards, clearedClass: 'C', playedDifficulty: 'easy' });
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
    const won = mergeRunGainsIntoHome(home, runRoster, { rewards, champion: true, clearedClass: 'C', playedDifficulty: 'easy' });
    const lost = mergeRunGainsIntoHome(home, runRoster, { rewards, clearedClass: 'C', playedDifficulty: 'easy' });
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
    const next = mergeRunGainsIntoHome(home, runRoster, { rewards, champion: true, clearedClass: 'C', playedDifficulty: 'easy' });
    expect(next.ownedCoaches.length).toBe(home.ownedCoaches.length + 2);
    expect(next.selectedCoachId).toBe(home.selectedCoachId); // a win never changes the equip
    // A loss wins nothing.
    const lost = mergeRunGainsIntoHome(home, runRoster, { rewards, clearedClass: 'C', playedDifficulty: 'easy' });
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

    const won = previewRunAcquisitions(home, runRoster, { champion: true });
    // C owns at one copy -> unlocked; A owns at four -> progressed 0->1.
    expect(won.unlocked.some((p) => playerKey(p) === playerKey(cRecruit))).toBe(true);
    expect(won.unlocked.some((p) => playerKey(p) === playerKey(aRecruit))).toBe(false);
    expect(won.progressed.find((p) => playerKey(p.player) === playerKey(aRecruit))).toEqual(
      expect.objectContaining({ before: 0, after: 1, threshold: 4 })
    );

    const lost = previewRunAcquisitions(home, runRoster, {});
    expect(lost.unlocked).toEqual([]);
    expect(lost.progressed).toEqual([]);
  });

  it('matches what the merge actually banks', () => {
    const home = createRookieRoster(createRNG('acq2'));
    const { cRecruit, aRecruit } = freshRecruits(home);
    const runRoster: Roster = { starters: home.players.slice(0, 5), bench: [cRecruit, aRecruit] };
    const preview = previewRunAcquisitions(home, runRoster, { champion: true });
    const merged = mergeRunGainsIntoHome(home, runRoster, { rewards, champion: true, clearedClass: 'C', playedDifficulty: 'easy' });
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

describe('claimRunBounty: one-time championship bounties', () => {
  // Mirrors the load migration: a frontier implies every cell at-or-below it is cleared
  // (an in-memory home can never legitimately hold a frontier without its cells).
  const cellsForProgress = (progress: Partial<HomeRoster['ladderProgress']>): string[] => {
    const cells: string[] = [];
    for (const [d, frontier] of Object.entries(progress)) {
      if (!frontier) continue;
      for (const cls of ['C', 'B', 'A', 'S', 'S+'] as const) {
        cells.push(bountyKey(d as keyof HomeRoster['ladderProgress'], cls));
        if (cls === frontier) break;
      }
    }
    return cells;
  };
  const withProgress = (seed: string, progress: Partial<HomeRoster['ladderProgress']>): HomeRoster => ({
    ...createRookieRoster(createRNG(seed)),
    coins: 1000,
    ladderProgress: { easy: null, medium: null, hard: null, insane: null, ...progress },
    clearedCells: cellsForProgress(progress),
  });

  it('grants a coins bounty on a first clear, then nothing on a replay (idempotent)', () => {
    const home = withProgress('b-coins', {}); // fresh: easy frontier is null
    const first = claimRunBounty(home, 'easy', 'C', true, createRNG('g1'));
    expect(first.granted?.coins).toBe(150); // easy:C pays 150 coins
    expect(first.home.coins).toBe(1000 + 150);
    expect(first.home.claimedBounties).toContain(bountyKey('easy', 'C'));
    // Re-claiming the same cell (already in claimedBounties) grants nothing.
    const second = claimRunBounty(first.home, 'easy', 'C', true, createRNG('g1'));
    expect(second.granted).toBeNull();
    expect(second.home.coins).toBe(first.home.coins);
  });

  it('never materially grants a cell already cleared (crests-only for veterans)', () => {
    // A veteran who climbed easy to S replays easy:C. claimedBounties is empty, but the
    // cell is in clearedCells (seeded from the frontier on load), so no material is
    // granted (their crest still shows, derived from the cell set).
    const veteran = withProgress('b-vet', { easy: 'S' });
    const res = claimRunBounty(veteran, 'easy', 'C', true, createRNG('gv'));
    expect(res.granted).toBeNull();
    expect(res.home.coins).toBe(veteran.coins);
    expect(res.home.claimedBounties).toEqual([]);
  });

  it('a jumped-over cell still pays: bounty claims are cell-exact, not frontier-based', () => {
    // Cross-difficulty unlocks let a player clear insane:S without ever touching
    // insane:C. The frontier reads S, but insane:C was never CLEARED, so its bounty
    // (an A-tier player grant) is still owed when they come back for it.
    const jumper: HomeRoster = {
      ...createRookieRoster(createRNG('b-jump')),
      coins: 1000,
      ladderProgress: { easy: null, medium: null, hard: null, insane: 'S' },
      clearedCells: [bountyKey('insane', 'S')],
    };
    const res = claimRunBounty(jumper, 'insane', 'C', true, createRNG('gj'));
    expect(res.granted).not.toBeNull();
    expect(res.home.claimedBounties).toContain(bountyKey('insane', 'C'));
  });

  it('grants nothing on a loss', () => {
    const home = withProgress('b-loss', {});
    const res = claimRunBounty(home, 'easy', 'C', false, createRNG('gl'));
    expect(res.granted).toBeNull();
    expect(res.home).toBe(home);
  });

  it('a player bounty deposits a copy and unlocks per copiesToOwn', () => {
    // insane:S grants a legendary player (owns at one copy) -> unlocks immediately.
    const home = withProgress('b-legend', { insane: 'A' }); // frontier A < S: a first clear
    const before = home.players.length;
    const res = claimRunBounty(home, 'insane', 'S', true, createRNG('gp'));
    expect(res.granted?.player).toBeDefined();
    expect(res.granted?.playerUnlocked).toBe(true);
    expect(res.home.players.length).toBe(before + 1);

    // medium:S grants an A player (owns at three) -> progressed, not unlocked.
    const home2 = withProgress('b-aplayer', { medium: 'A' });
    const res2 = claimRunBounty(home2, 'medium', 'S', true, createRNG('ga'));
    expect(res2.granted?.player).toBeDefined();
    expect(res2.granted?.playerUnlocked).toBe(false);
    expect(res2.home.collecting.length).toBe(1);
  });

  it('a player bounty on a fully-owned tier overflows into coins, no new player', () => {
    const home: HomeRoster = {
      ...withProgress('b-overflow', { insane: 'A' }),
      players: [...createRookieRoster(createRNG('b-overflow')).players, ...NBA_LEGENDS.map(realPlayerToRosterPlayer)],
    };
    const before = home.players.length;
    const res = claimRunBounty(home, 'insane', 'S', true, createRNG('go')); // insane:S = legendary player
    expect(res.granted?.coins).toBe(overflowBounty('S+')); // all legends owned -> overflow bounty
    expect(res.home.players.length).toBe(before);
  });

  it('an ability bounty adds a copy to the inventory', () => {
    const home = withProgress('b-ability', { easy: 'A' }); // easy:S = rare ability; frontier A < S
    const res = claimRunBounty(home, 'easy', 'S', true, createRNG('gab'));
    expect(res.granted?.abilityId).toBeDefined();
    expect(res.home.abilityInventory[res.granted!.abilityId!]).toBe(1);
  });

  it('is deterministic: same seed and home yield an identical grant', () => {
    const home = withProgress('b-det', { easy: 'A' });
    const a = claimRunBounty(home, 'easy', 'S', true, createRNG('same'));
    const b = claimRunBounty(home, 'easy', 'S', true, createRNG('same'));
    expect(a.granted).toEqual(b.granted);
    expect(a.home.abilityInventory).toEqual(b.home.abilityInventory);
  });

  it('the insane:S+ capstone is the Grandmaster crest plus a coin bundle', () => {
    const home = withProgress('b-cap', { insane: 'S' }); // frontier S < S+
    const res = claimRunBounty(home, 'insane', 'S+', true, createRNG('gc'));
    expect(res.granted?.isCapstone).toBe(true);
    expect(res.granted?.coins).toBe(10000);
    expect(res.home.coins).toBe(home.coins + 10000);
    expect(res.home.claimedBounties).toContain(GRANDMASTER_KEY);
  });
});

describe('v15 bounties migration', () => {
  it('defaults claimedBounties to [] on a pre-v15 save and round-trips', () => {
    const home = createRookieRoster(createRNG('b-mig'));
    const serialized = serializeHomeRoster(home);
    delete (serialized.data as Partial<HomeRoster>).claimedBounties; // simulate a pre-v15 save
    expect(deserializeHomeRoster(serialized)!.claimedBounties).toEqual([]);

    const withClaims: HomeRoster = { ...home, claimedBounties: [bountyKey('easy', 'C')] };
    const restored = deserializeHomeRoster(serializeHomeRoster(withClaims))!;
    expect(restored.claimedBounties).toEqual([bountyKey('easy', 'C')]);
  });

  it('filters out stale / garbage claimed keys', () => {
    const home = createRookieRoster(createRNG('b-mig2'));
    const dirty = {
      version: 15,
      data: { ...home, claimedBounties: [bountyKey('hard', 'A'), 'not:a:cell', 42, null] },
    };
    const restored = deserializeHomeRoster(dirty)!;
    expect(restored.claimedBounties).toEqual([bountyKey('hard', 'A')]);
  });
});

describe('v16 cleared-cells migration', () => {
  it('seeds clearedCells from each frontier on a pre-v16 save', () => {
    const home: HomeRoster = {
      ...createRookieRoster(createRNG('c-mig')),
      ladderProgress: { easy: 'A', medium: 'C', hard: null, insane: null },
    };
    const serialized = serializeHomeRoster(home);
    delete (serialized.data as Partial<HomeRoster>).clearedCells; // simulate pre-v16
    const restored = deserializeHomeRoster(serialized)!;
    expect([...restored.clearedCells].sort()).toEqual(
      [
        bountyKey('easy', 'C'),
        bountyKey('easy', 'B'),
        bountyKey('easy', 'A'),
        bountyKey('medium', 'C'),
      ].sort()
    );
  });

  it('a migrated veteran cannot re-farm a conquered cell bounty', () => {
    const home: HomeRoster = {
      ...createRookieRoster(createRNG('c-farm')),
      coins: 0,
      ladderProgress: { easy: 'S', medium: null, hard: null, insane: null },
      claimedBounties: [], // pre-v15 veteran: cleared long ago, nothing recorded
    };
    const serialized = serializeHomeRoster(home);
    delete (serialized.data as Partial<HomeRoster>).clearedCells;
    const restored = deserializeHomeRoster(serialized)!;
    const res = claimRunBounty(restored, 'easy', 'C', true, createRNG('cf'));
    expect(res.granted).toBeNull();
    expect(res.home.coins).toBe(0);
  });

  it('keeps saved cells, drops garbage, and self-heals the frontier upward', () => {
    const home = createRookieRoster(createRNG('c-heal'));
    const dirty = {
      version: 16,
      data: {
        ...home,
        // Cells say insane:S was cleared, but the saved frontier lags at null.
        clearedCells: [bountyKey('insane', 'S'), 'garbage', 7, null],
        ladderProgress: { easy: null, medium: null, hard: null, insane: null },
      },
    };
    const restored = deserializeHomeRoster(dirty)!;
    expect(restored.clearedCells).toEqual([bountyKey('insane', 'S')]);
    expect(restored.ladderProgress.insane).toBe('S'); // healed from the cell set
  });

  it('round-trips clearedCells and unions frontier-derived cells', () => {
    const home: HomeRoster = {
      ...createRookieRoster(createRNG('c-rt')),
      ladderProgress: { easy: 'C', medium: null, hard: null, insane: null },
      clearedCells: [bountyKey('hard', 'B')], // a jumped cell, no easy cells recorded
    };
    const restored = deserializeHomeRoster(serializeHomeRoster(home))!;
    expect(restored.clearedCells).toContain(bountyKey('hard', 'B'));
    expect(restored.clearedCells).toContain(bountyKey('easy', 'C')); // seeded from frontier
    expect(restored.ladderProgress.hard).toBe('B'); // healed upward
  });
});

describe('the copies multiplier (harder clears bank more of every recruit)', () => {
  it('a hard clear (x3) leaves an at-class A recruit at 3/4, one copy shy', () => {
    // A owns at FOUR copies, one above the biggest sub-insane multiplier, so no single
    // clear insta-owns an A: the chase always survives the championship that started it.
    const { home, runRoster, recruit } = setup(); // recruit is A-class (threshold 4)
    const next = mergeRunGainsIntoHome(home, runRoster, {
      champion: true,
      clearedClass: 'A',
      playedDifficulty: 'hard',
      ladderClass: 'A',
    });
    expect(next.players.some((p) => playerKey(p) === playerKey(recruit))).toBe(false);
    const entry = next.collecting.find((c) => playerKey(c.player) === playerKey(recruit));
    expect(entry?.copies).toBe(3);
  });

  it('a reach-up recruit deposits exactly ONE copy, ignoring the multiplier', () => {
    // The structural no-leak rule: an A-class recruit signed on the B ladder is a
    // taste of the class above, never a full signing. Without the cap, hard's x3
    // multiplier would own A players from below-ladder content.
    const { home, runRoster, recruit } = setup(); // A-class recruit
    const next = mergeRunGainsIntoHome(home, runRoster, {
      champion: true,
      clearedClass: 'B',
      playedDifficulty: 'insane', // x4, the worst case
      ladderClass: 'B',
    });
    expect(next.players.some((p) => playerKey(p) === playerKey(recruit))).toBe(false);
    const entry = next.collecting.find((c) => playerKey(c.player) === playerKey(recruit));
    expect(entry?.copies).toBe(1);
  });

  it('a medium clear (x2) leaves the same at-class A recruit at 2/4', () => {
    const { home, runRoster, recruit } = setup();
    const next = mergeRunGainsIntoHome(home, runRoster, {
      champion: true,
      clearedClass: 'A',
      playedDifficulty: 'medium',
      ladderClass: 'A',
    });
    const entry = next.collecting.find((c) => playerKey(c.player) === playerKey(recruit));
    expect(entry?.copies).toBe(2);
  });

  it('an insane clear (x4) tops an S recruit up to 4/6, never past the threshold', () => {
    const home = createRookieRoster(createRNG('mul-s'));
    const sRecruit = realPlayerToRosterPlayer(poolByClass('S')[0]);
    const runRoster: Roster = { starters: home.players.slice(0, 5), bench: [sRecruit] };
    const next = mergeRunGainsIntoHome(home, runRoster, {
      champion: true,
      clearedClass: 'S',
      playedDifficulty: 'insane',
    });
    const entry = next.collecting.find((c) => playerKey(c.player) === playerKey(sRecruit));
    expect(entry?.copies).toBe(4);
    // A follow-up insane clear deposits only the two copies still needed (capped), so
    // the player unlocks exactly at 6 with nothing minted past the threshold.
    const again = mergeRunGainsIntoHome(next, runRoster, {
      champion: true,
      clearedClass: 'S',
      playedDifficulty: 'insane',
    });
    expect(again.players.some((p) => playerKey(p) === playerKey(sRecruit))).toBe(true);
    expect(again.collecting.some((c) => playerKey(c.player) === playerKey(sRecruit))).toBe(false);
  });

  it('legends are exempt: exactly one copy regardless of difficulty', () => {
    const home = createRookieRoster(createRNG('mul-leg'));
    const legend: RosterPlayer = { ...realPlayerToRosterPlayer(NBA_LEGENDS[0]), onLoan: true };
    const runRoster: Roster = { starters: home.players.slice(0, 5), bench: [legend] };
    const next = mergeRunGainsIntoHome(home, runRoster, {
      champion: true,
      clearedClass: 'S+',
      playedDifficulty: 'insane',
    });
    // S+ owns at one copy; the x4 multiplier must not apply (nothing to multiply into).
    expect(next.players.filter((p) => playerKey(p) === playerKey(legend))).toHaveLength(1);
  });

  it('the preview mirrors the merge under the multiplier', () => {
    const { home, runRoster, recruit } = setup();
    const settle = { champion: true, playedDifficulty: 'hard' as const, ladderClass: 'A' as const };
    const preview = previewRunAcquisitions(home, runRoster, settle);
    const merged = mergeRunGainsIntoHome(home, runRoster, {
      ...settle,
      clearedClass: 'A' as const,
    });
    const progressed = preview.progressed.find((p) => playerKey(p.player) === playerKey(recruit));
    expect(progressed).toMatchObject({ before: 0, after: 3, threshold: 4 });
    const entry = merged.collecting.find((c) => playerKey(c.player) === playerKey(recruit));
    expect(entry?.copies).toBe(3);
    expect(preview.unlocked).toEqual([]);
  });
});

describe('milestone banking (a deep hard/insane loss still pays one copy)', () => {
  const lossAt = (bossWins: number, playedDifficulty: 'easy' | 'medium' | 'hard' | 'insane') => {
    const { home, runRoster, recruit } = setup(); // one new A-class recruit
    const next = mergeRunGainsIntoHome(home, runRoster, { playedDifficulty, bossWins });
    return { next, recruit };
  };

  it('a hard loss after 4 boss wins banks one copy of the best recruit', () => {
    const { next, recruit } = lossAt(4, 'hard');
    const entry = next.collecting.find((c) => playerKey(c.player) === playerKey(recruit));
    expect(entry?.copies).toBe(1); // exactly one copy, never multiplied
  });

  it('an insane loss short of the milestone banks nothing', () => {
    const { next, recruit } = lossAt(3, 'insane');
    expect(next.collecting.some((c) => playerKey(c.player) === playerKey(recruit))).toBe(false);
  });

  it('easy and medium losses never bank (their forgiveness is the timeout pool)', () => {
    for (const d of ['easy', 'medium'] as const) {
      const { next, recruit } = lossAt(6, d);
      expect(next.collecting.some((c) => playerKey(c.player) === playerKey(recruit))).toBe(false);
    }
  });

  it('banks only the single BEST non-legend recruit, and never a legend', () => {
    const home = createRookieRoster(createRNG('bank-best'));
    const legend: RosterPlayer = { ...realPlayerToRosterPlayer(NBA_LEGENDS[0]), onLoan: true };
    const aRecruit = realPlayerToRosterPlayer(poolByClass('A')[0]);
    const cRecruit = realPlayerToRosterPlayer(poolByClass('C')[0]);
    const runRoster: Roster = {
      starters: home.players.slice(0, 5),
      bench: [legend, cRecruit, aRecruit],
    };
    const next = mergeRunGainsIntoHome(home, runRoster, {
      playedDifficulty: 'insane',
      bossWins: 5,
    });
    // The legend is barred (it would own at one copy from a LOSS); the A beats the C.
    expect(next.players.some((p) => playerKey(p) === playerKey(legend))).toBe(false);
    expect(next.collecting.some((c) => playerKey(c.player) === playerKey(legend))).toBe(false);
    expect(next.collecting.some((c) => playerKey(c.player) === playerKey(aRecruit))).toBe(true);
    expect(next.collecting.some((c) => playerKey(c.player) === playerKey(cRecruit))).toBe(false);
  });

  it('never milestone-banks a reach-up recruit (dying must not out-farm clearing)', () => {
    // On the B ladder a reach-up A's clear deposit is capped at one copy, the same as a
    // milestone bank, so banking it from a loss would make a 4-boss suicide the fastest
    // A farm. The at-class B banks instead; a lone reach-up candidate banks nothing.
    const home = createRookieRoster(createRNG('bank-reach'));
    const ownedKeys = new Set(home.players.map(playerKey));
    const aRecruit = realPlayerToRosterPlayer(poolByClass('A')[0]);
    const bRecruit = poolByClass('B')
      .map(realPlayerToRosterPlayer)
      .find((rp) => !ownedKeys.has(playerKey(rp)))!;
    const both = mergeRunGainsIntoHome(
      home,
      { starters: home.players.slice(0, 5), bench: [aRecruit, bRecruit] },
      { playedDifficulty: 'hard', bossWins: 4, ladderClass: 'B' }
    );
    expect(both.collecting.some((c) => playerKey(c.player) === playerKey(aRecruit))).toBe(false);
    expect(both.players.some((p) => playerKey(p) === playerKey(bRecruit))).toBe(true); // B owns at 1

    const only = mergeRunGainsIntoHome(
      home,
      { starters: home.players.slice(0, 5), bench: [aRecruit] },
      { playedDifficulty: 'hard', bossWins: 4, ladderClass: 'B' }
    );
    expect(only.collecting.some((c) => playerKey(c.player) === playerKey(aRecruit))).toBe(false);
  });

  it('the preview mirrors a milestone-banked loss', () => {
    const { home, runRoster, recruit } = setup();
    const preview = previewRunAcquisitions(home, runRoster, {
      playedDifficulty: 'hard',
      bossWins: 4,
    });
    expect(preview.unlocked).toEqual([]);
    expect(preview.progressed.map((p) => playerKey(p.player))).toEqual([playerKey(recruit)]);
  });
});

describe('mergeRunGainsIntoHome: cleared cells', () => {
  it('a championship stamps its exact cell; a loss stamps nothing', () => {
    const { home, runRoster } = setup();
    const won = mergeRunGainsIntoHome(home, runRoster, { rewards, champion: true, clearedClass: 'C', playedDifficulty: 'hard' });
    expect(won.clearedCells).toContain(bountyKey('hard', 'C'));
    expect(won.ladderProgress.hard).toBe('C'); // the frontier stays in sync
    const lost = mergeRunGainsIntoHome(home, runRoster, { rewards });
    expect(lost.clearedCells).toEqual([]);
  });

  it('re-clearing a cell does not duplicate it', () => {
    const { home, runRoster } = setup();
    const once = mergeRunGainsIntoHome(home, runRoster, { rewards, champion: true, clearedClass: 'C', playedDifficulty: 'easy' });
    const twice = mergeRunGainsIntoHome(once, runRoster, { rewards, champion: true, clearedClass: 'C', playedDifficulty: 'easy' });
    expect(twice.clearedCells.filter((k) => k === bountyKey('easy', 'C'))).toHaveLength(1);
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

describe('settleDailyRewards: the Daily Layer settle', () => {
  const CELL = { difficulty: 'easy', ladderClass: 'C' } as const;
  const base = (over: Partial<HomeRoster> = {}): HomeRoster => ({
    ...createRookieRoster(createRNG('daily-home')),
    coins: 0,
    ...over,
  });
  const input = (over: Partial<DailySettleInput> = {}): DailySettleInput => ({
    runCell: { ...CELL },
    today: '2026-07-01',
    week: '2026-06-29',
    champion: true,
    wins: 12,
    rng: createRNG('daily-rng'),
    ...over,
  });
  /** A rookie's spotlight for a day (rookies always spotlight class C). */
  const rookieSpot = (day: string) => spotlightCell(day, []);

  it('pays the spotlight bounty once per day, only on the featured cell', () => {
    const day = '2026-07-01';
    const spot = rookieSpot(day);
    const hit = settleDailyRewards(base(), input({ runCell: spot, today: day }));
    expect(hit.granted.spotlight).toEqual({ cell: spot, coins: DAILY_BOUNTY_COINS[spot.difficulty] });
    expect(hit.home.daily?.spotlightClaimedDay).toBe(day);
    // A second championship on the same cell the same day pays no spotlight.
    const again = settleDailyRewards(hit.home, input({ runCell: spot, today: day }));
    expect(again.granted.spotlight).toBeUndefined();
    // A different cell never pays the spotlight.
    const offCell = { difficulty: spot.difficulty === 'easy' ? 'hard' : 'easy', ladderClass: spot.ladderClass } as const;
    const miss = settleDailyRewards(base(), input({ runCell: offCell, today: day }));
    expect(miss.granted.spotlight).toBeUndefined();
    expect(miss.home.daily?.spotlightClaimedDay).toBeUndefined();
  });

  it('pays the first-win purse + a C scout pull once per day, championships only', () => {
    const res = settleDailyRewards(base(), input());
    expect(res.granted.firstWin?.coins).toBe(FIRST_WIN_COINS);
    expect(res.granted.firstWin?.player).toBeDefined();
    expect(res.home.daily?.firstWinClaimedDay).toBe('2026-07-01');
    // The pull deposited exactly like a paid one: owned (C owns at 1) or overflow.
    const gained = res.home.players.length - base().players.length;
    expect(gained === 1 || (res.granted.firstWin?.overflowCoins ?? 0) > 0).toBe(true);
    // Second championship the same day: no first-win.
    const again = settleDailyRewards(res.home, input());
    expect(again.granted.firstWin).toBeUndefined();
    // A loss never pays it.
    const loss = settleDailyRewards(base(), input({ champion: false }));
    expect(loss.granted.firstWin).toBeUndefined();
    expect(loss.home.daily).toBeUndefined();
  });

  it('banks wins into the weekly ledger even on a loss, and rolls the week', () => {
    const loss = settleDailyRewards(base(), input({ champion: false, wins: 7 }));
    expect(loss.home.weekly).toEqual({ week: '2026-06-29', gameWins: 7, claimedTiers: [] });
    // A settle in a NEW week replaces the ledger wholesale.
    const rolled = settleDailyRewards(loss.home, input({ champion: false, wins: 4, week: '2026-07-06' }));
    expect(rolled.home.weekly).toEqual({ week: '2026-07-06', gameWins: 4, claimedTiers: [] });
  });

  it('auto-grants crossed weekly tiers exactly once, several in one settle', () => {
    const t1 = settleDailyRewards(base(), input({ champion: false, wins: 12 }));
    expect(t1.granted.weeklyTiers.map((t) => t.tier)).toEqual([0]);
    expect(t1.home.coins).toBe(WEEKLY_TIERS[0].coins);
    // 12 -> 112 wins crosses tiers 2 and 3 together; tier 1 never re-pays.
    const t23 = settleDailyRewards(t1.home, input({ champion: false, wins: 100 }));
    expect(t23.granted.weeklyTiers.map((t) => t.tier)).toEqual([1, 2]);
    expect(t23.home.weekly?.claimedTiers).toEqual([0, 1, 2]);
    // The top tier also granted one rare ability into the inventory.
    const abilityId = t23.granted.weeklyTiers[1].abilityId!;
    expect(t23.home.abilityInventory[abilityId]).toBe(1);
    // Nothing further to pay this week.
    const done = settleDailyRewards(t23.home, input({ champion: false, wins: 50 }));
    expect(done.granted.weeklyTiers).toEqual([]);
  });

  it('is deterministic: a crash-resumed settle reproduces identical grants', () => {
    const home = base();
    const a = settleDailyRewards(home, input({ rng: createRNG('resume') }));
    const b = settleDailyRewards(home, input({ rng: createRNG('resume') }));
    expect(a.granted).toEqual(b.granted);
    expect(a.home).toEqual(b.home);
  });

  it('never reduces anything: a mismatched day or week only re-arms grants', () => {
    const claimed = base({
      daily: { spotlightClaimedDay: '2026-07-01', firstWinClaimedDay: '2026-07-01' },
      weekly: { week: '2026-06-29', gameWins: 40, claimedTiers: [0, 1] },
    });
    const nextDay = settleDailyRewards(claimed, input({ today: '2026-07-02', wins: 0 }));
    // Yesterday's stamps are overwritten only by new grants, never blanked.
    expect(nextDay.home.daily?.firstWinClaimedDay).toBe('2026-07-02');
    expect(nextDay.home.weekly?.gameWins).toBe(40); // same week: counters kept
  });
});

describe('v17 daily/weekly migration', () => {
  it('defaults both ledgers to undefined on a pre-v17 save', () => {
    const home = createRookieRoster(createRNG('d-mig'));
    const serialized = serializeHomeRoster(home);
    delete (serialized.data as Partial<HomeRoster>).daily;
    delete (serialized.data as Partial<HomeRoster>).weekly;
    const restored = deserializeHomeRoster(serialized)!;
    expect(restored.daily).toBeUndefined();
    expect(restored.weekly).toBeUndefined();
  });

  it('round-trips stamps and counters, drops garbage shapes', () => {
    const home: HomeRoster = {
      ...createRookieRoster(createRNG('d-rt')),
      daily: { spotlightClaimedDay: '2026-07-01' },
      weekly: { week: '2026-06-29', gameWins: 42, claimedTiers: [0, 1] },
    };
    const restored = deserializeHomeRoster(serializeHomeRoster(home))!;
    expect(restored.daily).toEqual({ spotlightClaimedDay: '2026-07-01' });
    expect(restored.weekly).toEqual({ week: '2026-06-29', gameWins: 42, claimedTiers: [0, 1] });

    const dirty = {
      version: 17,
      data: {
        ...home,
        daily: 42,
        weekly: { week: 7, gameWins: 'lots', claimedTiers: [0, 'x', -1, 99, 0] },
      },
    };
    const cleaned = deserializeHomeRoster(dirty)!;
    expect(cleaned.daily).toBeUndefined();
    expect(cleaned.weekly).toBeUndefined(); // week key is not a string: ledger dropped

    const partial = {
      version: 17,
      data: { ...home, weekly: { week: '2026-06-29', gameWins: -3, claimedTiers: [0, 'x', 99, 0] } },
    };
    const healed = deserializeHomeRoster(partial)!;
    expect(healed.weekly).toEqual({ week: '2026-06-29', gameWins: 0, claimedTiers: [0] });
  });
});

describe('favor settle (banked win or lose, converted through the deposit path)', () => {
  const keyOf = (rp: RosterPlayer) => playerKey(rp);

  it('banks a loss run wins favor at the difficulty multiplier', () => {
    const { home, runRoster, recruit } = setup();
    const lost = mergeRunGainsIntoHome(home, runRoster, {
      playedDifficulty: 'easy',
      ladderClass: 'A',
      runFavor: { [keyOf(recruit)]: 12 },
    });
    expect(lost.favor[keyOf(recruit)]).toBe(12); // easy x1.0
    const hard = mergeRunGainsIntoHome(home, runRoster, {
      playedDifficulty: 'hard',
      ladderClass: 'A',
      runFavor: { [keyOf(recruit)]: 12 },
    });
    expect(hard.favor[keyOf(recruit)]).toBe(18); // hard x1.5
  });

  it('damps a reach-up recruit favor by half', () => {
    const { home, runRoster, recruit } = setup(); // A recruit
    const next = mergeRunGainsIntoHome(home, runRoster, {
      playedDifficulty: 'hard',
      ladderClass: 'B', // A is a reach-up on the B ladder
      runFavor: { [keyOf(recruit)]: 12 },
    });
    expect(next.favor[keyOf(recruit)]).toBe(9); // round(12 x 1.5 x 0.5)
  });

  it('owned players and mid-run cuts earn nothing', () => {
    const { home, runRoster } = setup();
    const ownedKey = playerKey(home.players[0]); // fielded, already owned
    const ghostKey = 'Cut Player|PG'; // accrued, then dropped before run end
    const next = mergeRunGainsIntoHome(home, runRoster, {
      playedDifficulty: 'easy',
      ladderClass: 'A',
      runFavor: { [ownedKey]: 30, [ghostKey]: 30 },
    });
    expect(next.favor[ownedKey]).toBeUndefined();
    expect(next.favor[ghostKey]).toBeUndefined();
  });

  it('converts whole copies at the class threshold and keeps the remainder', () => {
    const base = setup();
    const key = keyOf(base.recruit);
    const home = { ...base.home, favor: { [key]: 35 } };
    const next = mergeRunGainsIntoHome(home, base.runRoster, {
      playedDifficulty: 'easy',
      ladderClass: 'A',
      runFavor: { [key]: 10 }, // 35 + 10 = 45 = 1 copy (40) + 5
    });
    const entry = next.collecting.find((c) => playerKey(c.player) === key);
    expect(entry?.copies).toBe(1);
    expect(next.favor[key]).toBe(5);
  });

  it('a favor conversion can unlock on a LOSS, paying residual as coins', () => {
    const base = setup();
    const key = keyOf(base.recruit);
    const home = {
      ...base.home,
      favor: { [key]: 35 },
      collecting: [{ player: base.recruit, copies: 3 }], // 3/4, one favor copy away
    };
    const next = mergeRunGainsIntoHome(home, base.runRoster, {
      playedDifficulty: 'easy',
      ladderClass: 'A',
      runFavor: { [key]: 10 }, // 45 = 1 copy + 5 residual
    });
    expect(next.players.some((p) => playerKey(p) === key)).toBe(true);
    expect(next.collecting.some((c) => playerKey(c.player) === key)).toBe(false);
    expect(next.favor[key]).toBeUndefined();
    expect(next.coins).toBe(home.coins + 5 * FAVOR_RESIDUAL_COIN_RATE);
  });

  it('a deposit-signed recruit keeps no favor; the bank pays out as coins', () => {
    const home = createRookieRoster(createRNG('fav-signed'));
    const ownedKeys = new Set(home.players.map(playerKey));
    const bRecruit = poolByClass('B')
      .map(realPlayerToRosterPlayer)
      .find((rp) => !ownedKeys.has(playerKey(rp)))!;
    const key = playerKey(bRecruit);
    const seeded = { ...home, favor: { [key]: 12 } };
    const runRoster: Roster = { starters: home.players.slice(0, 5), bench: [bRecruit] };
    const next = mergeRunGainsIntoHome(seeded, runRoster, {
      champion: true,
      clearedClass: 'B',
      playedDifficulty: 'easy',
      ladderClass: 'B',
      runFavor: { [key]: 20 }, // ignored: the clear signs them outright (B owns at 1)
    });
    expect(next.players.some((p) => playerKey(p) === key)).toBe(true);
    expect(next.favor[key]).toBeUndefined();
    expect(next.coins).toBe(seeded.coins + 12 * FAVOR_RESIDUAL_COIN_RATE);
  });

  it('the preview favor delta mirrors what the merge banks', () => {
    const base = setup();
    const key = keyOf(base.recruit);
    const home = { ...base.home, favor: { [key]: 35 } };
    const settle = {
      playedDifficulty: 'easy' as const,
      ladderClass: 'A' as const,
      runFavor: { [key]: 10 },
    };
    const preview = previewRunAcquisitions(home, base.runRoster, settle);
    const merged = mergeRunGainsIntoHome(home, base.runRoster, settle);
    const row = preview.favorDelta.find((r) => playerKey(r.player) === key)!;
    expect(row).toMatchObject({ before: 35, earned: 10, copiesGranted: 1, after: 5 });
    expect(merged.favor[key]).toBe(row.after);
  });
});

describe('home roster v18 (favor ledger + scout targets)', () => {
  it('older saves default to an empty ledger with a goodwill grant for in-progress A entries', () => {
    const home = createRookieRoster(createRNG('mig-fav'));
    const ownedKeys = new Set(home.players.map(playerKey));
    const aRecruit = realPlayerToRosterPlayer(poolByClass('A')[0]);
    const bRecruit = poolByClass('B')
      .map(realPlayerToRosterPlayer)
      .find((rp) => !ownedKeys.has(playerKey(rp)))!;
    const legacy = {
      version: 17,
      data: {
        ...home,
        collecting: [
          { player: aRecruit, copies: 2 },
          // A pre-v14-style in-progress S would also survive; only A gets goodwill.
        ],
        favor: undefined,
        scoutTargets: undefined,
      },
    };
    const restored = deserializeHomeRoster(legacy)!;
    // The A threshold moved 3 -> 4 in the same version; the meter moves FORWARD.
    expect(restored.favor[playerKey(aRecruit)]).toBe(20);
    expect(restored.favor[playerKey(bRecruit)]).toBeUndefined();
  });

  it('drops garbage favor and entries for owned players on load', () => {
    const home = createRookieRoster(createRNG('mig-fav2'));
    const ownedKey = playerKey(home.players[0]);
    const dirty = serializeHomeRoster({
      ...home,
      favor: {
        [ownedKey]: 25,
        'Real Chase|PG': 12.7,
        'Bad Value|SG': Number.NaN,
        'Negative|C': -4,
      },
    });
    const restored = deserializeHomeRoster(dirty)!;
    expect(restored.favor[ownedKey]).toBeUndefined();
    expect(restored.favor['Real Chase|PG']).toBe(12);
    expect(restored.favor['Bad Value|SG']).toBeUndefined();
    expect(restored.favor['Negative|C']).toBeUndefined();
  });

  it('round-trips a valid pin and unpins invalid or owned targets', () => {
    const home = createRookieRoster(createRNG('mig-pin'));
    const ownedKeys = new Set(home.players.map(playerKey));
    const target = tierPool('A')
      .map((p) => `${p.name}|${p.position}`)
      .find((k) => !ownedKeys.has(k))!;
    const pinned = pinScoutTarget(home, 'A', target);
    expect(pinned.scoutTargets?.A).toBe(target);
    const restored = deserializeHomeRoster(serializeHomeRoster(pinned))!;
    expect(restored.scoutTargets?.A).toBe(target);
    // An invalid pin (wrong pool) and an owned pin sanitize away.
    const dirty = serializeHomeRoster({
      ...home,
      scoutTargets: { A: 'Not A Player|PG', C: playerKey(home.players[0]) },
    });
    expect(deserializeHomeRoster(dirty)!.scoutTargets).toBeUndefined();
  });

  it('pinScoutTarget guards owned keys and wrong pools; clearScoutTarget unpins', () => {
    const home = createRookieRoster(createRNG('pin-guard'));
    expect(pinScoutTarget(home, 'A', playerKey(home.players[0]))).toBe(home);
    expect(pinScoutTarget(home, 'A', 'Nobody|PG')).toBe(home);
    const ownedKeys = new Set(home.players.map(playerKey));
    const target = tierPool('S')
      .map((p) => `${p.name}|${p.position}`)
      .find((k) => !ownedKeys.has(k))!;
    const pinned = pinScoutTarget(home, 'S', target);
    expect(pinned.scoutTargets?.S).toBe(target);
    expect(clearScoutTarget(pinned, 'S').scoutTargets).toBeUndefined();
    expect(clearScoutTarget(home, 'S')).toBe(home);
  });

  it('a pull that completes a favored chase pays the residual favor as coins', () => {
    const home = createRookieRoster(createRNG('pull-residual'));
    const ownedKeys = new Set(home.players.map(playerKey));
    const target = tierPool('C')
      .map((p) => `${p.name}|${p.position}`)
      .find((k) => !ownedKeys.has(k))!;
    const seeded = pinScoutTarget({ ...home, coins: 250, favor: { [target]: 10 } }, 'C', target);
    const { home: after, result } = applyPlayerPull(seeded, 'C', createRNG('pr'));
    expect(result.targetKey).toBe(target);
    expect(result.unlockedNow).toBe(true); // C owns at one copy
    expect(after.favor[target]).toBeUndefined();
    expect(after.coins).toBe(0 + 10 * FAVOR_RESIDUAL_COIN_RATE);
  });
});
