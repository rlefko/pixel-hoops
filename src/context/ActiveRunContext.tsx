import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { getJSON } from '@/storage/storage';
import { createDebouncedWriter, type DebouncedWriter } from '@/storage/debouncedWriter';
import { serializeActiveRun, deserializeActiveRun } from '@/game/active-run';
import type { RunModel } from '@/game/run-machine';

/**
 * Owns the single suspend-and-resume run slot, so closing the app, a dead battery, or
 * a web refresh never destroys an in-progress climb. Mirrors HomeRosterContext: loads
 * once on mount (rejecting a finished or malformed save), persists through a debounced
 * writer, and flushes on background/unmount. Mounted once in app/_layout.tsx, under
 * HomeRosterProvider. Coins are NOT stored here; they bank into the home roster as they
 * are earned, so this slot only carries the run's position and is safe to discard.
 */

const STORAGE_KEY = 'pixelhoops.active-run.v1';

interface ActiveRunContextValue {
  /** The resumable run, or null when none is saved. */
  savedRun: RunModel | null;
  loaded: boolean;
  /** Persist the run as the latest resumable snapshot. */
  saveActiveRun: (model: RunModel) => void;
  /** Drop the saved run (finished, abandoned, or wiped). */
  clearActiveRun: () => void;
}

const ActiveRunContext = createContext<ActiveRunContextValue>({
  savedRun: null,
  loaded: false,
  saveActiveRun: () => {},
  clearActiveRun: () => {},
});

export function ActiveRunProvider({ children }: { children: ReactNode }) {
  const [savedRun, setSavedRun] = useState<RunModel | null>(null);
  const [loaded, setLoaded] = useState(false);

  const writerRef = useRef<DebouncedWriter | null>(null);
  if (writerRef.current === null) writerRef.current = createDebouncedWriter(STORAGE_KEY);
  const writer = writerRef.current;

  useEffect(() => {
    let active = true;
    void (async () => {
      const raw = await getJSON<unknown>(STORAGE_KEY);
      if (!active) return;
      setSavedRun(deserializeActiveRun(raw));
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  // Flush any pending snapshot when the app backgrounds or the provider unmounts, so a
  // run is never lost on app switch or close.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') writer.flush();
    });
    return () => {
      writer.flush();
      sub.remove();
    };
  }, [writer]);

  const saveActiveRun = useCallback(
    (model: RunModel) => {
      setSavedRun(model);
      writer.write(serializeActiveRun(model));
    },
    [writer]
  );

  // Clear by writing null through the SAME writer (then flushing), so a pending save can
  // never resurrect the run after it is cleared. A stored null deserializes to no run.
  const clearActiveRun = useCallback(() => {
    setSavedRun(null);
    writer.write(null);
    writer.flush();
  }, [writer]);

  const value = useMemo<ActiveRunContextValue>(
    () => ({ savedRun, loaded, saveActiveRun, clearActiveRun }),
    [savedRun, loaded, saveActiveRun, clearActiveRun]
  );

  return <ActiveRunContext.Provider value={value}>{children}</ActiveRunContext.Provider>;
}

export function useActiveRun(): ActiveRunContextValue {
  return useContext(ActiveRunContext);
}
