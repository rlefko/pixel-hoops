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
import { createRNG } from '@/game/rng';
import { getJSON } from '@/storage/storage';
import { createDebouncedWriter, type DebouncedWriter } from '@/storage/debouncedWriter';
import {
  createRookieRoster,
  serializeHomeRoster,
  deserializeHomeRoster,
  type HomeRoster,
} from '@/game/home-roster';

/**
 * Owns the persistent home roster (the cross-run, cross-screen state). Loads
 * from storage on mount, falling back to a fresh rookie team, and persists on
 * every save. Mirrors FeelSettingsContext. Mounted once in app/_layout.tsx.
 */

const STORAGE_KEY = 'pixelhoops.home-roster.v1';

interface HomeRosterContextValue {
  homeRoster: HomeRoster | null;
  loaded: boolean;
  saveHomeRoster: (next: HomeRoster) => void;
  /** Wipe all game progress back to a fresh rookie roster (the Settings reset). */
  resetHomeRoster: () => void;
}

const HomeRosterContext = createContext<HomeRosterContextValue>({
  homeRoster: null,
  loaded: false,
  saveHomeRoster: () => {},
  resetHomeRoster: () => {},
});

export function HomeRosterProvider({ children }: { children: ReactNode }) {
  const [homeRoster, setHomeRoster] = useState<HomeRoster | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Debounced persistence: state updates stay instant, but the full-roster
  // JSON.stringify is coalesced so an upgrade spray writes once after it settles
  // rather than stalling the JS thread on every tap. (Created lazily; the factory
  // is side-effect free, so building it during render is safe.)
  const writerRef = useRef<DebouncedWriter | null>(null);
  if (writerRef.current === null) writerRef.current = createDebouncedWriter(STORAGE_KEY);
  const writer = writerRef.current;

  useEffect(() => {
    let active = true;
    void (async () => {
      const raw = await getJSON<unknown>(STORAGE_KEY);
      if (!active) return;
      const restored =
        deserializeHomeRoster(raw) ??
        createRookieRoster(createRNG(`home-${Date.now()}`));
      setHomeRoster(restored);
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  // Flush any pending write when the app backgrounds or the provider unmounts, so a
  // debounced upgrade is never lost on app switch or close.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') writer.flush();
    });
    return () => {
      writer.flush();
      sub.remove();
    };
  }, [writer]);

  const saveHomeRoster = useCallback(
    (next: HomeRoster) => {
      setHomeRoster(next);
      writer.write(serializeHomeRoster(next));
    },
    [writer]
  );

  // Reset to a fresh rookie team and persist it (overwriting the save), so the UI
  // re-renders clean without an app restart. A full wipe persists immediately rather
  // than after the debounce window. Feel/accessibility settings are a separate store
  // and are intentionally left untouched.
  const resetHomeRoster = useCallback(() => {
    saveHomeRoster(createRookieRoster(createRNG(`home-${Date.now()}`)));
    writer.flush();
  }, [saveHomeRoster, writer]);

  const value = useMemo<HomeRosterContextValue>(
    () => ({ homeRoster, loaded, saveHomeRoster, resetHomeRoster }),
    [homeRoster, loaded, saveHomeRoster, resetHomeRoster]
  );

  return (
    <HomeRosterContext.Provider value={value}>
      {children}
    </HomeRosterContext.Provider>
  );
}

export function useHomeRoster(): HomeRosterContextValue {
  return useContext(HomeRosterContext);
}
