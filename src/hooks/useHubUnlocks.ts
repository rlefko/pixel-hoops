import { useState } from 'react';
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
import { useFocusCapture } from '@/hooks/useFocusCapture';
import { haptics, sfx } from '@/feel';

/**
 * The hub's progressive-unfolding beat (capture-once-per-focus via
 * useFocusCapture). On each focus it takes the unlock ceremonies owed exactly
 * once: quiet reveals (Daily panel, coach row) stamp immediately and stagger
 * in; ONE audible ceremony (Locker, Arcade, Hall of Fame) waits
 * CEREMONY_HOLD_MS so the since-you-left coin beat lands first (reward cue,
 * then unlock beat, never stacked), then pops its tile with a reward sting and
 * stamps its tip in the same tick. Every stamp goes through the debounced
 * writer; the persisted seen flag, not UI memory, is the one-shot guard, so a
 * revisit renders settled.
 *
 * The single attract pulse per screen also derives here (hubPulseTarget), so
 * the hub can never pulse two "do this next" signals at once.
 */

/** After useHubDeltas' reveal hold (HOLD_MS, 250ms) plus the coin pill's
 * count-up (useCountUp caps at DUR.count's 600ms max), with margin, so the
 * unlock sting can never land on the coin ticks. If either source constant
 * grows past 850ms combined, this must grow with it. */
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
  const { homeRoster, loaded } = useHomeRoster();
  const [ceremony, setCeremony] = useState<TipId | null>(null);
  const [justUnlocked, setJustUnlocked] = useState<{ daily: boolean; coaches: boolean }>({
    daily: false,
    coaches: false,
  });

  useFocusCapture(
    ({ home, latest, save }) => {
      const due = dueHubCeremonies(home);
      // Quiet reveals stamp on the focus they first render; their entrance is
      // the whole celebration (the loud clear already played on the summary).
      if (due.quiet.length) {
        let stamped = home;
        for (const tip of due.quiet) stamped = markTipSeen(stamped, tip);
        if (stamped !== home) save(stamped);
        setJustUnlocked({
          daily: due.quiet.includes('dailyUnlock'),
          coaches: due.quiet.includes('coachesUnlock'),
        });
      }
      if (!due.audible) return;
      const tip = due.audible;
      const timer = setTimeout(() => {
        // Stamp first (the persisted one-shot guard), then play the beat. Read
        // the LATEST roster: the quiet stamps above may have written since.
        const current = latest();
        if (current) save(markTipSeen(current, tip));
        setCeremony(tip);
        sfx.reward('rare');
        haptics.success();
      }, CEREMONY_HOLD_MS);
      return () => clearTimeout(timer);
    },
    () => {
      setCeremony(null);
      setJustUnlocked({ daily: false, coaches: false });
    }
  );

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
