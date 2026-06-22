import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/StyledText';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import type { Position } from '@/types/roster';
import type { Team } from '@/types/team';

/** Pregame roster view: the five by position, their stats, and active synergies. */

export const POSITION_COLOR: Record<Position, string> = {
  PG: palette.steelBlue,
  SG: palette.makeGreenLt,
  SF: palette.gold,
  PF: palette.orange,
  C: palette.missRedLt,
};

export function LineupBoard({ team }: { team: Team }) {
  return (
    <View style={styles.wrap}>
      {team.lineup.players.map((rp, i) => (
        <View key={i} style={styles.row}>
          <View
            style={[
              styles.posChip,
              { borderColor: POSITION_COLOR[rp.position] },
            ]}
          >
            <Text style={[styles.pos, { color: POSITION_COLOR[rp.position] }]}>
              {rp.position}
            </Text>
          </View>
          <Text style={styles.name} numberOfLines={1}>
            {rp.player.name}
          </Text>
          <Text style={styles.stats}>
            SH{rp.player.stats.shooting} SP{rp.player.stats.speed} AT
            {rp.player.stats.athleticism}
          </Text>
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
  posChip: {
    width: 34,
    paddingVertical: space(0.5),
    borderWidth: BORDER.chunk,
    borderRadius: RADIUS.chip,
    alignItems: 'center',
    marginRight: space(2),
  },
  pos: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
  },
  name: {
    flex: 1,
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.ink,
  },
  stats: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
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
