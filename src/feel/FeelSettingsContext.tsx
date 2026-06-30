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
import { useLowPowerMode } from 'expo-battery';
import { setHapticsEnabled } from './haptics';
import { setSoundEnabled, setSoundVolume, setAudioActive, initSfx } from './audio';
import {
  setMusicEnabled,
  setMusicVolume,
  setMusicActive,
  initMusic,
  playMusicContext,
} from './music';
import { isSoundEffective, isMusicEffective } from './soundPolicy';
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
  /** Arcade chiptune sound effects. Toggled independently of haptics. */
  soundEnabled: boolean;
  /** Master SFX volume, 0..1. No UI yet; the module applies it at player creation. */
  sfxVolume: number;
  /** Looping chiptune background music (menu + game beds). Defaults on. */
  musicEnabled: boolean;
  /** Master music volume, 0..1. Lower default than SFX so music sits under the blips. */
  musicVolume: number;
  /** Screen shake on big plays. Toggled independently of haptics. */
  shakeEnabled: boolean;
  reducedMotion: boolean;
  scanlinesEnabled: boolean;
  /** CRT vignette + drifting court ambience on hub screens (pure atmosphere). */
  arcadeExtras: boolean;
  /** Playback speed for the watched sim. */
  simSpeed: SimSpeed;
  /** Condensed watch: routine non-scoring plays whip by, big plays keep full juice. */
  highlightsOnly: boolean;
  /** Skip the watched play-by-play and jump straight to the game result. */
  autoSkipGames: boolean;
}

interface FeelSettingsContextValue extends FeelSettings {
  update: (patch: Partial<FeelSettings>) => void;
  /** The user's own Reduce Motion choice (what the settings toggle reflects), kept
   *  separate from the effective `reducedMotion` above, which is ALSO forced on while
   *  the device is in low power mode. */
  reducedMotionSetting: boolean;
  /** True while the device is in iOS Low Power Mode / Android battery saver. */
  lowPowerMode: boolean;
}

const DEFAULTS: FeelSettings = {
  hapticsEnabled: true,
  soundEnabled: true,
  sfxVolume: 0.65,
  musicEnabled: true,
  musicVolume: 0.5,
  shakeEnabled: true,
  reducedMotion: false,
  scanlinesEnabled: true,
  arcadeExtras: true,
  simSpeed: 'brisk',
  highlightsOnly: false,
  autoSkipGames: false,
};

const STORAGE_KEY = 'pixelhoops.feel-settings.v1';

const FeelSettingsContext = createContext<FeelSettingsContextValue>({
  ...DEFAULTS,
  update: () => {},
  reducedMotionSetting: DEFAULTS.reducedMotion,
  lowPowerMode: false,
});

export function FeelSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<FeelSettings>(DEFAULTS);
  // Gates audio init: stays false until persisted settings load, so a player who turned
  // sound off never pays to spin the audio engine up first (see the lazy-init effect).
  const [hydrated, setHydrated] = useState(false);

  // iOS Low Power Mode / Android battery saver. expo-battery's hook is web-safe (it
  // resolves false and the listener never fires off-device), so this is a no-op there.
  // It initializes false and resolves the real state a tick later, so a device that
  // boots in Low Power Mode may briefly read false; the effects below self-correct.
  const lowPowerMode = useLowPowerMode();

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
      if (!active) return;
      if (raw) {
        const merged = { ...DEFAULTS, ...raw };
        if (!(merged.simSpeed in SIM_SPEED_FACTOR)) merged.simSpeed = DEFAULTS.simSpeed;
        merged.sfxVolume = Math.min(1, Math.max(0, merged.sfxVolume));
        merged.musicVolume = Math.min(1, Math.max(0, merged.musicVolume));
        setSettings(merged);
      }
      // Mark hydrated on BOTH paths (stored or first-launch) so a fresh install,
      // which has nothing to load, still initializes sound.
      setHydrated(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  // Keep the module-level haptics switch in sync with the setting.
  useEffect(() => {
    setHapticsEnabled(settings.hapticsEnabled);
  }, [settings.hapticsEnabled]);

  // Sound is effectively on only when the player has it on AND the device is not in
  // Low Power Mode (mirrors the Reduce Motion behavior in #90, so the app quiets itself
  // when the battery is low).
  const soundEffective = isSoundEffective(hydrated, settings.soundEnabled, lowPowerMode);
  // Keep this effect above the lazy-init effect: effects fire in source order, so the
  // module's enabled flag is set in the same render pass before any sound can fire.
  useEffect(() => {
    setSoundEnabled(settings.soundEnabled && !lowPowerMode);
  }, [settings.soundEnabled, lowPowerMode]);
  // Master volume, applied live by the in-settings slider.
  useEffect(() => {
    setSoundVolume(settings.sfxVolume);
  }, [settings.sfxVolume]);
  // Build the audio engine lazily: only once settings have hydrated and sound is
  // effectively on, so keeping sound off (or booting in Low Power Mode) never spins up
  // the audio session or its ~30 players. Idempotent, so it also fires the first time
  // Low Power Mode lifts on a device that booted into it.
  useEffect(() => {
    if (soundEffective) void initSfx();
  }, [soundEffective]);

  // Background music mirrors the SFX wiring exactly (enabled gate above lazy init, live
  // volume, lazy build only once effective), with its own enabled/volume settings.
  const musicEffective = isMusicEffective(hydrated, settings.musicEnabled, lowPowerMode);
  useEffect(() => {
    setMusicEnabled(settings.musicEnabled && !lowPowerMode);
  }, [settings.musicEnabled, lowPowerMode]);
  useEffect(() => {
    setMusicVolume(settings.musicVolume);
  }, [settings.musicVolume]);
  useEffect(() => {
    if (musicEffective) void initMusic();
  }, [musicEffective]);
  // Default to the calm menu/hub bed once music is effective. Screens override the context
  // (RunScreen switches to the game bed during the watch); this is just the baseline so
  // hubs and the run map play music without each screen having to ask.
  useEffect(() => {
    if (musicEffective) playMusicContext('menu');
  }, [musicEffective]);

  // Latest effective-sound, read by the AppState handler below without re-subscribing.
  const soundEffectiveRef = useRef(soundEffective);
  soundEffectiveRef.current = soundEffective;
  const musicEffectiveRef = useRef(musicEffective);
  musicEffectiveRef.current = musicEffective;

  // On background: flush the pending settings write so a toggle is never lost, and
  // release the audio session so we don't hold the audio route warm while away. On
  // return to the foreground: re-activate the session if sound is effectively on.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        writer.flush();
        setAudioActive(false);
        setMusicActive(false); // pause both beds while away
      } else {
        if (soundEffectiveRef.current) setAudioActive(true);
        if (musicEffectiveRef.current) setMusicActive(true); // resume the active bed
      }
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

  // Low power mode forces the reduced-motion path on (the whole juice layer already
  // honors `reducedMotion`), so the app calms itself exactly when the battery is low.
  // The user's own setting is exposed separately so the toggle stays truthful.
  const value = useMemo<FeelSettingsContextValue>(
    () => ({
      ...settings,
      reducedMotion: settings.reducedMotion || lowPowerMode,
      reducedMotionSetting: settings.reducedMotion,
      lowPowerMode,
      update,
    }),
    [settings, lowPowerMode, update]
  );

  return <FeelSettingsContext.Provider value={value}>{children}</FeelSettingsContext.Provider>;
}

export function useFeelSettings(): FeelSettingsContextValue {
  return useContext(FeelSettingsContext);
}
