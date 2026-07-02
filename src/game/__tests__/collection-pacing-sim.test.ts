import { describe, it, expect } from 'vitest';
import { createRNG, deriveSeed } from '@/game/rng';
import {
  applyPlayerPull,
  createRookieRoster,
  mergeRunGainsIntoHome,
  pinScoutTarget,
  playerKey,
  type HomeRoster,
} from '@/game/home-roster';
import { generateRecruitOffers } from '@/game/tournament';
import { poolByClass, realPlayerToRosterPlayer } from '@/game/player-pool';
import { PLAYER_MACHINES, tierForClass, type PlayerGachaTier } from '@/game/player-gacha';
import { COPIES_TO_OWN, copiesToOwn } from '@/game/collection';
import { FAVOR_PER_COPY } from '@/game/favor';
import type { Difficulty, LadderClass } from '@/game/difficulty-mode';
import type { PlayerClass } from '@/game/ratings';
import type { Roster } from '@/types/roster';

/**
 * COLLECTION PACING SIMULATION: the acceptance test for the reach-up fix and the
 * favor system. It drives the REAL economy machinery (generateRecruitOffers with the
 * re-offer bias, mergeRunGainsIntoHome's deposits + favor settle, applyPlayerPull's
 * pinned targeting) with a modeled game layer, in the spirit of balance-sim.test.ts:
 *
 *  - Game outcomes are Bernoulli(clearRate) from a seeded RNG (the sim engine's
 *    clear rates are balance-sim's concern, not this file's).
 *  - Coin income per run and the share spent on the chase are fixed modeling
 *    constants, matching the documented economy (~950 easy clear, coinMul scaled).
 *  - A run offers the target at ~6 recruit nodes via the real offer generator; once
 *    offered, the target is accepted and fielded for the rest of the run.
 *  - Favor base points approximate a full run at 45 (11 games + 4 elites + 7 bosses
 *    + the championship bonus), scaled by how much of the run remained after joining.
 *
 * The two guards:
 *  1. LEAK GUARD (deterministic): below-ladder content can never insta-own the class
 *     above; even a dedicated same-recruit chase needs 3+ full hard clears.
 *  2. PACING BANDS (seeded Monte-Carlo): a targeted favorite lands inside the
 *     designed excitement window per (ladder, difficulty) cell, so a rebalance that
 *     re-opens the collapse (or walls the chase off) fails here.
 */

const RECRUIT_NODES_PER_RUN = 6;
const FULL_RUN_FAVOR_BASE = 45;
const LOSS_RUN_FAVOR_BASE = 40; // no championship bonus
const RUN_CAP = 60;

/** Modeled coin income per run outcome (see docs/player-gacha.md, difficulty coinMul). */
const CLEAR_INCOME: Record<Difficulty, number> = {
  easy: 950,
  medium: 1300,
  hard: 1850,
  insane: 2600,
};
const LOSS_INCOME = 250;
/** Share of income the chaser spends on their pinned machine (rest goes to upgrades). */
const CHASE_SPEND = 0.65;

interface ChaseCell {
  ladder: LadderClass;
  difficulty: Difficulty;
  targetClass: PlayerClass & ('A' | 'S');
  clearRate: number;
}

/** A home roster with every machine unlocked (the chase, not the gate, is under test). */
function chaseHome(seed: string): HomeRoster {
  const home = createRookieRoster(createRNG(seed));
  return {
    ...home,
    coins: 0,
    ladderProgress: { easy: 'S+', medium: null, hard: null, insane: null },
  };
}

/** Runs until the pinned target is owned (RUN_CAP when the chase never lands). */
function runsToOwnTarget(cell: ChaseCell, trial: number): number {
  const seed = `pace-${cell.ladder}-${cell.difficulty}-${cell.targetClass}-${trial}`;
  let home = chaseHome(seed);
  const pool = poolByClass(cell.targetClass);
  const target = realPlayerToRosterPlayer(pool[trial % Math.min(pool.length, 30)]);
  const key = playerKey(target);
  const tier = tierForClass(cell.targetClass) as PlayerGachaTier;
  home = pinScoutTarget(home, tier, key);
  const cost = PLAYER_MACHINES[tier].cost;

  for (let run = 1; run <= RUN_CAP; run++) {
    const rng = createRNG(deriveSeed(seed, `run-${run}`));
    // Recruit nodes: the real offer generator, with the home favor ledger driving
    // the re-offer bias. The chaser accepts their target the moment it appears.
    const ownedNames = new Set(home.players.map((p) => p.player.name));
    let joinNode: number | null = null;
    for (let node = 0; node < RECRUIT_NODES_PER_RUN; node++) {
      const offers = generateRecruitOffers(
        cell.ladder,
        cell.difficulty,
        0,
        3,
        createRNG(deriveSeed(seed, `run-${run}-node-${node}`)),
        ownedNames,
        home.favor ?? {}
      );
      if (offers.some((o) => o.player.name === target.player.name)) {
        joinNode = node;
        break;
      }
    }
    const cleared = rng.chance(cell.clearRate);
    const bossWins = cleared ? 7 : rng.int(0, 5);
    const joined = joinNode != null && (cleared || joinNode <= bossWins);
    const favorBase = !joined
      ? 0
      : cleared
        ? Math.round((FULL_RUN_FAVOR_BASE * (RECRUIT_NODES_PER_RUN - joinNode!)) / RECRUIT_NODES_PER_RUN)
        : Math.round((LOSS_RUN_FAVOR_BASE * Math.max(0, bossWins - joinNode!)) / 7);
    const runRoster: Roster = {
      starters: home.players.slice(0, 5),
      bench: joined ? [target] : [],
    };
    home = mergeRunGainsIntoHome(home, runRoster, {
      champion: cleared,
      clearedClass: cleared ? cell.ladder : undefined,
      playedDifficulty: cell.difficulty,
      ladderClass: cell.ladder,
      bossWins,
      runFavor: favorBase > 0 ? { [key]: favorBase } : {},
    });
    // The settled ledger never holds a whole un-converted copy for a convertible class.
    const banked = home.favor[key] ?? 0;
    expect(banked).toBeLessThan(FAVOR_PER_COPY[cell.targetClass]);

    // Bank the run's modeled income and spend the chase share on pinned pulls.
    const income = cleared ? CLEAR_INCOME[cell.difficulty] : LOSS_INCOME;
    home = { ...home, coins: home.coins + Math.round(income * CHASE_SPEND) };
    while (home.coins >= cost && !home.players.some((p) => playerKey(p) === key)) {
      const pulled = applyPlayerPull(
        home,
        tier,
        createRNG(deriveSeed(seed, `pull-${run}-${home.coins}`))
      );
      home = pulled.home;
    }
    if (home.players.some((p) => playerKey(p) === key)) return run;
  }
  return RUN_CAP;
}

function medianRunsToOwn(cell: ChaseCell, trials: number): number {
  const results = Array.from({ length: trials }, (_, t) => runsToOwnTarget(cell, t)).sort(
    (a, b) => a - b
  );
  return results[Math.floor(results.length / 2)];
}

describe('leak guard: below-ladder content never insta-owns the class above', () => {
  it('ten forced B-hard clears with DISTINCT A reach-up recruits own zero A players', () => {
    // The original collapse: 13% reach-up x the x3 hard multiplier made every new A
    // reach-up recruit instantly owned. Post-fix each deposits one capped copy and
    // half-damped favor (34 < 40), so ten clears leave ten 1/4 chases and no owns.
    let home = chaseHome('leak-distinct');
    const aPool = poolByClass('A');
    for (let run = 0; run < 10; run++) {
      const recruit = realPlayerToRosterPlayer(aPool[run]);
      const runRoster: Roster = { starters: home.players.slice(0, 5), bench: [recruit] };
      home = mergeRunGainsIntoHome(home, runRoster, {
        champion: true,
        clearedClass: 'B',
        playedDifficulty: 'hard',
        ladderClass: 'B',
        bossWins: 7,
        runFavor: { [playerKey(recruit)]: FULL_RUN_FAVOR_BASE }, // fielded map one on
      });
      const ownedA = home.players.filter((p) => p.originalClass === 'A').length;
      expect(ownedA).toBe(0);
    }
  });

  it('a dedicated same-recruit chase on B-hard needs at least three full clears', () => {
    let home = chaseHome('leak-same');
    const recruit = realPlayerToRosterPlayer(poolByClass('A')[0]);
    const key = playerKey(recruit);
    const ownedAt: number[] = [];
    for (let run = 1; run <= 5; run++) {
      const runRoster: Roster = { starters: home.players.slice(0, 5), bench: [recruit] };
      home = mergeRunGainsIntoHome(home, runRoster, {
        champion: true,
        clearedClass: 'B',
        playedDifficulty: 'hard',
        ladderClass: 'B',
        bossWins: 7,
        runFavor: { [key]: FULL_RUN_FAVOR_BASE },
      });
      if (home.players.some((p) => playerKey(p) === key)) ownedAt.push(run);
    }
    expect(ownedAt[0] ?? Infinity).toBeGreaterThanOrEqual(3);
  });

  it('a milestone suicide on B-hard never banks the reach-up A', () => {
    let home = chaseHome('leak-milestone');
    const recruit = realPlayerToRosterPlayer(poolByClass('A')[1]);
    const runRoster: Roster = { starters: home.players.slice(0, 5), bench: [recruit] };
    home = mergeRunGainsIntoHome(home, runRoster, {
      playedDifficulty: 'hard',
      ladderClass: 'B',
      bossWins: 6, // deep loss, past the milestone
    });
    expect(home.collecting.some((c) => playerKey(c.player) === playerKey(recruit))).toBe(false);
  });

  it('the earned exception stands: an at-class A fielded from map one signs on an A-hard clear', () => {
    // x3 deposit + a full run's favor (67 -> one copy) crosses the 4-copy threshold:
    // the buzzer-beater signing is EARNED at-class on hard, never leaked from below.
    let home = chaseHome('earned');
    const recruit = realPlayerToRosterPlayer(poolByClass('A')[2]);
    const runRoster: Roster = { starters: home.players.slice(0, 5), bench: [recruit] };
    home = mergeRunGainsIntoHome(home, runRoster, {
      champion: true,
      clearedClass: 'A',
      playedDifficulty: 'hard',
      ladderClass: 'A',
      bossWins: 7,
      runFavor: { [playerKey(recruit)]: FULL_RUN_FAVOR_BASE },
    });
    expect(home.players.some((p) => playerKey(p) === playerKey(recruit))).toBe(true);
  });
});

describe('pacing bands: a targeted favorite lands inside the excitement window', () => {
  // Trials are fully seeded, so the medians are exact and the bands guard regressions
  // rather than absorb noise. Bands are the design targets with modeling slack.
  const TRIALS = 21;

  it('a specific A via A-ladder medium resolves in roughly 3-9 dedicated runs', () => {
    const median = medianRunsToOwn(
      { ladder: 'A', difficulty: 'medium', targetClass: 'A', clearRate: 0.55 },
      TRIALS
    );
    expect(median).toBeGreaterThanOrEqual(3);
    expect(median).toBeLessThanOrEqual(9);
  });

  it('a specific A via B-hard farming resolves in roughly 3-9 runs, never instantly', () => {
    const median = medianRunsToOwn(
      { ladder: 'B', difficulty: 'hard', targetClass: 'A', clearRate: 0.45 },
      TRIALS
    );
    expect(median).toBeGreaterThanOrEqual(3);
    expect(median).toBeLessThanOrEqual(9);
  });

  it('a specific S via S-medium is the long chase: roughly 8-24 runs', () => {
    const median = medianRunsToOwn(
      { ladder: 'S', difficulty: 'medium', targetClass: 'S', clearRate: 0.3 },
      TRIALS
    );
    expect(median).toBeGreaterThanOrEqual(8);
    expect(median).toBeLessThanOrEqual(24);
  });

  it('a specific S via S-hard compresses for the strong: roughly 4-14 runs', () => {
    const median = medianRunsToOwn(
      { ladder: 'S', difficulty: 'hard', targetClass: 'S', clearRate: 0.4 },
      TRIALS
    );
    expect(median).toBeGreaterThanOrEqual(4);
    expect(median).toBeLessThanOrEqual(14);
  });

  it('the difficulty gradient holds: hard resolves an S chase no slower than medium', () => {
    const hard = medianRunsToOwn(
      { ladder: 'S', difficulty: 'hard', targetClass: 'S', clearRate: 0.4 },
      TRIALS
    );
    const medium = medianRunsToOwn(
      { ladder: 'S', difficulty: 'medium', targetClass: 'S', clearRate: 0.3 },
      TRIALS
    );
    expect(hard).toBeLessThanOrEqual(medium);
  });
});

describe('threshold sanity (the constants the sim leans on)', () => {
  it('A ownership sits above the hard multiplier; S above insane', () => {
    expect(COPIES_TO_OWN.A).toBeGreaterThan(3);
    expect(COPIES_TO_OWN.S).toBeGreaterThan(4);
    expect(copiesToOwn('A')).toBe(COPIES_TO_OWN.A);
  });
});
