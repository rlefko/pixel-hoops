import { type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { MonoText } from '@/components/StyledText';
import { usePulse } from '@/feel';
import { palette, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

interface TagChipProps {
  label: string;
  /** Accent color for the border, label, and optional glow. */
  color: string;
  /** Leading PixelIcon (already colored). */
  icon?: ReactNode;
  /** Small secondary line under the label (e.g. a synergy's effect word). */
  sub?: string;
  /** Color for the sub line. Defaults to inkDim. */
  subColor?: string;
  /** When set, a soft accent glow pulses behind the chip, staggered by this delay. */
  glowDelayMs?: number;
  /** Pulse period for the glow. A shorter period reads as faster. Default 1200. */
  glowDurationMs?: number;
  size?: 'micro' | 'small';
}

/**
 * One tiny arcade chip: an accent-bordered, accent-tinted box with an optional
 * leading PixelIcon, a mono label, and an optional sub line. The shared badge
 * primitive across the How to Play page (loop beats, position pills, synergy
 * tiles, FAST/SLOW tags, ladder rungs, power systems). An optional staggered glow
 * pulse (reduced-motion safe via usePulse) makes a row of chips read as "live".
 */
export function TagChip({
  label,
  color,
  icon,
  sub,
  subColor,
  glowDelayMs,
  glowDurationMs = 1200,
  size = 'small',
}: TagChipProps) {
  const glow = glowDelayMs !== undefined;
  const { glowStyle } = usePulse(glowDurationMs, { delayMs: glowDelayMs ?? 0, paused: !glow });
  const fontSize = size === 'micro' ? FONT_SIZE.micro : FONT_SIZE.small;

  return (
    <View style={styles.wrap}>
      {glow ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.glow, { backgroundColor: color + '22' }, glowStyle]}
        />
      ) : null}
      <View style={[styles.chip, { borderColor: color, backgroundColor: color + '1a' }]}>
        {icon}
        <View style={styles.labels}>
          <MonoText style={[styles.label, { color, fontSize }]}>{label}</MonoText>
          {sub ? (
            <MonoText style={[styles.sub, subColor ? { color: subColor } : null]}>{sub}</MonoText>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  glow: {
    position: 'absolute',
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderRadius: RADIUS.chip,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
    paddingHorizontal: space(2),
    paddingVertical: space(1.5),
    borderWidth: BORDER.chunk,
    borderRadius: RADIUS.chip,
  },
  labels: { alignItems: 'flex-start' },
  label: { letterSpacing: 1 },
  sub: {
    color: palette.inkDim,
    fontSize: FONT_SIZE.micro,
    letterSpacing: 1,
    marginTop: 1,
  },
});
