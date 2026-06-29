import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the storage layer so this stays pure (the real one imports AsyncStorage).
const { setJSONMock } = vi.hoisted(() => ({ setJSONMock: vi.fn() }));
vi.mock('./storage', () => ({ setJSON: setJSONMock }));

import { createDebouncedWriter } from './debouncedWriter';

describe('createDebouncedWriter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setJSONMock.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces a burst of writes into one delayed write of the last value', () => {
    const w = createDebouncedWriter('k', 500);
    w.write({ n: 1 });
    w.write({ n: 2 });
    w.write({ n: 3 });
    expect(setJSONMock).not.toHaveBeenCalled(); // nothing written during the burst
    vi.advanceTimersByTime(500);
    expect(setJSONMock).toHaveBeenCalledTimes(1);
    expect(setJSONMock).toHaveBeenCalledWith('k', { n: 3 });
  });

  it('flush persists the pending value immediately and cancels the timer', () => {
    const w = createDebouncedWriter('k', 500);
    w.write({ n: 1 });
    w.flush();
    expect(setJSONMock).toHaveBeenCalledTimes(1);
    expect(setJSONMock).toHaveBeenCalledWith('k', { n: 1 });
    vi.advanceTimersByTime(500);
    expect(setJSONMock).toHaveBeenCalledTimes(1); // no second write from a stale timer
  });

  it('flush with nothing pending is a no-op', () => {
    const w = createDebouncedWriter('k', 500);
    w.flush();
    expect(setJSONMock).not.toHaveBeenCalled();
  });

  it('writes again after a flush', () => {
    const w = createDebouncedWriter('k', 500);
    w.write({ n: 1 });
    w.flush();
    w.write({ n: 2 });
    vi.advanceTimersByTime(500);
    expect(setJSONMock).toHaveBeenCalledTimes(2);
    expect(setJSONMock).toHaveBeenLastCalledWith('k', { n: 2 });
  });
});
