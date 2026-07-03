import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { useHomeRoster } from '@/context/HomeRosterContext';
import type { HomeRoster } from '@/game/home-roster';

/**
 * The hub screens' capture-once-per-focus scaffold, shared by useHubDeltas and
 * useHubUnlocks. It owns the subtle parts so they can never drift apart:
 * latest values behind refs (the focus callback stays identity-stable, so the
 * effect runs on true focus/blur only, never on a capture's own re-render), a
 * captured-flag that re-arms on blur (HomeScreen stays mounted under pushed
 * screens via freezeOnBlur, so everything keys on FOCUS, not mount), and the
 * cold-start race (the first focus can fire before the roster hydrates; the
 * capture lands the moment `loaded` flips).
 *
 * `capture` runs exactly once per focused, hydrated session. It may return a
 * cleanup (timer cancellation), called on blur before `onBlurReset`. The `ctx`
 * exposes `latest()` for delayed work: a timer firing later must re-read the
 * roster, or its whole-object save would clobber writes made since capture.
 */
export interface FocusCaptureCtx {
  /** The roster as of the capture moment. */
  home: HomeRoster;
  /** The roster right now (for delayed timers; see above). */
  latest: () => HomeRoster | null;
  /** Debounced persist, never a tap-path write. */
  save: (home: HomeRoster) => void;
}

export function useFocusCapture(
  capture: (ctx: FocusCaptureCtx) => (() => void) | void,
  onBlurReset: () => void
): void {
  const { homeRoster, loaded, saveHomeRoster } = useHomeRoster();

  const homeRef = useRef(homeRoster);
  homeRef.current = homeRoster;
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  const saveRef = useRef(saveHomeRoster);
  saveRef.current = saveHomeRoster;
  const captureRef = useRef(capture);
  captureRef.current = capture;
  const resetRef = useRef(onBlurReset);
  resetRef.current = onBlurReset;

  const capturedRef = useRef(false);
  const focusedRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  const maybeCapture = useCallback(() => {
    if (capturedRef.current || !focusedRef.current) return;
    const home = homeRef.current;
    if (!loadedRef.current || !home) return;
    capturedRef.current = true;
    cleanupRef.current =
      captureRef.current({
        home,
        latest: () => homeRef.current,
        save: (next) => saveRef.current(next),
      }) ?? null;
  }, []);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      maybeCapture();
      return () => {
        focusedRef.current = false;
        capturedRef.current = false;
        cleanupRef.current?.();
        cleanupRef.current = null;
        resetRef.current();
      };
    }, [maybeCapture])
  );

  // Cold start: capture the moment hydration lands.
  useEffect(() => {
    if (loaded) maybeCapture();
  }, [loaded, maybeCapture]);
}
