import { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { space } from '@/theme';
import type { HandbookSection } from '@/navigation/handbook';
import { TeachCallout } from './TeachCallout';
import { useTipArmed } from './useTipArmed';
import type { CalloutTip } from './teachCopy';

/**
 * Host wrapper for a DELAYED teach beat (one that waits behind the screen's
 * reward beats, so reward speaks first and teaching second). Renders nothing
 * for a retired beat (a veteran's screen never gains a pixel); while the beat
 * is owed it reserves a fixed-height slot immediately, so the callout's
 * delayed arrival can never shift the content below it, then flips the callout
 * visible after `delayMs`.
 */

/** The callout's two-line worst case; the slot holds this whether or not the
 * beat has landed yet. */
const SLOT_MIN_HEIGHT = 62;

interface TeachSlotProps {
  tip: CalloutTip;
  /** How long the screen's own reward beats need before teaching may speak. */
  delayMs: number;
  section?: HandbookSection;
  copyArgs?: Record<string, string | number>;
  style?: StyleProp<ViewStyle>;
}

export function TeachSlot({ tip, delayMs, section, copyArgs, style }: TeachSlotProps) {
  const armed = useTipArmed(tip);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [armed, delayMs]);

  if (!armed) return null;
  return (
    <View style={[styles.slot, style]}>
      <TeachCallout tip={tip} section={section} copyArgs={copyArgs} visible={visible} />
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    minHeight: SLOT_MIN_HEIGHT,
    alignSelf: 'stretch',
    justifyContent: 'center',
    marginTop: space(2),
  },
});
