import { createRNG, deriveSeed } from './rng';
import { pickRealTeam } from './player-pool';
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
  nodeId: string
): NbaTeam {
  return pickRealTeam(createRNG(deriveSeed(seed, `opp-${nodeId}`)));
}
