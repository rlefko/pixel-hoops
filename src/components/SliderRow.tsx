import { useRef, useState } from 'react';
import { View, StyleSheet, PanResponder, type LayoutChangeEvent } from 'react-native';
import { Text } from '@/components/StyledText';
import { snapToStep } from '@/components/sliderMath';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * A labeled pixel slider row, the sibling of CheckboxRow. The value is normalized
 * 0..1 and snapped to clean notches so it reads 8-bit. Dragging fires `onPreview`
 * on every step (cheap, for live feedback) and `onCommit` once on release (persist).
 * Built on RN-core PanResponder so it needs no gesture-handler dependency and stays
 * web-safe. When `disabled`, the row dims and ignores touches.
 */
interface SliderRowProps {
  label: string;
  description?: string;
  /** Current value, 0..1. */
  value: number;
  /** Fired on every drag step with the live value (for instant feedback). */
  onPreview: (next: number) => void;
  /** Fired once when the gesture ends, with the settled value (for persistence). */
  onCommit: (next: number) => void;
  disabled?: boolean;
  /** Snap granularity, 0..1. Default 5% stops. */
  step?: number;
}

export function SliderRow({
  label,
  description,
  value,
  onPreview,
  onCommit,
  disabled = false,
  step = 0.05,
}: SliderRowProps) {
  // Live drag value (null = not dragging, render the controlled `value`).
  const [drag, setDrag] = useState<number | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);

  // Read by the PanResponder callbacks (created once) without stale closures.
  const widthRef = useRef(0);
  const stepRef = useRef(step);
  stepRef.current = step;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const onPreviewRef = useRef(onPreview);
  onPreviewRef.current = onPreview;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const baseRef = useRef(0); // value at gesture start, the base for the drag delta
  const liveRef = useRef(value); // latest value during the gesture

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current,
      onMoveShouldSetPanResponder: () => !disabledRef.current,
      onPanResponderGrant: (e) => {
        const w = widthRef.current;
        if (w <= 0) return;
        const next = snapToStep(e.nativeEvent.locationX / w, stepRef.current);
        baseRef.current = next;
        liveRef.current = next;
        setDrag(next);
        onPreviewRef.current(next);
      },
      onPanResponderMove: (_e, g) => {
        const w = widthRef.current;
        if (w <= 0) return;
        const next = snapToStep(baseRef.current + g.dx / w, stepRef.current);
        if (next === liveRef.current) return; // only react when the notch changes
        liveRef.current = next;
        setDrag(next);
        onPreviewRef.current(next);
      },
      onPanResponderRelease: () => {
        setDrag(null);
        onCommitRef.current(liveRef.current);
      },
      onPanResponderTerminate: () => {
        setDrag(null);
        onCommitRef.current(liveRef.current);
      },
    })
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    widthRef.current = w;
    setTrackWidth(w);
  };

  const current = drag ?? value;
  const pct = Math.round(current * 100);
  const knobLeft = Math.max(0, (trackWidth - KNOB) * current);

  return (
    <View style={[styles.row, disabled && styles.rowOff]}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{pct}%</Text>
      </View>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      <View
        style={styles.track}
        onLayout={onLayout}
        {...responder.panHandlers}
        accessibilityRole="adjustable"
        accessibilityState={{ disabled }}
        accessibilityValue={{ min: 0, max: 100, now: pct }}
      >
        <View style={[styles.fill, { width: `${pct}%` }]} />
        <View style={[styles.knob, { left: knobLeft }]} />
      </View>
    </View>
  );
}

/** Square pixel knob, sized to ride the full track width without clipping at the ends. */
const KNOB = 22;

const styles = StyleSheet.create({
  row: {
    paddingVertical: space(3),
    gap: space(2),
    borderBottomWidth: BORDER.thin,
    borderBottomColor: palette.bgPanel,
  },
  rowOff: { opacity: 0.4 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
    color: palette.ink,
  },
  value: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.small,
    color: palette.gold,
  },
  description: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
  },
  track: {
    height: 12,
    justifyContent: 'center',
    backgroundColor: palette.bgPanel,
    borderRadius: RADIUS.chip,
    borderWidth: BORDER.thin,
    borderColor: palette.gold,
    // Room for the knob to ride the full width without clipping at the ends.
    marginVertical: space(2),
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: palette.gold + '55',
    borderRadius: RADIUS.chip,
  },
  knob: {
    position: 'absolute',
    width: KNOB,
    height: KNOB,
    backgroundColor: palette.gold,
    borderWidth: BORDER.chunk,
    borderColor: palette.bgDeep,
    borderRadius: RADIUS.chip,
  },
});
