import { Fragment, type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { MonoText } from '@/components/StyledText';
import { palette, space } from '@/theme';
import { TagChip } from './TagChip';

export interface LoopBeat {
  icon: ReactNode;
  word: string;
  color: string;
}

/**
 * The DRAFT > SET > WATCH > WIN > GROW marquee: each beat is a TagChip with a
 * staggered glow so brightness travels left to right like a cabinet marquee,
 * implying the loop is always turning. Wraps gracefully on narrow screens.
 */
export function LoopStrip({ beats }: { beats: LoopBeat[] }) {
  return (
    <View style={styles.row}>
      {beats.map((b, i) => (
        <Fragment key={b.word}>
          {i > 0 ? <MonoText style={styles.chevron}>{'›'}</MonoText> : null}
          <TagChip
            label={b.word}
            color={b.color}
            icon={b.icon}
            size="micro"
            glowDelayMs={i * 150}
          />
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(1.5),
  },
  chevron: { color: palette.inkDim, fontSize: 14 },
});
