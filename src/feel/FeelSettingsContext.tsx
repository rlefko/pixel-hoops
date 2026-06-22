import {
  createContext,
  useContext,
  useState,
  useMemo,
  useEffect,
  type ReactNode,
} from 'react';
import { setHapticsEnabled } from './haptics';

/**
 * Global feel toggles. One place to turn off haptics, motion, or scanlines (for
 * accessibility / reduced motion). Every juice primitive reads this, so a single
 * switch disables it everywhere. Defaults are all-on; a settings UI can flip
 * them later.
 */
export interface FeelSettings {
  hapticsEnabled: boolean;
  reducedMotion: boolean;
  scanlinesEnabled: boolean;
}

interface FeelSettingsContextValue extends FeelSettings {
  update: (patch: Partial<FeelSettings>) => void;
}

const DEFAULTS: FeelSettings = {
  hapticsEnabled: true,
  reducedMotion: false,
  scanlinesEnabled: true,
};

const FeelSettingsContext = createContext<FeelSettingsContextValue>({
  ...DEFAULTS,
  update: () => {},
});

export function FeelSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<FeelSettings>(DEFAULTS);

  // Keep the module-level haptics switch in sync with the setting.
  useEffect(() => {
    setHapticsEnabled(settings.hapticsEnabled);
  }, [settings.hapticsEnabled]);

  const value = useMemo<FeelSettingsContextValue>(
    () => ({
      ...settings,
      update: (patch) => setSettings((s) => ({ ...s, ...patch })),
    }),
    [settings]
  );

  return <FeelSettingsContext.Provider value={value}>{children}</FeelSettingsContext.Provider>;
}

export function useFeelSettings(): FeelSettingsContextValue {
  return useContext(FeelSettingsContext);
}
