import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text, MonoText } from '@/components/StyledText';
import { LiveChip, StaggerIn } from '@/components/fx';
import { MoreLink } from '@/components/teach/MoreLink';
import { useHomeRoster } from '@/context/HomeRosterContext';
import { markTipSeen, tipSeen } from '@/game/teach';
import type { HandbookSection } from '@/navigation/handbook';
import { haptics, sfx } from '@/feel';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import { TEACH_COPY, type CalloutTip } from './teachCopy';

/**
 * A one-shot teaching beat: a small bordered box placed IN LAYOUT FLOW next to
 * the thing it explains (never an overlay, never a scrim, never blocking the
 * button it annotates), dismissed by tapping the box itself.
 *
 * One-shot is enforced in persisted state, not UI memory: the tip stamps seen
 * the first time it is actually VISIBLE, so any exit path (navigating on,
 * finishing the run, killing the app after the debounced flush) retires it and
 * a revisit renders nothing (feel-conventions: ceremonies are one-shot).
 * Visibility is captured once at mount so the stamp cannot hide the instance
 * the player is currently reading.
 *
 * Voice: silent on show (host screens carry their own mount cues; one voice at
 * a time), a quiet secondary tick + light haptic on the dismiss tap, the one
 * interaction the callout owns. The glow breathes for a few seconds then holds
 * steady-lit forever (a finite timer, so no idle plumbing and no unbounded
 * loop); under reduced motion it is steady-lit and instant from the start.
 */

/** How long the glow breathes before settling steady-lit (~4 LiveChip cycles). */
const GLOW_SETTLE_MS = 5000;

interface TeachCalloutProps {
  tip: CalloutTip;
  /** Values for the copy's {name} placeholders (e.g. { budget } for draftBudget). */
  copyArgs?: Record<string, string | number>;
  /** Parent gates behind its reward beats (reward cue first, teach second). While
   * false the tip stays unstamped, so a skipped-past beat honestly re-arms. */
  visible?: boolean;
  /** StaggerIn cascade slot. */
  index?: number;
  /** Optional deep link into the Handbook section that says more. */
  section?: HandbookSection;
  /** Hosts that swap in static fallback copy (recruit, loss summary) hook this. */
  onDismiss?: () => void;
  /** Accent. Steel blue is the info voice; gold stays reserved for CTAs. */
  color?: string;
  style?: StyleProp<ViewStyle>;
}

export function TeachCallout({
  tip,
  copyArgs,
  visible = true,
  index = 0,
  section,
  onDismiss,
  color = palette.steelBlue,
  style,
}: TeachCalloutProps) {
  const { homeRoster, saveHomeRoster } = useHomeRoster();
  // Captured once at mount: the seen-stamp below must not hide this instance.
  const [show] = useState(() => homeRoster != null && !tipSeen(homeRoster.teach, tip));
  const [dismissed, setDismissed] = useState(false);
  const [settled, setSettled] = useState(false);

  const stampedRef = useRef(false);
  const homeRef = useRef(homeRoster);
  homeRef.current = homeRoster;
  const saveRef = useRef(saveHomeRoster);
  saveRef.current = saveHomeRoster;

  const showing = show && visible && !dismissed;

  // Stamp on first actual visibility (not on mount): a beat the player never got
  // to see stays owed. markTipSeen is a same-reference no-op when already seen,
  // and the write rides the debounced writer, never a tap path.
  useEffect(() => {
    if (!showing || stampedRef.current) return;
    stampedRef.current = true;
    const home = homeRef.current;
    if (home) saveRef.current(markTipSeen(home, tip));
    const timer = setTimeout(() => setSettled(true), GLOW_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [showing, tip]);

  if (!showing) return null;

  const copy = TEACH_COPY[tip].replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = copyArgs?.[key];
    return value == null ? match : String(value);
  });

  const dismiss = () => {
    sfx.tap('secondary');
    haptics.light();
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <StaggerIn index={index} style={style}>
      <LiveChip active color={color} paused={settled}>
        <Pressable
          onPress={dismiss}
          hitSlop={space(2)}
          accessibilityRole="button"
          accessibilityLabel={`Tip: ${copy} Tap to dismiss.`}
          style={[styles.box, { borderColor: color + '88' }]}
        >
          <Text style={styles.copy}>{copy}</Text>
          <View style={styles.tail}>
            {section ? <MoreLink section={section} /> : null}
            <MonoText style={styles.dismiss}>✕</MonoText>
          </View>
        </Pressable>
      </LiveChip>
    </StaggerIn>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    borderWidth: BORDER.thin,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.bgPanel,
    paddingVertical: space(2),
    paddingHorizontal: space(3),
  },
  copy: {
    flex: 1,
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    lineHeight: FONT_SIZE.small + 5,
    color: palette.ink,
  },
  tail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
  },
  dismiss: {
    color: palette.inkDim,
    fontSize: FONT_SIZE.small,
  },
});
