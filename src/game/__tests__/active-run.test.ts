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

  it('round-trips the pregame coachRec sentinel states', () => {
    const model = snapshot();
    // A resolved-empty scout (null) survives storage, so a resumed pregame stays quiet
    // instead of recomputing; an unresolved scout (undefined) drops out of JSON, so a
    // resumed pregame recomputes the identical rec.
    const resolved: RunModel = {
      ...model,
      phase: { kind: 'pregame', nodeId: model.core.map.bossNodeId, coachRec: null },
    };
    const restored = deserializeActiveRun(throughStorage(serializeActiveRun(resolved)));
    expect(restored?.phase).toEqual(resolved.phase);
    const unresolved: RunModel = {
      ...model,
      phase: { kind: 'pregame', nodeId: model.core.map.bossNodeId },
    };
    const restoredUnresolved = deserializeActiveRun(
      throughStorage(serializeActiveRun(unresolved))
    );
    expect(restoredUnresolved?.phase.kind).toBe('pregame');
    expect(
      restoredUnresolved?.phase.kind === 'pregame' && restoredUnresolved.phase.coachRec
    ).toBeUndefined();
  });

  it('recomputes mods from difficulty (ignores any stale persisted mods)', () => {
    const model = snapshot();
    const raw = throughStorage(serializeActiveRun(model)) as { data: { mods: unknown } };
    raw.data.mods = { junk: true };
    const restored = deserializeActiveRun(raw);
    expect(restored?.mods).toEqual(difficultyMods(model.difficulty));
  });
});

describe('favor across suspend/resume', () => {
  it('round-trips the run favor ledger and the home favor snapshot', () => {
    const model = {
      ...snapshot(),
      favor: { 'Some Recruit|PG': 7 },
      homeFavor: { 'Some Legend|C': 12 },
    };
    const restored = deserializeActiveRun(throughStorage(serializeActiveRun(model)));
    expect(restored?.favor).toEqual({ 'Some Recruit|PG': 7 });
    expect(restored?.homeFavor).toEqual({ 'Some Legend|C': 12 });
  });

  it('a pre-favor suspended run resumes with the fields absent (defaults apply)', () => {
    const model = snapshot();
    const raw = throughStorage(serializeActiveRun(model)) as {
      data: { favor?: unknown; homeFavor?: unknown };
    };
    delete raw.data.favor;
    delete raw.data.homeFavor;
    const restored = deserializeActiveRun(raw);
    expect(restored).not.toBeNull();
    expect(restored?.favor).toBeUndefined();
    expect(restored?.homeFavor).toBeUndefined();
  });
});
