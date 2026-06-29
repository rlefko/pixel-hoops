import { useReducer, useEffect, useMemo, useRef } from 'react';
import { runReducer } from '@/game/run-machine';
import { mergeRunGainsIntoHome, playerKey, rememberDraftRotation } from '@/game/home-roster';
import { coachesWonByClear } from '@/game/coaches';
import { buildHallOfFameEntry } from '@/game/hall-of-fame';
import { useHomeRoster } from '@/context/HomeRosterContext';
import type { RosterPlayer } from '@/types/roster';
import type { PlayerStats } from '@/types/player';
import type { BoostOffer } from '@/game/boosts';

/**
 * React wrapper around the pure run machine (src/game/run-machine.ts). Starts a
 * run once the home roster has loaded, and on run end folds the run's gains
 * (recruits, training) back into the persistent home roster.
 */
export function useRun() {
  const { homeRoster, loaded, saveHomeRoster } = useHomeRoster();
  const [model, dispatch] = useReducer(runReducer, null);
  const savedRef = useRef(false);
  const draftRememberedRef = useRef(false);
  // The headline coach won by this run's championship (computed BEFORE the merge,
  // which then folds it into the owned collection), surfaced in the summary beat.
  const wonCoachRef = useRef<string | undefined>(undefined);

  // Start a run once the home roster has loaded from storage.
  useEffect(() => {
    if (loaded && homeRoster && model === null) {
      dispatch({ type: 'newRun', seed: `run-${Date.now()}`, homeRoster });
    }
  }, [loaded, homeRoster, model]);

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

  // When the run ends (win or loss), fold its gains back into the home roster.
  useEffect(() => {
    if (!model) return;
    if (model.phase.kind === 'summary' && !savedRef.current && homeRoster) {
      savedRef.current = true;
      // The coach(es) this championship wins, captured against the PRE-merge owned set
      // (the merge below grants them, so the diff would be empty afterward).
      wonCoachRef.current = model.phase.champion
        ? coachesWonByClear(
            homeRoster.ladderProgress,
            model.difficulty,
            model.ladderClass,
            new Set(homeRoster.ownedCoaches)
          )[0]
        : undefined;
      // A championship banks a Hall of Fame snapshot of the final game. Date.now()
      // lives here (the hook), keeping the merge and the entry builder clock-free.
      const championEntry =
        model.phase.champion && model.game
          ? buildHallOfFameEntry(
              model.game,
              model.difficulty,
              model.ladderClass,
              model.wins,
              Date.now()
            )
          : undefined;
      saveHomeRoster(
        mergeRunGainsIntoHome(
          homeRoster,
          model.core.roster,
          model.core.rewards,
          model.legend.offeredThisRun,
          model.phase.champion,
          model.ladderClass,
          model.difficulty,
          championEntry
        )
      );
    }
    if (model.phase.kind !== 'summary') {
      savedRef.current = false;
      wonCoachRef.current = undefined;
    }
  }, [model, homeRoster, saveHomeRoster]);

  const actions = useMemo(
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
      skipNode: () => dispatch({ type: 'skipNode' }),
      backToMap: () => dispatch({ type: 'backToMap' }),
      endRun: () => dispatch({ type: 'endRun' }),
      newRun: () =>
        homeRoster &&
        dispatch({ type: 'newRun', seed: `run-${Date.now()}`, homeRoster }),
    }),
    [homeRoster]
  );

  return { model, loaded, actions, wonCoachId: wonCoachRef.current };
}
