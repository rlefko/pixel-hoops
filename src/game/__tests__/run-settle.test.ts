import { describe, it, expect } from 'vitest';
import { settleRunIntoHome } from '@/game/run-settle';
import {
  claimRunBounty,
  createRookieRoster,
  previewRunAcquisitions,
  settleDailyRewards,
  type HomeRoster,
} from '@/game/home-roster';
import { coachesWonByClear } from '@/game/coaches';
import { dayKey, weekKey } from '@/game/daily';
import { createRNG, deriveSeed } from '@/game/rng';
import { initRun, runReducer, type RunModel } from '@/game/run-machine';

/**
 * Characterization tests: settleRunIntoHome was extracted verbatim from useRun's
 * inline summary effect so the champion settle can run off the celebration's commit
 * frame. These pin that the extraction still composes the SAME underlying functions
 * in the SAME pre-merge order with the SAME seeded RNG labels, and that a settle is
 * deterministic (a crash-resumed re-settle reproduces the exact grants).
 */

function rookie(seed = 'settle-home'): HomeRoster {
  return createRookieRoster(createRNG(seed));
}

/** A run driven to a real simulated game, then forced onto a summary phase. */
function summaryModel(champion: boolean, seed = 'settle-run'): RunModel {
  let m = initRun(seed, rookie(seed));
  if (m.phase.kind === 'draft') {
    m = runReducer(m, {
      type: 'confirmDraft',
      starters: m.phase.defaultStarters,
      bench: m.phase.defaultBench,
    })!;
  }
  m = runReducer(m, { type: 'skipBoostDraft' })!;
  const nodeId = m.core.map.bossNodeId;
  m = runReducer({ ...m, phase: { kind: 'pregame', nodeId } }, { type: 'enterGame' })!;
  return {
    ...m,
    wins: champion ? 12 : 4,
    favor: { [`${m.core.roster.starters[0].player.name}|${m.core.roster.starters[0].position}`]: 9 },
    core: { ...m.core, rewards: { coins: 340, reputation: 6, trainingPoints: 2 } },
    phase: { kind: 'summary', champion },
  };
}

const NOW = 1735689600000; // fixed clock: the settle is clock-free by injection

describe('settleRunIntoHome', () => {
  it('is deterministic: the same inputs settle to deep-equal outputs', () => {
    const home = rookie();
    const model = summaryModel(true);
    expect(settleRunIntoHome(home, model, NOW)).toEqual(settleRunIntoHome(home, model, NOW));
  });

  it('a champion settle stamps the run, folds coins, and banks the Hall of Fame entry', () => {
    const home = rookie();
    const model = summaryModel(true);
    const { home: settled } = settleRunIntoHome(home, model, NOW);
    expect(settled.settledRunId).toBe(String(model.core.seed));
    // The as-earned delta folds into the wallet (bounty/favor/daily grants may add
    // more on top; the exact-delta pin lives in the priorBanked test below).
    expect(settled.coins).toBeGreaterThanOrEqual(home.coins + model.core.rewards.coins);
    expect(settled.lastBankedRunId).toBe(String(model.core.seed));
    expect(settled.lastBankedCoins).toBe(model.core.rewards.coins);
    // The championship's final game lands in the Hall of Fame with the injected clock.
    expect(settled.hallOfFame?.length ?? 0).toBe((home.hallOfFame?.length ?? 0) + 1);
    expect(settled.hallOfFame?.[0]?.ts).toBe(NOW);
  });

  it('composes the same pre-merge captures the inline effect used', () => {
    const home = rookie();
    const model = summaryModel(true);
    const result = settleRunIntoHome(home, model, NOW);
    // Reproduce the pre-merge pipeline with the original functions and the original
    // order (coins -> coaches -> preview -> bounty -> daily), then compare captures.
    const withCoins = {
      ...home,
      coins: home.coins + model.core.rewards.coins,
      lastBankedRunId: String(model.core.seed),
      lastBankedCoins: model.core.rewards.coins,
    };
    expect(result.wonCoachIds).toEqual(
      coachesWonByClear(
        withCoins.ladderProgress,
        model.difficulty,
        model.ladderClass,
        new Set(withCoins.ownedCoaches)
      )
    );
    const preview = previewRunAcquisitions(withCoins, model.core.roster, {
      champion: true,
      playedDifficulty: model.difficulty,
      bossWins: model.core.currentMapIndex,
      ladderClass: model.ladderClass,
      runFavor: model.favor ?? {},
    });
    expect(result.acquisitions).toEqual({
      unlocked: preview.unlocked,
      progressed: preview.progressed,
    });
    expect(result.favorDelta).toEqual(preview.favorDelta);
    const { home: withBounty, granted: bounty } = claimRunBounty(
      withCoins,
      model.difficulty,
      model.ladderClass,
      true,
      createRNG(deriveSeed(model.core.seed, 'bounty'))
    );
    expect(result.bounty).toEqual(bounty);
    const { granted: daily } = settleDailyRewards(withBounty, {
      runCell: { difficulty: model.difficulty, ladderClass: model.ladderClass },
      today: dayKey(NOW),
      week: weekKey(NOW),
      champion: true,
      wins: model.wins,
      rng: createRNG(deriveSeed(model.core.seed, 'daily')),
    });
    expect(result.daily).toEqual(daily);
  });

  it('a loss settle banks coins and milestones but never coaches, bounty, or the HoF', () => {
    const home = rookie();
    const model = summaryModel(false);
    const result = settleRunIntoHome(home, model, NOW);
    expect(result.wonCoachIds).toEqual([]);
    expect(result.bounty).toBeNull();
    expect(result.home.hallOfFame?.length ?? 0).toBe(home.hallOfFame?.length ?? 0);
    expect(result.home.settledRunId).toBe(String(model.core.seed));
    expect(result.home.coins).toBeGreaterThanOrEqual(home.coins + model.core.rewards.coins);
  });

  it('folds only the unbanked coin delta when the run already banked as-earned', () => {
    const model = summaryModel(true);
    const fresh = rookie();
    const preBanked = {
      ...fresh,
      lastBankedRunId: String(model.core.seed),
      lastBankedCoins: 300, // 300 of the 340 already landed mid-run
    };
    // Same seeded grants either way, so the two settles differ by exactly the 300
    // already-banked coins: the delta logic, isolated from favor/bounty/daily coins.
    const fromFresh = settleRunIntoHome(fresh, model, NOW).home;
    const fromPreBanked = settleRunIntoHome(preBanked, model, NOW).home;
    expect(fromFresh.coins - fromPreBanked.coins).toBe(300);
    expect(fromPreBanked.lastBankedCoins).toBe(340);
  });
});
