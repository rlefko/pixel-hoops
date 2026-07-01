import { useHomeRoster } from '@/context/HomeRosterContext';
import { getCourtTheme, type CourtThemeDef } from '@/game/court-themes';

/** The player's selected home-court theme (the classic court while the save is
 * still loading), for the game-watch floor and the run map's arena backdrop. */
export function useCourtTheme(): CourtThemeDef {
  const { homeRoster } = useHomeRoster();
  return getCourtTheme(homeRoster?.courtTheme);
}
