import { useReducer, useEffect, useMemo, useRef } from 'react';
import { runReducer } from '@/game/run-machine';
import { mergeRunGainsIntoHome } from '@/game/home-roster';
import { useHomeRoster } from '@/context/HomeRosterContext';
import type { RosterPlayer } from '@/types/roster';
import type { PlayerStats } from '@/types/player';
import type { GamePlan } from '@/types/tactics';
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

  // Start a run once the home roster has loaded from storage.
  useEffect(() => {
    if (loaded && homeRoster && model === null) {
      dispatch({ type: 'newRun', seed: `run-${Date.now()}`, homeRoster });
    }
  }, [loaded, homeRoster, model]);

  // When the run ends (win or loss), fold its gains back into the home roster.
  useEffect(() => {
    if (!model) return;
    if (model.phase.kind === 'summary' && !savedRef.current && homeRoster) {
      savedRef.current = true;
      saveHomeRoster(
        mergeRunGainsIntoHome(
          homeRoster,
          model.core.roster,
          model.core.rewards,
          model.legend.offeredThisRun
        )
      );
    }
    if (model.phase.kind !== 'summary') savedRef.current = false;
  }, [model, homeRoster, saveHomeRoster]);

  const actions = useMemo(
    () => ({
      chooseNode: (nodeId: string) => dispatch({ type: 'chooseNode', nodeId }),
      setGamePlan: (plan: GamePlan) => dispatch({ type: 'setGamePlan', plan }),
      openLineupBuilder: () => dispatch({ type: 'openLineupBuilder' }),
      setLineup: (starters: RosterPlayer[], bench: RosterPlayer[]) =>
        dispatch({ type: 'setLineup', starters, bench }),
      cancelLineup: () => dispatch({ type: 'cancelLineup' }),
      enterGame: () => dispatch({ type: 'enterGame' }),
      finishReplay: () => dispatch({ type: 'finishReplay' }),
      resolveGameResult: () => dispatch({ type: 'resolveGameResult' }),
      recruit: (player: RosterPlayer) => dispatch({ type: 'recruit', player }),
      trainPlayer: (index: number, stat: keyof PlayerStats) =>
        dispatch({ type: 'trainPlayer', index, stat }),
      rest: () => dispatch({ type: 'rest' }),
      draftBoost: (offer: BoostOffer) => dispatch({ type: 'draftBoost', offer }),
      dropBoostForNew: (dropIndex: number) =>
        dispatch({ type: 'dropBoostForNew', dropIndex }),
      skipBoostDraft: () => dispatch({ type: 'skipBoostDraft' }),
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

  return { model, loaded, actions };
}
