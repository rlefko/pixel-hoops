import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/StyledText';
import { PlayerCard } from '@/components/run/PlayerCard';
import { palette, FONT, FONT_SIZE, space, BORDER } from '@/theme';
import type { Team } from '@/types/team';
import type { RosterPlayer } from '@/types/roster';

/** Pregame roster view: the five by position, their stats, and active synergies. */

// Re-exported for existing importers; the source of truth is positionColor.ts.
export { POSITION_COLOR } from '@/components/game/positionColor';

interface LineupBoardProps {
  team: Team;
  /**
   * Render these starters instead of the team's dressed five: pass the player's
   * chosen starters so an injured one stays in their slot (marked OUT) rather than
   * being silently swapped out. Defaults to the dressed five (the away board).
   */
  players?: RosterPlayer[];
  /** Surface each card's injury condition (the OUT badge), for the home board. */
  condition?: boolean;
  /** Healthy subs starting in place of injured starters, named below the five. */
  steppingIn?: RosterPlayer[];
  /** Slim each card to a single row (drops the OFF/DEF/ATH chips) to save height. */
  compact?: boolean;
}

export function LineupBoard({
  team,
  players,
  condition = false,
  steppingIn,
  compact = false,
}: LineupBoardProps) {
  const lineup = players ?? team.lineup.players;
  return (
    <View style={styles.wrap}>
      {lineup.map((rp, i) => (
        <View key={i} style={[styles.row, compact && styles.rowCompact]}>
          <PlayerCard rp={rp} condition={condition} compact={compact} />
        </View>
      ))}
      {steppingIn && steppingIn.length > 0 ? (
        <View style={styles.steppingIn}>
          <Text style={styles.steppingInLabel}>STEPPING IN</Text>
          <Text style={styles.steppingInNames} numberOfLines={2}>
            {steppingIn.map((p) => p.player.name).join(', ')}
          </Text>
        </View>
      ) : null}
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
  // Must stay a column (no flexDirection: 'row'). The single PlayerCard child fills
  // width via its own alignSelf: 'stretch', which only stretches the main axis when
  // this wrapper is a column. A row wrapper stretches the card's height instead, which
  // collapses the flex: 1 name to zero width on native (invisible names on device,
  // though fine on web where the browser sizes the card to its content). This was the
  // real cause of the recurring blank scouting-report names.
  row: {
    paddingVertical: space(1.5),
    borderBottomWidth: BORDER.thin,
    borderBottomColor: palette.bgPanel,
  },
  rowCompact: {
    paddingVertical: space(0.75),
  },
  steppingIn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    marginTop: space(2),
    paddingTop: space(2),
    borderTopWidth: BORDER.thin,
    borderTopColor: palette.bgPanel,
  },
  steppingInLabel: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.injury,
  },
  steppingInNames: {
    flex: 1,
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
