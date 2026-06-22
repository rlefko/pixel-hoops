import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Text } from '@/components/StyledText';
import { POSITION_COLOR } from '@/components/game/LineupBoard';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import type { Roster } from '@/types/roster';
import type { PlayerStats } from '@/types/player';

/** Training node: spend the visit to boost one stat of one player by +1. */

const STATS: { key: keyof PlayerStats; label: string }[] = [
  { key: 'shooting', label: 'SH' },
  { key: 'speed', label: 'SP' },
  { key: 'athleticism', label: 'AT' },
  { key: 'clutch', label: 'CL' },
];

const STAT_CAP = 10;

interface TrainingViewProps {
  roster: Roster;
  onTrain: (index: number, stat: keyof PlayerStats) => void;
  onSkip: () => void;
}

export function TrainingView({ roster, onTrain, onSkip }: TrainingViewProps) {
  const pool = [...roster.starters, ...roster.bench];
  return (
    <View style={styles.container}>
      <Text style={styles.title}>TRAINING</Text>
      <Text style={styles.subtitle}>Boost one stat (+1) for one player</Text>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
      >
        {pool.map((rp, i) => (
          <View key={i} style={styles.row}>
            <Text style={[styles.pos, { color: POSITION_COLOR[rp.position] }]}>
              {rp.position}
            </Text>
            <Text style={styles.name} numberOfLines={1}>
              {rp.player.name}
            </Text>
            <View style={styles.statButtons}>
              {STATS.map((s) => {
                const maxed = rp.player.stats[s.key] >= STAT_CAP;
                return (
                  <Pressable
                    key={s.key}
                    disabled={maxed}
                    onPress={() => onTrain(i, s.key)}
                    style={[styles.statBtn, maxed && styles.maxed]}
                  >
                    <Text style={styles.statBtnText}>
                      {s.label} {rp.player.stats[s.key]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>

      <Pressable onPress={onSkip}>
        <Text style={styles.skip}>Skip</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bgDeep,
    padding: space(4),
    paddingTop: space(10),
  },
  title: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h3,
    color: palette.makeGreen,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(2),
  },
  list: { marginTop: space(4), alignSelf: 'stretch' },
  listContent: { gap: space(2) },
  row: {
    borderBottomWidth: BORDER.thin,
    borderBottomColor: palette.bgPanel,
    paddingBottom: space(2),
  },
  pos: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro },
  name: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.ink,
    marginTop: space(1),
  },
  statButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space(2),
    marginTop: space(2),
  },
  statBtn: {
    paddingVertical: space(1),
    paddingHorizontal: space(2),
    borderWidth: BORDER.thin,
    borderColor: palette.makeGreen,
    borderRadius: RADIUS.chip,
  },
  maxed: { opacity: 0.3 },
  statBtnText: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.makeGreenLt,
  },
  skip: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(5),
  },
});
