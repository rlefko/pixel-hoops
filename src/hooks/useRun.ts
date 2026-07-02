import { useReducer, useEffect, useMemo, useRef } from 'react';
import { InteractionManager } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { runReducer, computeCoachRec } from '@/game/run-machine';
import { withSlowActionWarning } from '@/game/dev-timing';
import {
  mergeRunGainsIntoHome,
  previewRunAcquisitions,
  claimRunBounty,
  collectingCopyMap,
  playerKey,
  rememberDraftRotation,
  selectCoach,
  settleDailyRewards,
  type AcquisitionDelta,
  type BountyGrant,
  type DailyGrants,
  type FavorDelta,
} from '@/game/home-roster';
import { dayKey, weekKey } from '@/game/daily';
import { createRNG, deriveSeed } from '@/game/rng';
import type { Difficulty } from '@/game/difficulty-mode';
import { copiesToOwn } from '@/game/collection';
import { playerDraftClass } from '@/game/draft';
import { coachesWonByClear } from '@/game/coaches';
import { buildHallOfFameEntry } from '@/game/hall-of-fame';
import { useHomeRoster } from '@/context/HomeRosterContext';
import { useActiveRun } from '@/context/ActiveRunContext';
import type { RosterPlayer } from '@/types/roster';
import type { PlayerStats } from '@/types/player';
import type { BoostOffer } from '@/game/boosts';

/** A recruit offer's collection status: already OWNED (recruiting it is wasted), or a
 * multi-copy player still being collected (show its copies meter). Common players that own
 * on the first copy return undefined (no meter). */
export type RecruitCollectStatus =
  | { kind: 'owned' }
  | { kind: 'collecting'; copies: number; threshold: number };

// Reducer actions run synchronously inside dispatch, so a slow one blocks the tap that
// fired it. In dev, surface any action that overruns a frame; in release this resolves
// to the bare reducer (Metro inlines __DEV__; the typeof guard keeps node/vitest safe).
// Module scope so the reducer identity useReducer sees never changes.
const reducer = typeof __DEV__ !== 'undefined' && __DEV__ ? withSlowActionWarning(runReducer) : runReducer;

/**
 * React wrapper around the pure run machine (src/game/run-machine.ts). It:
 *  - starts a run once both stores have loaded, NEW or RESUMED per the `?mode` param;
 *  - auto-saves the run to the resumable slot so no exit can destroy it;
 *  - banks the run into the home roster: coins AS THEY ARE EARNED (so the wallet always
 *    reflects a run's gains, even after a suspend), and recruits/ladder/etc. once at the
 *    end. The ledger (`lastBankedRunId`/`lastBankedCoins`/`settledRunId`) makes every
 *    payout land exactly once across resumes and crashes (no double-gather).
 */
export function useRun() {
  const { homeRoster, loaded, saveHomeRoster } = useHomeRoster();
  const { savedRun, loaded: runLoaded, saveActiveRun, clearActiveRun } = useActiveRun();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const [model, dispatch] = useReducer(reducer, null);
  const initRef = useRef(false);
  const draftRememberedRef = useRef(false);
  // The coach ids won by this run's championship (computed BEFORE the merge, which
  // then folds them into the owned collection), surfaced in the unlock reveal beat.
  const wonCoachRef = useRef<string[]>([]);
  // The players this run's championship UNLOCKED vs PROGRESSED (computed BEFORE the merge,
  // against the pre-merge collection), surfaced in the scouted-player reveal + progress strip.
  const wonPlayersRef = useRef<AcquisitionDelta>({ unlocked: [], progressed: [] });
  // The one-time Championship Bounty this run's first-clear granted (null otherwise),
  // surfaced as the headline "harder difficulty paid off" reveal beat.
  const bountyGrantRef = useRef<BountyGrant | null>(null);
  const dailyGrantsRef = useRef<DailyGrants | null>(null);
  // The favor this run's settle banked/converted (win or lose), for the summary strip.
  const favorDeltaRef = useRef<FavorDelta[]>([]);

  // Start the run once, after both the home roster and the saved-run slot have hydrated.
  // The home screen passes `mode` 'new' or 'resume'; only 'resume' (with a saved run)
  // loads one, so a missing or unknown mode safely starts fresh. savedRun is read at init
  // only; the auto-save below keeps updating it without re-triggering this (guarded by initRef).
  useEffect(() => {
    if (initRef.current || model !== null) return;
    if (!loaded || !homeRoster || !runLoaded) return;
    initRef.current = true;
    if (mode === 'resume' && savedRun) {
      dispatch({ type: 'loadRun', model: savedRun });
    } else {
      dispatch({ type: 'newRun', seed: `run-${Date.now()}`, homeRoster });
    }
  }, [loaded, homeRoster, runLoaded, model, mode, savedRun]);

  // Auto-save the run as the latest resumable snapshot. Skip phases that must not persist:
  //  - summary: terminal; banking/clearing is handled below and a settled run is never resumable.
  //  - game/postgame: transient game playback; a force-quit resumes at the prior pregame and
  //    re-derives the identical (seeded) result, so closing the app can never dodge a loss.
  //  - draft: the not-yet-confirmed opening five. A NEW RUN does not overwrite a saved run
  //    until the draft is confirmed ("properly started"), so cancelling the draft keeps it.
  useEffect(() => {
    if (!model) return;
    const phaseKind = model.phase.kind;
    if (phaseKind === 'summary' || phaseKind === 'game' || phaseKind === 'postgame' || phaseKind === 'draft') {
      return;
    }
    saveActiveRun(model);
  }, [model, saveActiveRun]);

  // Compute the coach's pregame scout OFF the node tap: enterNode only flips the phase
  // (so the tap paints immediately), and this effect runs the lineup search after that
  // frame's interactions settle, landing it via setCoachRec. The reducer guards a late
  // result (same pregame, same node, still unresolved), and any dispatch changes
  // `model`, which cancels a pending task and re-evaluates: a stale model can never be
  // searched. undefined = not computed yet; null = resolved (accepted/edited/replay/below
  // the bar), so resolved pregames and resumed saves never recompute.
  useEffect(() => {
    if (!model || model.phase.kind !== 'pregame' || model.phase.coachRec !== undefined) return;
    const { nodeId } = model.phase;
    const task = InteractionManager.runAfterInteractions(() => {
      dispatch({ type: 'setCoachRec', nodeId, rec: computeCoachRec(model, nodeId) });
    });
    return () => task.cancel();
  }, [model]);

  // When the run leaves the draft (the player confirmed a five), remember that exact
  // drafted rotation for this run's (difficulty, ladder class), so re-entering the same
  // ladder pre-fills it. Captured here rather than at run end so it survives quitting
  // mid-run, and reflects what was drafted (mid-run recruits stay in the collection but
  // are not auto-slotted). The ref makes it a single write per run and prevents a loop.
  useEffect(() => {
    if (!model || !homeRoster) return;
    if (model.phase.kind === 'draft') {
      draftRememberedRef.current = false;
      return;
    }
    if (draftRememberedRef.current) return;
    const { starters, bench } = model.core.roster;
    if (starters.length < 5) return;
    draftRememberedRef.current = true;
    const rotation = [...starters.map(playerKey), ...bench.slice(0, 3).map(playerKey)];
    saveHomeRoster(
      rememberDraftRotation(homeRoster, model.difficulty, model.ladderClass, rotation)
    );
  }, [model, homeRoster, saveHomeRoster]);

  // Bank the run into the home roster in a single write:
  //  (a) coins as-earned: bank the delta since this run last banked. The delta self-corrects
  //      (earned - already-banked), so it lands exactly once even across resumes/crashes.
  //  (b) terminal settle at the summary: fold in recruits/ladder/coaches/Hall of Fame/
  //      reputation once (guarded by settledRunId), then clear the saved slot.
  useEffect(() => {
    if (!model || !homeRoster) return;
    const runId = String(model.core.seed);
    const isSummary = model.phase.kind === 'summary';
    // Narrow on the discriminant directly: the compiler does not track `isSummary` back
    // to model.phase here.
    const champion = model.phase.kind === 'summary' ? model.phase.champion : false;
    // Don't let a prior championship's won-coach reveal leak into a later run.
    if (!isSummary) {
      wonCoachRef.current = [];
      wonPlayersRef.current = { unlocked: [], progressed: [] };
      bountyGrantRef.current = null;
      dailyGrantsRef.current = null;
      favorDeltaRef.current = [];
    }

    const earned = model.core.rewards.coins;
    const priorBanked =
      homeRoster.lastBankedRunId === runId ? (homeRoster.lastBankedCoins ?? 0) : 0;
    const coinDelta = Math.max(0, earned - priorBanked);
    const needsSettle = isSummary && homeRoster.settledRunId !== runId;
    if (coinDelta === 0 && !needsSettle) return;

    let next = homeRoster;
    if (coinDelta > 0) {
      next = { ...next, coins: next.coins + coinDelta, lastBankedRunId: runId, lastBankedCoins: earned };
    }
    if (needsSettle) {
      // The coach(es) this championship wins, captured against the PRE-merge owned set
      // (the merge below grants them, so the diff would be empty afterward).
      wonCoachRef.current = champion
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
      });
      wonPlayersRef.current = { unlocked: preview.unlocked, progressed: preview.progressed };
      favorDeltaRef.current = preview.favorDelta;
      // A championship banks a Hall of Fame snapshot of the final game. Date.now() lives
      // here (the hook), keeping the merge and the entry builder clock-free.
      const now = Date.now();
      const championEntry =
        champion && model.game
          ? buildHallOfFameEntry(model.game, model.difficulty, model.ladderClass, model.wins, now)
          : undefined;
      // Grant this cell's one-time bounty against the PRE-merge home (its clearedCells set
      // does not hold this cell yet, which the cell-exact first-clear test reads). Seeded off
      // the run so a resumed settle reproduces the same grant; the merge spreads the granted
      // home.
      const { home: withBounty, granted: bountyGrant } = claimRunBounty(
        next,
        model.difficulty,
        model.ladderClass,
        champion,
        createRNG(deriveSeed(model.core.seed, 'bounty'))
      );
      bountyGrantRef.current = bountyGrant;
      // The Daily Layer settle: weekly wins bank on EVERY settle (losses included);
      // the first-win purse and Spotlight bounty are champion-gated inside. Runs
      // against the pre-merge home (its clearedCells derived the spotlight the hub
      // showed) with its own rng label, so a crash-resumed settle reproduces the
      // exact grants. The stamps land in the same atomic write as everything else.
      const { home: withDaily, granted: dailyGrants } = settleDailyRewards(withBounty, {
        runCell: { difficulty: model.difficulty, ladderClass: model.ladderClass },
        today: dayKey(now),
        week: weekKey(now),
        champion,
        wins: model.wins,
        rng: createRNG(deriveSeed(model.core.seed, 'daily')),
      });
      dailyGrantsRef.current = dailyGrants;
      next = {
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
        }),
        settledRunId: runId,
      };
    }
    saveHomeRoster(next);
    // Best-effort: the saved slot is dropped on settle. Correctness does not depend on this
    // landing (a resumed-then-resettled run is a no-op via settledRunId + the coin ledger).
    if (isSummary) clearActiveRun();
  }, [model, homeRoster, saveHomeRoster, clearActiveRun]);

  // Dispatch-only actions, memoized once: dispatch from useReducer is identity-stable,
  // so these callbacks never change and memoized children (the run-map tiles) keep
  // their props across win-banks and settles instead of re-rendering on every save.
  const dispatchActions = useMemo(
    () => ({
      chooseNode: (nodeId: string) => dispatch({ type: 'chooseNode', nodeId }),
      confirmDraft: (starters: RosterPlayer[], bench: RosterPlayer[]) =>
        dispatch({ type: 'confirmDraft', starters, bench }),
      dropForRecruit: (index: number) => dispatch({ type: 'dropForRecruit', index }),
      openLineupBuilder: () => dispatch({ type: 'openLineupBuilder' }),
      setLineup: (starters: RosterPlayer[], bench: RosterPlayer[]) =>
        dispatch({ type: 'setLineup', starters, bench }),
      cancelLineup: () => dispatch({ type: 'cancelLineup' }),
      acceptCoachRec: () => dispatch({ type: 'acceptCoachRec' }),
      enterGame: () => dispatch({ type: 'enterGame' }),
      finishReplay: () => dispatch({ type: 'finishReplay' }),
      resolveGameResult: () => dispatch({ type: 'resolveGameResult' }),
      recruit: (player: RosterPlayer) => dispatch({ type: 'recruit', player }),
      rerollRecruit: (index: number) => dispatch({ type: 'rerollRecruit', index }),
      trainPlayer: (index: number, stat: keyof PlayerStats) =>
        dispatch({ type: 'trainPlayer', index, stat }),
      rest: () => dispatch({ type: 'rest' }),
      draftBoost: (offer: BoostOffer) => dispatch({ type: 'draftBoost', offer }),
      dropBoostForNew: (dropIndex: number) =>
        dispatch({ type: 'dropBoostForNew', dropIndex }),
      skipBoostDraft: () => dispatch({ type: 'skipBoostDraft' }),
      banishBoost: (offer: BoostOffer) => dispatch({ type: 'banishBoost', offer }),
      takeBoostItem: (defId: string, playerIndex: number) =>
        dispatch({ type: 'takeBoostItem', defId, playerIndex }),
      leaveBoost: () => dispatch({ type: 'leaveBoost' }),
      takeDrop: (playerIndex: number) => dispatch({ type: 'takeDrop', playerIndex }),
      skipDrop: () => dispatch({ type: 'skipDrop' }),
      addToBag: (defId: string) => dispatch({ type: 'addToBag', defId }),
      openBag: () => dispatch({ type: 'openBag' }),
      leaveBag: () => dispatch({ type: 'leaveBag' }),
      equipFromBag: (bagIndex: number, playerIndex: number) =>
        dispatch({ type: 'equipFromBag', bagIndex, playerIndex }),
      unequipToBag: (playerIndex: number) => dispatch({ type: 'unequipToBag', playerIndex }),
      scoutLegend: () => dispatch({ type: 'scoutLegend' }),
      declineLegend: () => dispatch({ type: 'declineLegend' }),
      acceptLegendSign: () => dispatch({ type: 'acceptLegendSign' }),
      declineLegendSign: () => dispatch({ type: 'declineLegendSign' }),
      skipNode: () => dispatch({ type: 'skipNode' }),
      backToMap: () => dispatch({ type: 'backToMap' }),
    }),
    []
  );

  // Home-roster actions carry their live snapshot, so only these re-memoize on saves.
  const homeActions = useMemo(
    () => ({
      // Equip a newly-won coach for the next run (a home mutation, not a run action),
      // straight from the unlock reveal so it feeds the next run.
      equipCoach: (id: string) => homeRoster && saveHomeRoster(selectCoach(homeRoster, id)),
      // Start a fresh run from the summary. The finished run already settled, so drop its
      // saved slot before the new run's first auto-save takes it over.
      newRun: () => {
        if (!homeRoster) return;
        clearActiveRun();
        dispatch({ type: 'newRun', seed: `run-${Date.now()}`, homeRoster });
      },
      // The victory step-up: run it back one difficulty up, from the win screen (the
      // confidence peak). Saves the selection AND starts the run from the same updated
      // roster object, so the new run can never race the context write.
      stepUpRun: (difficulty: Difficulty) => {
        if (!homeRoster) return;
        const next = { ...homeRoster, selectedDifficulty: difficulty };
        saveHomeRoster(next);
        clearActiveRun();
        dispatch({ type: 'newRun', seed: `run-${Date.now()}`, homeRoster: next });
      },
    }),
    [homeRoster, saveHomeRoster, clearActiveRun]
  );

  const actions = useMemo(
    () => ({ ...dispatchActions, ...homeActions }),
    [dispatchActions, homeActions]
  );

  // Per-offer collection status for the recruit node + drop screen: OWNED (recruiting is
  // wasted), or an in-progress copies meter for a multi-copy player still being collected.
  // Common players (own on the first copy) show no meter. Derived from the home snapshot,
  // since recruit copies only bank at run end.
  const collectProgress = useMemo(() => {
    const owned = new Set(homeRoster ? homeRoster.players.map(playerKey) : []);
    const copies = homeRoster ? collectingCopyMap(homeRoster) : {};
    return (rp: RosterPlayer): RecruitCollectStatus | undefined => {
      const key = playerKey(rp);
      if (owned.has(key)) return { kind: 'owned' };
      const threshold = copiesToOwn(playerDraftClass(rp));
      if (threshold <= 1) return undefined;
      return { kind: 'collecting', copies: copies[key] ?? 0, threshold };
    };
  }, [homeRoster]);

  return {
    model,
    loaded: loaded && runLoaded,
    actions,
    wonCoachIds: wonCoachRef.current,
    wonPlayers: wonPlayersRef.current,
    bountyGrant: bountyGrantRef.current,
    dailyGrants: dailyGrantsRef.current,
    favorRows: favorDeltaRef.current,
    collectProgress,
    equippedCoachId: homeRoster?.selectedCoachId,
  };
}
