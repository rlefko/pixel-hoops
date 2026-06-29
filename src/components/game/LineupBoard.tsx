import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/StyledText';
import { PlayerCard } from '@/components/run/PlayerCard';
import { POSITION_COLOR } from '@/components/game/positionColor';
import { CLASS_COLOR } from '@/components/run/class-ui';
import { ovr, tierFor } from '@/game/ratings';
import { derivePlaystyle } from '@/game/playstyle';
import { applyTrainingDelta } from '@/game/effects';
import { palette, FONT, FONT_SIZE, space, BORDER, RADIUS } from '@/theme';
import type { Team } from '@/types/team';
import type { RosterPlayer } from '@/types/roster';

/** Pregame roster view: the five by position, their stats, and active synergies. */

// Re-exported for existing importers; the source of truth is positionColor.ts.
export { POSITION_COLOR };

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
  /**
   * The slimmest read: a box-score-height name list (position, name, OVR) with no
   * player sprites and no synergy labels, so the scouting report stays short.
   * Overrides {@link compact}.
   */
  dense?: boolean;
}

/**
 * A single box-score-height roster row, no sprite: position, class, the player's
 * name with their playstyle as an italic subtitle (name • playstyle), and the OVR.
 * Position, class, and OVR are color-coded (slot color and class tier), so the
 * row stays a legible at-a-glance read.
 */
function DenseRow({ rp, condition }: { rp: RosterPlayer; condition: boolean }) {
  const stats = applyTrainingDelta(rp.player.stats, rp.trainingDelta);
  const overall = ovr(stats, rp.position);
  const tier = tierFor(overall);
  const classColor = CLASS_COLOR[tier.label];
  const playstyle = derivePlaystyle(stats, rp.position).label;
  const injured = condition && (rp.gamesOut ?? 0) > 0;
  return (
    <View style={[styles.denseRow, injured && styles.denseInjured]}>
      <Text style={[styles.densePos, { color: POSITION_COLOR[rp.position] }]}>{rp.position}</Text>
      <View style={[styles.denseClass, { borderColor: classColor }]}>
        <Text style={[styles.denseClassText, { color: classColor }]}>{tier.label}</Text>
      </View>
      <View style={styles.denseMid}>
        <Text style={styles.denseLine} numberOfLines={1}>
          <Text style={[styles.denseName, rp.legendary && styles.denseLegend]}>{rp.player.name}</Text>
          {injured ? (
            <Text style={styles.denseOut}> • OUT {rp.gamesOut}</Text>
          ) : (
            <Text style={styles.denseStyle}> • {playstyle}</Text>
          )}
        </Text>
      </View>
      <Text style={[styles.denseOvr, { color: classColor }]}>{overall}</Text>
    </View>
  );
}

export function LineupBoard({
  team,
  players,
  condition = false,
  steppingIn,
  compact = false,
  dense = false,
}: LineupBoardProps) {
  const lineup = players ?? team.lineup.players;
  return (
    <View style={styles.wrap}>
      {lineup.map((rp, i) =>
        dense ? (
          <DenseRow key={i} rp={rp} condition={condition} />
        ) : (
          <View key={i} style={[styles.row, compact && styles.rowCompact]}>
            <PlayerCard rp={rp} condition={condition} compact={compact} />
          </View>
        )
      )}
      {steppingIn && steppingIn.length > 0 ? (
        <View style={styles.steppingIn}>
          <Text style={styles.steppingInLabel}>STEPPING IN</Text>
          <Text style={styles.steppingInNames} numberOfLines={2}>
            {steppingIn.map((p) => p.player.name).join(', ')}
          </Text>
        </View>
      ) : null}
      {!dense && team.synergy.labels.length > 0 ? (
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
  // No `gap` here: RN-web miscomputes a flex:1 child's width with gap and pushes
  // the OVR off-screen. Use fixed-width columns + marginRight, like BoxScoreView.
  denseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space(1),
    borderBottomWidth: BORDER.thin,
    borderBottomColor: palette.bgPanel,
  },
  denseInjured: { opacity: 0.5 },
  densePos: {
    width: space(6),
    marginRight: space(1.5),
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
  },
  // The class as a small bordered badge (border in the class color), matching the
  // tier/position chips elsewhere in the game.
  denseClass: {
    width: space(8),
    marginRight: space(2),
    alignItems: 'center',
    paddingVertical: space(0.25),
    borderWidth: BORDER.thin,
    borderRadius: RADIUS.chip,
  },
  denseClassText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
  },
  // A flex:1 wrapper with minWidth 0 so it shrinks and the OVR sibling stays on
  // screen (a flex:1 Text alone overflows in RN-web). Mirrors BoxScoreView.cellName.
  denseMid: {
    flex: 1,
    minWidth: 0,
    marginRight: space(1.5),
  },
  // The name (title) and playstyle (italic subtitle) share one truncating line.
  denseLine: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
  },
  denseName: {
    color: palette.ink,
    fontWeight: '700',
  },
  denseLegend: { color: palette.gold },
  denseStyle: {
    color: palette.inkDim,
    fontStyle: 'italic',
  },
  denseOut: { color: palette.injury },
  denseOvr: {
    width: space(8),
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.small,
    textAlign: 'right',
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
