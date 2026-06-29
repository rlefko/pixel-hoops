import {
  createContext,
  useContext,
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { setHapticsEnabled } from './haptics';
import { getJSON } from '@/storage/storage';
import { createDebouncedWriter, type DebouncedWriter } from '@/storage/debouncedWriter';

/**
 * Global feel toggles. One place to turn off haptics, motion, or scanlines (for
 * accessibility / reduced motion), and to control the auto-sim watch pacing
 * (playback speed and a condensed highlights mode). Every juice primitive reads
 * this, so a single switch changes it everywhere. Persisted across sessions
 * (mirrors HomeRosterContext). Defaults: all juice on, a brisk default speed.
 */

/** Auto-sim playback speed. Default is brisk, not 1x: a slow default invites skipping. */
export type SimSpeed = 'chill' | 'brisk' | 'blitz';

/** The divisor each speed applies to every event gap and animation duration. */
export const SIM_SPEED_FACTOR: Record<SimSpeed, number> = {
  chill: 1,
  brisk: 1.6,
  blitz: 2.5,
};

/** Cycle order for the in-replay speed toggle. */
export const SIM_SPEED_ORDER: SimSpeed[] = ['chill', 'brisk', 'blitz'];

export interface FeelSettings {
  hapticsEnabled: boolean;
  /** Screen shake on big plays. Toggled independently of haptics. */
  shakeEnabled: boolean;
  reducedMotion: boolean;
  scanlinesEnabled: boolean;
  /** Playback speed for the watched sim. */
  simSpeed: SimSpeed;
  /** Condensed watch: routine non-scoring plays whip by, big plays keep full juice. */
  highlightsOnly: boolean;
}

interface FeelSettingsContextValue extends FeelSettings {
  update: (patch: Partial<FeelSettings>) => void;
}

const DEFAULTS: FeelSettings = {
  hapticsEnabled: true,
  shakeEnabled: true,
  reducedMotion: false,
  scanlinesEnabled: true,
  simSpeed: 'brisk',
  highlightsOnly: false,
};

const STORAGE_KEY = 'pixelhoops.feel-settings.v1';

const FeelSettingsContext = createContext<FeelSettingsContextValue>({
  ...DEFAULTS,
  update: () => {},
});

export function FeelSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<FeelSettings>(DEFAULTS);

  // Debounced persistence (mirrors HomeRosterContext): toggling speed/highlights mid
  // replay coalesces into one write instead of a write per tap.
  const writerRef = useRef<DebouncedWriter | null>(null);
  if (writerRef.current === null) writerRef.current = createDebouncedWriter(STORAGE_KEY);
  const writer = writerRef.current;

  // Hydrate from storage on mount, merging over defaults so missing or unknown
  // keys stay safe. Hydration itself does not write back; only explicit updates persist.
  useEffect(() => {
    let active = true;
    void (async () => {
      const raw = await getJSON<Partial<FeelSettings>>(STORAGE_KEY);
      if (!active || !raw) return;
      const merged = { ...DEFAULTS, ...raw };
      if (!(merged.simSpeed in SIM_SPEED_FACTOR)) merged.simSpeed = DEFAULTS.simSpeed;
      setSettings(merged);
    })();
    return () => {
      active = false;
    };
  }, []);

  // Keep the module-level haptics switch in sync with the setting.
  useEffect(() => {
    setHapticsEnabled(settings.hapticsEnabled);
  }, [settings.hapticsEnabled]);

  // Flush any pending write on app background / unmount so a toggle is never lost.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') writer.flush();
    });
    return () => {
      writer.flush();
      sub.remove();
    };
  }, [writer]);

  const update = useCallback(
    (patch: Partial<FeelSettings>) => {
      setSettings((s) => {
        const next = { ...s, ...patch };
        writer.write(next);
        return next;
      });
    },
    [writer]
  );

  const value = useMemo<FeelSettingsContextValue>(
    () => ({ ...settings, update }),
    [settings, update]
  );

  return <FeelSettingsContext.Provider value={value}>{children}</FeelSettingsContext.Provider>;
}

export function useFeelSettings(): FeelSettingsContextValue {
  return useContext(FeelSettingsContext);
}
