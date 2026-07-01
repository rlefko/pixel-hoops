import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/StyledText';
import {
  DIFFICULTIES,
  LADDER_CLASSES,
  DIFFICULTY_LABELS,
  isCellCleared,
  type Difficulty,
  type LadderClass,
} from '@/game/difficulty-mode';
import { victoryTier } from '@/game/victory-tier';
import { VictoryTierIcon, CrownIcon } from '@/components/run/PixelIcons';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * A compact 4x5 grid of the (difficulty x ladder class) prestige crests, one per
 * Championship Bounty cell, earned by clearing that exact cell (cross-difficulty jumps
 * leave the skipped cells open as goals to come back for; a pre-v16 veteran's past
 * clears are seeded on load). The insane:S+ apex renders as the gold Grandmaster crown.
 * Empty slots read as a completionist checklist (the Balatro-sticker hook): "20 crests
 * to collect."
 */
export function BountyCrestShelf({ clearedCells }: { clearedCells: readonly string[] }) {
  const conquered = (d: Difficulty, cls: LadderClass) => isCellCleared(clearedCells, d, cls);
  const earned = DIFFICULTIES.reduce(
    (n, d) => n + LADDER_CLASSES.filter((cls) => conquered(d, cls)).length,
    0
  );

  return (
    <View style={styles.shelf}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>BOUNTY CRESTS</Text>
        <Text style={styles.count}>{earned}/20</Text>
      </View>
      <View style={styles.row}>
        <View style={styles.rowLabelSpacer} />
        {LADDER_CLASSES.map((cls) => (
          <Text key={cls} style={styles.colLabel}>
            {cls}
          </Text>
        ))}
      </View>
      {DIFFICULTIES.map((d) => (
        <View key={d} style={styles.row}>
          <Text style={styles.rowLabel}>{DIFFICULTY_LABELS[d].name}</Text>
          {LADDER_CLASSES.map((cls) => {
            if (!conquered(d, cls)) {
              return <View key={cls} style={[styles.cell, styles.cellEmpty]} />;
            }
            const tier = victoryTier(d, cls);
            const isApex = d === 'insane' && cls === 'S+';
            return (
              <View key={cls} style={styles.cell}>
                {isApex ? (
                  <CrownIcon size={16} color={palette.gold} />
                ) : (
                  <VictoryTierIcon tier={tier.key} size={16} color={tier.color} />
                )}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const CELL = 30;

const styles = StyleSheet.create({
  shelf: {
    borderWidth: BORDER.thin,
    borderColor: palette.gold + '44',
    borderRadius: RADIUS.chip,
    backgroundColor: palette.gold + '0A',
    padding: space(3),
    gap: space(1),
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space(1),
  },
  title: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.small,
    color: palette.gold,
  },
  count: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowLabel: {
    width: 52,
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
  },
  rowLabelSpacer: { width: 52 },
  colLabel: {
    width: CELL,
    textAlign: 'center',
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
  },
  cell: {
    width: CELL,
    height: CELL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellEmpty: {
    // A dim placeholder square: the slot still to be earned.
    borderWidth: BORDER.thin,
    borderColor: palette.inkDim + '33',
    borderRadius: RADIUS.chip,
    transform: [{ scale: 0.5 }],
  },
});
