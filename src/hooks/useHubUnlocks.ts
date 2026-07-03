import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useHomeRoster } from '@/context/HomeRosterContext';
import {
  dueHubCeremonies,
  hubPulseTarget,
  hubStages,
  markTipSeen,
  type HubPulseTarget,
  type HubStages,
  type TipId,
} from '@/game/teach';
import { haptics, sfx } from '@/feel';

/**
 * The hub's progressive-unfolding beat (the useHubDeltas pattern: focus-keyed,
 * hydration-race-safe, blur re-arm). On each focus it captures the unlock
 * ceremonies owed exactly once: quiet reveals (Daily panel, coach row) stamp
 * immediately and stagger in; ONE audible ceremony (Locker, Arcade, Hall of
 * Fame) waits CEREMONY_HOLD_MS so the since-you-left coin beat lands first
 * (reward cue, then unlock beat, never stacked), then pops its tile with a
 * reward sting and stamps its tip in the same tick. Every stamp goes through
 * the debounced writer; the persisted seen flag, not UI memory, is the one-shot
 * guard, so a revisit renders settled.
 *
 * The single attract pulse per screen also derives here (hubPulseTarget), so
 * the hub can never pulse two "do this next" signals at once.
 */

/** After useHubDeltas' 250ms reveal hold plus the coin pill's count-up
 * (useCountUp caps at 600ms), so the unlock beat never lands on the coin tick. */
const CEREMONY_HOLD_MS = 900;

/** Graduated default: before hydration (and for any unexpected state) the hub
 * renders fully open with no ceremony, so a veteran can never flash a lock. */
const OPEN_STAGES: HubStages = {
  locker: true,
  arcade: true,
  coaches: true,
  hallOfFame: true,
  daily: true,
};

export function useHubUnlocks(input: {
  hasSavedRun: boolean;
  spotlightClaimed: boolean;
}): {
  stages: HubStages;
  /** The audible ceremony playing THIS focus (null = none). Its tip is already
   * stamped when this flips, so the Pop trigger can never re-fire. */
  ceremony: TipId | null;
  /** True only on the focus where the Daily panel / coach row first render
   * (gates their one-shot StaggerIn entrances). */
  dailyJustUnlocked: boolean;
  coachesJustUnlocked: boolean;
  /** The one element allowed to attract-pulse on this screen. */
  pulse: HubPulseTarget;
} {
  const { homeRoster, loaded, saveHomeRoster } = useHomeRoster();
  const [ceremony, setCeremony] = useState<TipId | null>(null);
  const [justUnlocked, setJustUnlocked] = useState<{ daily: boolean; coaches: boolean }>({
    daily: false,
    coaches: false,
  });

  // Latest values behind refs so the focus callback stays identity-stable (the
  // useHubDeltas discipline): the effect runs on true focus/blur only.
  const homeRef = useRef(homeRoster);
  homeRef.current = homeRoster;
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  const saveRef = useRef(saveHomeRoster);
  saveRef.current = saveHomeRoster;

  const capturedRef = useRef(false);
  const focusedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const maybeCapture = useCallback(() => {
    if (capturedRef.current || !focusedRef.current) return;
    const home = homeRef.current;
    if (!loadedRef.current || !home) return;
    capturedRef.current = true;
    const due = dueHubCeremonies(home);
    // Quiet reveals stamp on the focus they first render; their entrance is the
    // whole celebration (the loud clear already played on the run summary).
    if (due.quiet.length) {
      let stamped = home;
      for (const tip of due.quiet) stamped = markTipSeen(stamped, tip);
      if (stamped !== home) saveRef.current(stamped);
      setJustUnlocked({
        daily: due.quiet.includes('dailyUnlock'),
        coaches: due.quiet.includes('coachesUnlock'),
      });
    }
    if (due.audible) {
      const tip = due.audible;
      timerRef.current = setTimeout(() => {
        // Stamp first (the persisted one-shot guard), then play the beat.
        const current = homeRef.current;
        if (current) saveRef.current(markTipSeen(current, tip));
        setCeremony(tip);
        sfx.reward('rare');
        haptics.success();
      }, CEREMONY_HOLD_MS);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      maybeCapture();
      return () => {
        focusedRef.current = false;
        capturedRef.current = false;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        setCeremony(null);
        setJustUnlocked({ daily: false, coaches: false });
      };
    }, [maybeCapture])
  );

  // Cold start: the first focus can fire before the roster hydrates.
  useEffect(() => {
    if (loaded) maybeCapture();
  }, [loaded, maybeCapture]);

  const stages = loaded && homeRoster ? hubStages(homeRoster) : OPEN_STAGES;
  const pulse = hubPulseTarget({
    stages,
    ceremony,
    hasSavedRun: input.hasSavedRun,
    spotlightClaimed: input.spotlightClaimed,
  });

  return {
    stages,
    ceremony,
    dailyJustUnlocked: justUnlocked.daily,
    coachesJustUnlocked: justUnlocked.coaches,
    pulse,
  };
}
