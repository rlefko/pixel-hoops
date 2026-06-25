import { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from '@/components/StyledText';
import { PlayerCard } from '@/components/run/PlayerCard';
import { haptics } from '@/feel';
import { shareVictory } from '@/game/share';
import { victoryTier } from '@/game/victory-tier';
import { DIFFICULTY_LABELS } from '@/game/difficulty-mode';
import type { HallOfFameEntry } from '@/game/hall-of-fame';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * One championship banner in the Hall of Fame: a tier-colored card showing the
 * difficulty, ladder, final score, and opponent. Tap to drop down the starting
 * five who closed it out and a Share button. The tier color/stamp comes from the
 * shared victoryTier, so a legend banner reads conspicuously rarer than a rookie.
 */

interface HallOfFameCardProps {
  entry: HallOfFameEntry;
}

export function HallOfFameCard({ entry }: HallOfFameCardProps) {
  const [open, setOpen] = useState(false);
  const tier = victoryTier(entry.difficulty, entry.ladderClass);

  return (
    <View style={[styles.card, { borderColor: tier.color }]}>
      <Pressable
        style={styles.header}
        onPress={() => {
          haptics.selection();
          setOpen((v) => !v);
        }}
      >
        <View style={styles.headerMain}>
          <View style={styles.titleRow}>
            <Text style={[styles.stamp, { color: tier.color }]}>
              {tier.emoji} {tier.label}
            </Text>
            <Text style={styles.config}>
              {DIFFICULTY_LABELS[entry.difficulty].name} · {entry.ladderClass}
            </Text>
          </View>
          <View style={styles.scoreRow}>
            <Text style={styles.score}>
              {entry.finalHome} - {entry.finalAway}
            </Text>
            <Text style={styles.opponent} numberOfLines={1}>
              vs {entry.opponentName}
            </Text>
          </View>
        </View>
        <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
      </Pressable>

      {open ? (
        <View style={styles.drop}>
          <Text style={styles.dropLabel}>STARTING 5</Text>
          <View style={styles.five}>
            {entry.starters.map((rp, i) => (
              <View key={`${rp.player.name}-${i}`} style={styles.fiveRow}>
                <PlayerCard rp={rp} compact />
              </View>
            ))}
          </View>
          <Pressable style={styles.shareBtn} onPress={() => void shareVictory(entry)}>
            <Text style={styles.shareText}>SHARE</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    borderWidth: BORDER.chunk,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.bgPanel,
    padding: space(3),
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  headerMain: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stamp: { fontFamily: FONT.display, fontSize: FONT_SIZE.small },
  config: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, color: palette.inkDim },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: space(2), gap: space(2) },
  score: { fontFamily: FONT.display, fontSize: FONT_SIZE.h3, color: palette.makeGreen },
  opponent: { flex: 1, fontFamily: FONT.body, fontSize: FONT_SIZE.small, color: palette.inkDim },
  chevron: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    marginLeft: space(2),
  },
  drop: {
    marginTop: space(3),
    paddingTop: space(3),
    borderTopWidth: BORDER.thin,
    borderTopColor: palette.bgDeep,
  },
  dropLabel: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.gold,
    marginBottom: space(1),
  },
  five: { alignSelf: 'stretch' },
  fiveRow: {
    paddingVertical: space(0.75),
    borderBottomWidth: BORDER.thin,
    borderBottomColor: palette.bgDeep,
  },
  shareBtn: {
    marginTop: space(3),
    alignSelf: 'flex-start',
    paddingVertical: space(2),
    paddingHorizontal: space(6),
    borderWidth: BORDER.chunk,
    borderColor: palette.gold,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.gold + '1A',
  },
  shareText: { fontFamily: FONT.display, fontSize: FONT_SIZE.small, color: palette.gold },
});
