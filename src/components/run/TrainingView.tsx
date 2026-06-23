import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { PlayerCard } from '@/components/run/PlayerCard';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import type { Roster } from '@/types/roster';
import type { PlayerStats } from '@/types/player';

/** Training node: spend the visit to boost one stat of one player by +1. */

interface StatDef {
  key: keyof PlayerStats;
  label: string;
}

/**
 * The eight trainable skills grouped the way the cards present them, so the
 * busy button grid reads as three short rows instead of one long one. Stamina
 * and durability are condition, not skills, so they are not trainable here.
 */
const STAT_GROUPS: { label: string; stats: StatDef[] }[] = [
  {
    label: 'OFFENSE',
    stats: [
      { key: 'inside', label: 'IN' },
      { key: 'outside', label: 'OUT' },
      { key: 'playmaking', label: 'PM' },
    ],
  },
  {
    label: 'DEFENSE',
    stats: [
      { key: 'perimeterD', label: 'PD' },
      { key: 'interiorD', label: 'ID' },
    ],
  },
  {
    label: 'PHYSICAL + MENTAL',
    stats: [
      { key: 'athleticism', label: 'AT' },
      { key: 'iq', label: 'IQ' },
      { key: 'clutch', label: 'CL' },
    ],
  },
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
    <Screen style={styles.container}>
      <Text style={styles.title}>TRAINING</Text>
      <Text style={styles.subtitle}>Boost one stat (+1) for one player</Text>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
      >
        {pool.map((rp, i) => (
          <View key={i} style={styles.row}>
            <PlayerCard rp={rp} condition />
            <View style={styles.groups}>
              {STAT_GROUPS.map((group) => (
                <View key={group.label} style={styles.group}>
                  <Text style={styles.groupLabel}>{group.label}</Text>
                  <View style={styles.statButtons}>
                    {group.stats.map((s) => {
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
            </View>
          </View>
        ))}
      </ScrollView>

      <Pressable onPress={onSkip}>
        <Text style={styles.skip}>Skip</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: space(4),
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
  listContent: { gap: space(3) },
  row: {
    borderBottomWidth: BORDER.thin,
    borderBottomColor: palette.bgPanel,
    paddingBottom: space(3),
  },
  groups: {
    marginTop: space(2),
    gap: space(2),
  },
  group: { gap: space(1) },
  groupLabel: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
  },
  statButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space(2),
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
