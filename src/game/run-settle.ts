import {
  claimRunBounty,
  mergeRunGainsIntoHome,
  previewRunAcquisitions,
  settleDailyRewards,
  type AcquisitionDelta,
  type BountyGrant,
  type DailyGrants,
  type FavorDelta,
  type HomeRoster,
  type SignatureDelta,
} from './home-roster';
import { coachesWonByClear } from './coaches';
import { buildHallOfFameEntry } from './hall-of-fame';
import { dayKey, weekKey } from './daily';
import { createRNG, deriveSeed } from './rng';
import type { RunModel } from './run-machine';

/**
 * The terminal settle of a finished run into the home roster, extracted from
 * useRun's summary effect into a pure function so it can (a) run OFF the frame that
 * commits the champion celebration (the settle is O(collection): acquisitions
 * preview, bounty gacha, daily grants, and the full merge) and (b) be pinned by a
 * characterization test as output-identical to the old inline code. No React and no
 * clock (`now` injected), so it unit-tests headless like run-machine.ts.
 *
 * Determinism is load-bearing: both RNG labels ('bounty', 'daily') derive from the
 * run seed, and every preview/grant runs against the PRE-merge home, so a
 * crash-resumed settle reproduces the exact same grants (guarded by settledRunId).
 */

export interface RunSettleResult {
  /** The fully settled home roster (coins folded, gains merged, settledRunId stamped). */
  home: HomeRoster;
  /** The coach ids this championship won, for the unlock reveal beat. */
  wonCoachIds: string[];
  /** Players this settle unlocked vs progressed, for the scouted reveal + strips. */
  acquisitions: AcquisitionDelta;
  /** The favor this settle banked/converted, for the summary strip. */
  favorDelta: FavorDelta[];
  /** Signature Card movement (marks stamped, legends signed), for the reveal. */
  signatureDelta: SignatureDelta[];
  /** The one-time Championship Bounty this first-clear granted (null otherwise). */
  bounty: BountyGrant | null;
  /** Daily Layer grants this settle paid. */
  daily: DailyGrants | null;
}

/** Settle `model` (a summary-phase run) into `home` in a single computed write. */
export function settleRunIntoHome(home: HomeRoster, model: RunModel, now: number): RunSettleResult {
  const runId = String(model.core.seed);
  const champion = model.phase.kind === 'summary' && model.phase.champion;

  // Coins as-earned: bank the delta since this run last banked, folded into the same
  // atomic write as the settle. Self-correcting (earned - already-banked), so it
  // lands exactly once even across resumes/crashes.
  const earned = model.core.rewards.coins;
  const priorBanked = home.lastBankedRunId === runId ? (home.lastBankedCoins ?? 0) : 0;
  const coinDelta = Math.max(0, earned - priorBanked);
  let next = home;
  if (coinDelta > 0) {
    next = { ...next, coins: next.coins + coinDelta, lastBankedRunId: runId, lastBankedCoins: earned };
  }

  // The coach(es) this championship wins, captured against the PRE-merge owned set
  // (the merge below grants them, so the diff would be empty afterward).
  const wonCoachIds = champion
    ? coachesWonByClear(
        next.ladderProgress,
        model.difficulty,
        model.ladderClass,
        new Set(next.ownedCoaches)
      )
    : [];
  // The players this settle unlocks/progresses (a milestone-banked loss included)
  // and its favor movement, captured against the PRE-merge collection (the merge
  // below deposits them), for the scouted-player reveal + the summary strips.
  const preview = previewRunAcquisitions(next, model.core.roster, {
    champion,
    playedDifficulty: model.difficulty,
    bossWins: model.core.currentMapIndex,
    ladderClass: model.ladderClass,
    runFavor: model.favor ?? {},
    runLegacy: model.legacy ?? {},
    // Raw (no ?? fallback): an absent ledger IS the legacy-valve signal.
    signatureProgress: model.signatureProgress,
  });
  // A championship banks a Hall of Fame snapshot of the final game. `now` is injected
  // by the hook, keeping the merge and the entry builder clock-free.
  const championEntry =
    champion && model.game
      ? buildHallOfFameEntry(model.game, model.difficulty, model.ladderClass, model.wins, now)
      : undefined;
  // Grant this cell's one-time bounty against the PRE-merge home (its clearedCells set
  // does not hold this cell yet, which the cell-exact first-clear test reads). Seeded off
  // the run so a resumed settle reproduces the same grant; the merge spreads the granted
  // home.
  const { home: withBounty, granted: bounty } = claimRunBounty(
    next,
    model.difficulty,
    model.ladderClass,
    champion,
    createRNG(deriveSeed(model.core.seed, 'bounty'))
  );
  // The Daily Layer settle: weekly wins bank on EVERY settle (losses included);
  // the first-win purse and Spotlight bounty are champion-gated inside. Runs
  // against the pre-merge home (its clearedCells derived the spotlight the hub
  // showed) with its own rng label, so a crash-resumed settle reproduces the
  // exact grants. The stamps land in the same atomic write as everything else.
  const { home: withDaily, granted: daily } = settleDailyRewards(withBounty, {
    runCell: { difficulty: model.difficulty, ladderClass: model.ladderClass },
    today: dayKey(now),
    week: weekKey(now),
    champion,
    wins: model.wins,
    rng: createRNG(deriveSeed(model.core.seed, 'daily')),
  });
  const settled = {
    ...mergeRunGainsIntoHome(withDaily, model.core.roster, {
      rewards: model.core.rewards,
      legendOffered: model.legend.offeredThisRun,
      champion,
      clearedClass: model.ladderClass,
      playedDifficulty: model.difficulty,
      championEntry,
      bossWins: model.core.currentMapIndex,
      ladderClass: model.ladderClass,
      runFavor: model.favor ?? {},
      runLegacy: model.legacy ?? {},
      // Raw (no ?? fallback): an absent ledger IS the legacy-valve signal.
      signatureProgress: model.signatureProgress,
    }),
    settledRunId: runId,
  };

  return {
    home: settled,
    wonCoachIds,
    acquisitions: { unlocked: preview.unlocked, progressed: preview.progressed },
    favorDelta: preview.favorDelta,
    signatureDelta: preview.signatureDelta,
    bounty,
    daily,
  };
}
