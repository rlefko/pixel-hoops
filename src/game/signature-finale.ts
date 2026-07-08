import { NBA_LEGENDS } from '@/data/nba';
import { nameKey } from '@/types/roster';
import type { HomeRoster } from './home-roster';
import type { RosterPlayer } from '@/types/roster';
import { trialPinLegend } from './home-roster';
import type { Difficulty, LadderClass } from './difficulty-mode';

/**
 * Signature Finale: when a trial pin is armed, the championship/final boss
 * becomes that specific legend's franchise. Creates a dramatic "face your
 * legend's franchise" capstone moment.
 */

/** Whether the Signature Finale is active: a trial pin is armed AND the legend is un-owned. */
export function finaleActive(homeRoster: HomeRoster): boolean {
  const key = homeRoster.scoutTargets?.legendary;
  if (!key) return false;
  if (homeRoster.players.some((p) => nameKey(p.player.name, p.position) === key)) return false;
  return true;
}

/** The armed legend's key, or null if no trial pin is armed. */
export function finaleLegendKey(homeRoster: HomeRoster): string | null {
  return homeRoster.scoutTargets?.legendary ?? null;
}

/**
 * The armed legend as a roster player (on loan). Reuses trialPinLegend logic.
 * Returns null if no trial pin is armed.
 */
export function getFinaleLegend(
  homeRoster: HomeRoster,
  difficulty: Difficulty,
  ladderClass: LadderClass
): RosterPlayer | null {
  return trialPinLegend(homeRoster, difficulty, ladderClass);
}

/**
 * Look up a legend's team abbreviation by their collection key.
 * Returns null if the legend is not found in NBA_LEGENDS.
 */
export function teamAbbrForLegendKey(key: string): string | null {
  for (const legend of NBA_LEGENDS) {
    const legendKey = nameKey(legend.name, legend.position);
    if (legendKey === key) {
      return legend.teamAbbr;
    }
  }
  return null;
}
