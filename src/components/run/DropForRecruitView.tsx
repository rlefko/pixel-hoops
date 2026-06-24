import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { PlayerCard } from '@/components/run/PlayerCard';
import { MAX_RUN_ROSTER } from '@/game/draft';
import type { Roster, RosterPlayer } from '@/types/roster';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * The 12-man cap drop: recruiting past {@link MAX_RUN_ROSTER} forces a choice of
 * who to drop for the incoming player. Dropping returns any held item to the bag
 * (handled by the reducer). Tap a current player to drop them and take the recruit.
 */
interface DropForRecruitViewProps {
  incoming: RosterPlayer;
  roster: Roster;
  onDrop: (index: number) => void;
}

export function DropForRecruitView({ incoming, roster, onDrop }: DropForRecruitViewProps) {
  const all = [...roster.starters, ...roster.bench];
  return (
    <Screen style={styles.container}>
      <Text style={styles.title}>SQUAD FULL</Text>
      <Text style={styles.subtitle}>
        Your rotation is at {MAX_RUN_ROSTER}. Drop a player to sign:
      </Text>
      <View style={styles.incoming}>
        <PlayerCard rp={incoming} />
      </View>
      <Text style={styles.sectionLabel}>TAP A PLAYER TO DROP</Text>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {all.map((rp, i) => (
          <Pressable key={`${rp.player.name}-${i}`} onPress={() => onDrop(i)} style={styles.row}>
            <PlayerCard rp={rp} compact />
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space(4) },
  title: { fontFamily: FONT.display, fontSize: FONT_SIZE.h3, color: palette.gold, textAlign: 'center' },
  subtitle: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(2),
  },
  incoming: {
    marginTop: space(3),
    padding: space(2),
    borderWidth: BORDER.chunk,
    borderColor: palette.gold,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.gold + '14',
  },
  sectionLabel: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
    marginTop: space(3),
  },
  list: { marginTop: space(1), alignSelf: 'stretch' },
  listContent: { gap: space(1), paddingBottom: space(4) },
  row: {
    padding: space(2),
    borderWidth: BORDER.thin,
    borderColor: palette.bgPanel,
    borderRadius: RADIUS.chip,
  },
});
