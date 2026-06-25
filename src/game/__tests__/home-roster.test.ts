import { describe, it, expect } from 'vitest';
import {
  createRookieRoster,
  mergeRunGainsIntoHome,
  applyPlayerPull,
  playerKey,
  type HomeRoster,
} from '@/game/home-roster';
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
