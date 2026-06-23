import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { createRNG } from '@/game/rng';
import { getJSON, setJSON } from '@/storage/storage';
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

  const saveHomeRoster = useCallback((next: HomeRoster) => {
    setHomeRoster(next);
    void setJSON(STORAGE_KEY, serializeHomeRoster(next));
  }, []);

  // Reset to a fresh rookie team and persist it (overwriting the save), so the UI
  // re-renders clean without an app restart. Feel/accessibility settings are a
  // separate store and are intentionally left untouched.
  const resetHomeRoster = useCallback(() => {
    saveHomeRoster(createRookieRoster(createRNG(`home-${Date.now()}`)));
  }, [saveHomeRoster]);

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
