import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/StyledText';
import { PlayerCard } from '@/components/run/PlayerCard';
import { palette, FONT, FONT_SIZE, space, BORDER } from '@/theme';
import type { Team } from '@/types/team';

/** Pregame roster view: the five by position, their stats, and active synergies. */

// Re-exported for existing importers; the source of truth is positionColor.ts.
export { POSITION_COLOR } from '@/components/game/positionColor';

export function LineupBoard({ team }: { team: Team }) {
  return (
    <View style={styles.wrap}>
      {team.lineup.players.map((rp, i) => (
        <View key={i} style={styles.row}>
          <PlayerCard rp={rp} />
        </View>
      ))}
      {team.synergy.labels.length > 0 ? (
        <View style={styles.synergyRow}>
          {team.synergy.labels.map((label) => (
            <Text key={label} style={styles.synergy}>
              {'★'} {label}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space(1.5),
    borderBottomWidth: BORDER.thin,
    borderBottomColor: palette.bgPanel,
  },
  synergyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: space(2),
  },
  synergy: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.gold,
    marginRight: space(3),
    marginTop: space(1),
  },
});
