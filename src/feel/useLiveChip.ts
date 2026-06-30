import { useGlowPulse } from './usePulse';

interface LiveChipOptions {
  /** Quiet the glow loop (e.g. when the screen is idle). */
  paused?: boolean;
  /** Breathe duration. Default 1100ms, matching the run-map reachable-node glow. */
  durationMs?: number;
}

/**
 * The "live selection" glow: the slow breathe behind a chip or card that is
 * currently selected, equipped, or affordable, reusing the run-map reachable-node
 * recipe (see MapNodeTile). Returns a glow opacity style; render the glow View only
 * while `active` (so an unselected chip stays dark and runs no loop). Holds steady-lit
 * under reduced motion, and the loop pauses when `paused`. Or use the <LiveChip>
 * wrapper, which handles the conditional glow for you.
 */
export function useLiveChip(active: boolean, options: LiveChipOptions = {}) {
  const { paused = false, durationMs = 1100 } = options;
  return useGlowPulse(durationMs, { paused: !active || paused });
}
