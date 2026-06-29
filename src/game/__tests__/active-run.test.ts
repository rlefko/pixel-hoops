import { describe, it, expect } from 'vitest';
import {
  ACTIVE_RUN_VERSION,
  serializeActiveRun,
  deserializeActiveRun,
} from '@/game/active-run';
import { initRun, type RunModel } from '@/game/run-machine';
import { createRookieRoster } from '@/game/home-roster';
import { difficultyMods } from '@/game/difficulty-mode';
import { createRNG } from '@/game/rng';

/** A realistic mid-run snapshot: a fresh run advanced to the map (a resumable phase). */
function snapshot(): RunModel {
  const home = createRookieRoster(createRNG('active-run-test'));
  const model = initRun('run-test-seed', home);
  return { ...model, phase: { kind: 'map' } };
}

/** Mimic the storage layer (JSON.stringify on write, JSON.parse on read). */
function throughStorage(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe('active-run serialize/deserialize', () => {
  it('round-trips a resumable run through JSON storage', () => {
    const model = snapshot();
    const restored = deserializeActiveRun(throughStorage(serializeActiveRun(model)));
    expect(restored).toEqual(model);
  });

  it('strips the re-derivable game blob on serialize', () => {
    const model = snapshot();
    const withGame: RunModel = {
      ...model,
      game: { opponentName: 'X', result: {} as never, home: {} as never, away: {} as never },
    };
    expect(serializeActiveRun(withGame).data.game).toBeNull();
  });

  it('never resumes a finished run (summary phase)', () => {
    const done: RunModel = { ...snapshot(), phase: { kind: 'summary', champion: true } };
    expect(deserializeActiveRun(throughStorage(serializeActiveRun(done)))).toBeNull();
  });

  it('rejects a mismatched version, garbage, and missing fields', () => {
    const model = snapshot();
    expect(deserializeActiveRun({ version: ACTIVE_RUN_VERSION + 1, data: model })).toBeNull();
    expect(deserializeActiveRun(null)).toBeNull();
    expect(deserializeActiveRun({})).toBeNull();
    expect(deserializeActiveRun({ version: ACTIVE_RUN_VERSION, data: {} })).toBeNull();
    expect(
      deserializeActiveRun({ version: ACTIVE_RUN_VERSION, data: { ...model, difficulty: 'bogus' } })
    ).toBeNull();
  });

  it('recomputes mods from difficulty (ignores any stale persisted mods)', () => {
    const model = snapshot();
    const raw = throughStorage(serializeActiveRun(model)) as { data: { mods: unknown } };
    raw.data.mods = { junk: true };
    const restored = deserializeActiveRun(raw);
    expect(restored?.mods).toEqual(difficultyMods(model.difficulty));
  });
});
