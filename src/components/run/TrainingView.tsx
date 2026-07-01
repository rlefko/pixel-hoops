import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { StaggerIn, Counter } from '@/components/fx';
import { PlayerCard } from '@/components/run/PlayerCard';
import { StatNumber } from '@/components/run/StatNumber';
import { haptics, sfx } from '@/feel';
import { MAX_TRAINED_STAT, trainedStat } from '@/game/effects';
import { classForOvr } from '@/game/ratings';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import type { Roster } from '@/types/roster';
import type { PlayerStats } from '@/types/player';

/**
 * Training node: spend banked training points (earned by winning games) to boost
 * a player's skills, +1 per point. Run-scoped only, and the one way past the
 * normal 20 cap, up to 30 (the S++ ceiling). Points bank across the whole run.
 */

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

interface TrainingViewProps {
  roster: Roster;
  /** Banked training points available to spend (1 per point = +1 skill). */
  trainingPoints: number;
  onTrain: (index: number, stat: keyof PlayerStats) => void;
  onDone: () => void;
}

export function TrainingView({
  roster,
  trainingPoints,
  onTrain,
  onDone,
}: TrainingViewProps) {
  const pool = [...roster.starters, ...roster.bench];
  const noPoints = trainingPoints <= 0;
  return (
    <Screen style={styles.container}>
      <Text style={styles.title}>TRAINING</Text>
      <Text style={styles.subtitle}>
        <Counter value={trainingPoints} /> point
        {trainingPoints === 1 ? '' : 's'} to spend (+1 each, up to{' '}
        {MAX_TRAINED_STAT})
      </Text>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
      >
        {pool.map((rp, i) => (
          <StaggerIn key={i} index={i} style={styles.row}>
            <PlayerCard rp={rp} condition />
            <View style={styles.groups}>
              {STAT_GROUPS.map((group) => (
                <View key={group.label} style={styles.group}>
                  <Text style={styles.groupLabel}>{group.label}</Text>
                  <View style={styles.statButtons}>
                    {group.stats.map((s) => {
                      const trained = trainedStat(rp, s.key);
                      const disabled = trained >= MAX_TRAINED_STAT || noPoints;
                      return (
                        <Pressable
                          key={s.key}
                          disabled={disabled}
                          onPress={() => {
                            // A +1 that climbs the stat into a new class band gets
                            // the bigger beat (StatNumber pops the promotion too).
                            if (classForOvr(trained + 1) !== classForOvr(trained)) {
                              haptics.success();
                              sfx.tick(1.5);
                            } else {
                              haptics.selection();
                              sfx.tick();
                            }
                            onTrain(i, s.key);
                          }}
                          style={[styles.statBtn, disabled && styles.maxed]}
                        >
                          <View style={styles.statBtnLine}>
                            <Text style={styles.statBtnText}>{s.label}</Text>
                            <StatNumber
                              value={trained}
                              style={styles.statBtnText}
                            />
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          </StaggerIn>
        ))}
      </ScrollView>

      <Pressable onPress={onDone}>
        <Text style={styles.skip}>Done</Text>
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
  statBtnLine: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
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
