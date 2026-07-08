import { createRNG, deriveSeed } from './rng';
import { pickRealTeam } from './player-pool';
import { NBA_TEAMS } from '@/data/nba';
import type { NbaTeam } from '@/types/nba';

/**
 * The franchise a combat node will field, computed ahead of time so the run map
 * can tint each game/elite/boss tile with the real opponent's colors and badge.
 *
 * This MUST stay consistent with the actual opponent built in
 * src/game/run-machine.ts (`enterGame`), which calls `generateOpponentTeam` with
 * `createRNG(deriveSeed(seed, 'opp-<nodeId>'))`. The franchise identity is the
 * FIRST RNG draw inside `generateOpponentTeam` (`pickRealTeam`), so drawing it
 * here from the same seed + label yields the exact same team. If you reorder the
 * draws in `generateOpponentTeam`, update this helper too.
 */
export function previewOpponent(
  seed: number | string,
  nodeId: string,
  options?: { finaleTeamAbbr?: string }
): NbaTeam {
  // If a Signature Finale is active, use the armed legend's franchise directly
  if (options?.finaleTeamAbbr) {
    return (
      NBA_TEAMS.find((t) => t.abbreviation === options.finaleTeamAbbr) ??
      pickRealTeam(createRNG(deriveSeed(seed, `opp-${nodeId}`)))
    );
  }
  return pickRealTeam(createRNG(deriveSeed(seed, `opp-${nodeId}`)));
}
