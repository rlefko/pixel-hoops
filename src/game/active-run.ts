import { difficultyMods, DIFFICULTIES, type Difficulty } from './difficulty-mode';
import type { RunModel } from './run-machine';

/**
 * Serialize / deserialize the in-progress run for the suspend-and-resume slot. Pure
 * (no storage, no React), so it unit-tests headless like run-machine.ts; the context
 * (src/context/ActiveRunContext.tsx) wraps it with state + AsyncStorage.
 *
 * The run is auto-saved as the player climbs so closing the app, a dead battery, or a
 * web refresh never destroys it. Two invariants keep this small and safe:
 *  - `model.game` (the full simulated timeline + both Teams) is stripped on save: it is
 *    large and fully re-derivable from the seed, and the resumable phases never need it.
 *  - a finished run (`phase.kind === 'summary'`) is never resumable, so deserialize
 *    rejects it. Combined with the hook never persisting summary, this guarantees a
 *    settled run can never be reopened (no double-banking of its rewards).
 */

export const ACTIVE_RUN_VERSION = 1;

export interface SerializedActiveRun {
  version: number;
  data: RunModel;
}

/** Wrap the run for storage, dropping the re-derivable game blob. */
export function serializeActiveRun(model: RunModel): SerializedActiveRun {
  return { version: ACTIVE_RUN_VERSION, data: { ...model, game: null } };
}

function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && (DIFFICULTIES as readonly string[]).includes(value);
}

/**
 * Restore a resumable run, or null if the blob is missing, malformed, from another
 * version, or already finished. Recomputes `mods` from `difficulty` so a balance patch
 * never replays the rest of a suspended run on stale modifiers.
 */
export function deserializeActiveRun(raw: unknown): RunModel | null {
  if (!raw || typeof raw !== 'object') return null;
  const wrapper = raw as Partial<SerializedActiveRun>;
  if (wrapper.version !== ACTIVE_RUN_VERSION) return null;
  const data = wrapper.data as Partial<RunModel> | undefined;
  if (!data || typeof data !== 'object') return null;

  const core = data.core;
  const phase = data.phase;
  if (!core || typeof core !== 'object') return null;
  if (typeof core.seed !== 'string' && typeof core.seed !== 'number') return null;
  if (!phase || typeof phase !== 'object' || typeof phase.kind !== 'string') return null;
  // A settled run is never resumable; reopening it would re-bank its rewards.
  if (phase.kind === 'summary') return null;
  const difficulty = data.difficulty;
  if (!isDifficulty(difficulty)) return null;

  return { ...(data as RunModel), mods: difficultyMods(difficulty), game: null };
}
