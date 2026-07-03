import { useCallback, useReducer, useEffect, useMemo, useRef } from 'react';
import { InteractionManager } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { runReducer, computeCoachRec, computeGameSim, gameSimKey } from '@/game/run-machine';
import { withSlowActionWarning } from '@/game/dev-timing';
import {
  collectingCopyMap,
  playerKey,
  rememberDraftRotation,
  selectCoach,
  type AcquisitionDelta,
  type BountyGrant,
  type DailyGrants,
  type FavorDelta,
  type HomeRoster,
} from '@/game/home-roster';
import { settleRunIntoHome, type RunSettleResult } from '@/game/run-settle';
import type { Difficulty } from '@/game/difficulty-mode';
import { copiesToOwn } from '@/game/collection';
import { playerDraftClass } from '@/game/draft';
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
  // The landed settle's outputs, memoized per run so a deferred champion settle and
  // the tap-time ensureSettled fallback can never both bank (idempotence on top of
  // the persisted settledRunId guard). `scheduled` keeps the deferral once-per-run.
  const settledRef = useRef<{ runId: string; outputs: RunSettleResult } | null>(null);
  const settleScheduledRef = useRef<string | null>(null);
  // Live snapshots for tap-time handlers (ensureSettled), so their identity never
  // churns on model/homeRoster changes.
  const modelRef = useRef(model);
  modelRef.current = model;
  const homeRosterRef = useRef(homeRoster);
  homeRosterRef.current = homeRoster;

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

  // Precompute the game sim during the pregame idle, so the TIP OFF tap's enterGame
  // is an O(1) phase flip instead of the app's largest synchronous JS block. Gated on
  // the coach scout having resolved: the banner is the player-visible beat (it must
  // win the idle queue), and its accept/edit window is where the roster churns, so
  // waiting also keeps normal play at exactly one sim per pregame instead of
  // rescheduling on every lineup fiddle. The reducer re-derives the key at land time
  // (setGameSim) and at consumption (enterGame), so a stale sim is dropped and a tap
  // that outraces this task simply pays today's sync sim.
  useEffect(() => {
    if (!model || model.phase.kind !== 'pregame' || model.phase.coachRec === undefined) return;
    const { nodeId } = model.phase;
    const key = gameSimKey(model, nodeId);
    if (model.phase.pendingGame?.key === key) return;
    const task = InteractionManager.runAfterInteractions(() => {
      dispatch({ type: 'setGameSim', nodeId, key, game: computeGameSim(model, nodeId) });
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

  // Land a computed settle exactly once: publish the reveal-beat refs, write the
  // settled home, and only THEN drop the saved slot (never before the settle write is
  // queued, so a crash can never clear the slot with the rewards unbanked; a
  // resumed-then-resettled run is a no-op via settledRunId + the coin ledger).
  const landSettle = useCallback(
    (runId: string, outputs: RunSettleResult) => {
      if (settledRef.current?.runId === runId) return;
      settledRef.current = { runId, outputs };
      wonCoachRef.current = outputs.wonCoachIds;
      wonPlayersRef.current = outputs.acquisitions;
      favorDeltaRef.current = outputs.favorDelta;
      bountyGrantRef.current = outputs.bounty;
      dailyGrantsRef.current = outputs.daily;
      saveHomeRoster(outputs.home);
      clearActiveRun();
    },
    [saveHomeRoster, clearActiveRun]
  );

  // The tap-time settle guarantee for the summary's exit handlers: returns the landed
  // outputs, computing and landing them synchronously if the deferred task has not
  // run yet, so reveal routing and the next run's baseline always read settled data
  // (never a render-baked snapshot). Null outside a summary.
  const ensureSettled = useCallback((): RunSettleResult | null => {
    const m = modelRef.current;
    const home = homeRosterRef.current;
    if (!m || !home || m.phase.kind !== 'summary') return null;
    const runId = String(m.core.seed);
    if (settledRef.current?.runId === runId) return settledRef.current.outputs;
    if (home.settledRunId === runId) return null; // already settled in a prior hook life
    const outputs = settleRunIntoHome(home, m, Date.now());
    landSettle(runId, outputs);
    return outputs;
  }, [landSettle]);

  // Bank the run into the home roster in a single write:
  //  (a) coins as-earned: bank the delta since this run last banked. The delta self-corrects
  //      (earned - already-banked), so it lands exactly once even across resumes/crashes.
  //  (b) terminal settle at the summary (guarded by settledRunId): fold in recruits/
  //      ladder/coaches/Hall of Fame/reputation once, then clear the saved slot. A
  //      champion settle is O(collection) and its summary commits behind the held
  //      tip-off ceremony cover, so it runs one InteractionManager task later instead
  //      of on the frame that mounts the celebration; a loss summary arrives from a
  //      plain coverless tap whose strips mount with the settle's data, so it settles
  //      inline exactly as before. ensureSettled() above closes the only tap-timing
  //      window the deferral opens.
  useEffect(() => {
    if (!model || !homeRoster) return;
    const runId = String(model.core.seed);
    const isSummary = model.phase.kind === 'summary';
    const champion = model.phase.kind === 'summary' ? model.phase.champion : false;
    // Don't let a prior championship's won-coach reveal leak into a later run.
    if (!isSummary) {
      wonCoachRef.current = [];
      wonPlayersRef.current = { unlocked: [], progressed: [] };
      bountyGrantRef.current = null;
      dailyGrantsRef.current = null;
      favorDeltaRef.current = [];
      if (settleScheduledRef.current !== runId) settleScheduledRef.current = null;
      if (settledRef.current && settledRef.current.runId !== runId) settledRef.current = null;
    }

    const needsSettle =
      isSummary && homeRoster.settledRunId !== runId && settledRef.current?.runId !== runId;
    if (needsSettle) {
      if (champion) {
        if (settleScheduledRef.current === runId) return;
        settleScheduledRef.current = runId;
        // No cleanup-cancel: leaving the summary fast must never skip a settle.
        // ensureSettled carries every idempotence guard (live refs, still-a-summary,
        // settledRef, persisted settledRunId), so a late task is a no-op when a tap
        // already landed it, and a model that left this run's summary settles nothing.
        InteractionManager.runAfterInteractions(() => void ensureSettled());
      } else {
        landSettle(runId, settleRunIntoHome(homeRoster, model, Date.now()));
      }
      return;
    }

    // Mid-run (or an already-settled summary): bank any as-earned coin delta.
    const earned = model.core.rewards.coins;
    const priorBanked =
      homeRoster.lastBankedRunId === runId ? (homeRoster.lastBankedCoins ?? 0) : 0;
    const coinDelta = Math.max(0, earned - priorBanked);
    if (coinDelta === 0) return;
    saveHomeRoster({
      ...homeRoster,
      coins: homeRoster.coins + coinDelta,
      lastBankedRunId: runId,
      lastBankedCoins: earned,
    });
  }, [model, homeRoster, saveHomeRoster, landSettle, ensureSettled]);

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
      skipToResult: () => dispatch({ type: 'skipToResult' }),
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

  // The home roster a new run must build from: the live context snapshot once it
  // reflects this run's settle (it may also carry later edits, like an equip from the
  // coach reveal), otherwise the settle's own output via ensureSettled, so a fast
  // "New Run" tap can never race the deferred settle and draft from pre-settle data.
  const settledHomeBase = useCallback((): HomeRoster | null => {
    const home = homeRosterRef.current;
    const m = modelRef.current;
    if (!home) return null;
    if (!m || m.phase.kind !== 'summary') return home;
    if (home.settledRunId === String(m.core.seed)) return home;
    return ensureSettled()?.home ?? home;
  }, [ensureSettled]);

  // Home-roster actions carry their live snapshot, so only these re-memoize on saves.
  const homeActions = useMemo(
    () => ({
      // Equip a newly-won coach for the next run (a home mutation, not a run action),
      // straight from the unlock reveal so it feeds the next run.
      equipCoach: (id: string) => homeRoster && saveHomeRoster(selectCoach(homeRoster, id)),
      // The tap-time settle guarantee for the summary exits (see ensureSettled above).
      ensureSettled,
      // Start a fresh run from the summary. The finished run settles first (ensured),
      // so drop its saved slot before the new run's first auto-save takes it over.
      newRun: () => {
        const base = settledHomeBase();
        if (!base) return;
        clearActiveRun();
        dispatch({ type: 'newRun', seed: `run-${Date.now()}`, homeRoster: base });
      },
      // The victory step-up: run it back one difficulty up, from the win screen (the
      // confidence peak). Saves the selection AND starts the run from the same updated
      // roster object, so the new run can never race the context write.
      stepUpRun: (difficulty: Difficulty) => {
        const base = settledHomeBase();
        if (!base) return;
        const next = { ...base, selectedDifficulty: difficulty };
        saveHomeRoster(next);
        clearActiveRun();
        dispatch({ type: 'newRun', seed: `run-${Date.now()}`, homeRoster: next });
      },
    }),
    [homeRoster, saveHomeRoster, clearActiveRun, ensureSettled, settledHomeBase]
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
