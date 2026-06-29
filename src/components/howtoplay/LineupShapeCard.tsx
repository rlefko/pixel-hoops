import { View, StyleSheet } from 'react-native';
import { MonoText } from '@/components/StyledText';
import { palette, space, FONT_SIZE } from '@/theme';
import type { Position } from '@/types/roster';
import { PositionPips } from './PositionPips';
import { TagChip } from './TagChip';

export interface ShapeTag {
  label: string;
  color: string;
}

/**
 * One half of the "your lineup is the plan" contrast: a roster shape (guard-heavy
 * or big-heavy) drawn as PositionPips, an arrow, and the tempo/shot tags it
 * produces. The lead tempo tag pulses at `pulseDurationMs`, so the FAST vs SLOW
 * contrast reads through motion as well as color.
 */
export function LineupShapeCard({
  title,
  positions,
  tags,
  pulseDurationMs,
}: {
  title: string;
  positions: Position[];
  tags: ShapeTag[];
  pulseDurationMs: number;
}) {
  return (
    <View style={styles.card}>
      <MonoText style={styles.title}>{title}</MonoText>
      <PositionPips positions={positions} size={12} />
      <MonoText style={styles.arrow}>{'↓'}</MonoText>
      <View style={styles.tags}>
        {tags.map((t, i) => (
          <TagChip
            key={t.label}
            label={t.label}
            color={t.color}
            size="micro"
            // Only the lead tempo tag pulses; undefined leaves the rest steady.
            glowDelayMs={i === 0 ? 0 : undefined}
            glowDurationMs={pulseDurationMs}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    alignItems: 'center',
    gap: space(2),
    paddingVertical: space(2),
  },
  title: { color: palette.inkDim, fontSize: FONT_SIZE.small, letterSpacing: 1 },
  arrow: { color: palette.inkDim, fontSize: 14 },
  tags: { alignItems: 'center', gap: space(1.5) },
});
