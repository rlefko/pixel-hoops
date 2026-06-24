import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from '@/components/StyledText';
import { PixelPlayer } from '@/components/fx';
import { InjuryIcon } from '@/components/run/PixelIcons';
import { jerseyNumber, skinIndexFor } from '@/components/game/jersey';
import { POSITION_COLOR } from '@/components/game/positionColor';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import type { Roster } from '@/types/roster';

/**
 * The party bar (pokelike-style): the player's five starters shown as pixel
 * avatars with position and a short name, plus a bench-depth chip, so the squad
 * has a constant presence on the map. Tapping it opens the lineup builder.
 */

interface RosterStripProps {
  roster: Roster;
  onPress?: () => void;
}

/** Short, single-token first name for the tight strip. */
function shortName(name: string): string {
  return name.split(' ')[0];
}

export function RosterStrip({ roster, onPress }: RosterStripProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={styles.bar}
      accessibilityRole="button"
      accessibilityLabel="Open lineup builder"
    >
      <View style={styles.headingRow}>
        <Text style={styles.heading}>YOUR SQUAD</Text>
        {onPress ? <Text style={styles.edit}>EDIT</Text> : null}
      </View>
      <View style={styles.row}>
        {roster.starters.map((rp, i) => {
          const out = rp.gamesOut ?? 0;
          return (
            <View key={i} style={[styles.member, out > 0 && styles.injured]}>
              <View style={styles.avatar}>
                <PixelPlayer
                  color={palette.homeTeam}
                  accent={palette.homeTeamAccent}
                  number={rp.jerseyNumber ?? jerseyNumber(rp.player.name)}
                  skinIndex={skinIndexFor(rp.player.name)}
                  size={24}
                />
                {out > 0 ? (
                  <View style={styles.injuryBadge}>
                    <InjuryIcon size={10} />
                  </View>
                ) : null}
              </View>
              <View style={[styles.posChip, { borderColor: POSITION_COLOR[rp.position] }]}>
                <Text style={[styles.pos, { color: POSITION_COLOR[rp.position] }]}>
                  {rp.position}
                </Text>
              </View>
              <Text style={styles.name} numberOfLines={1}>
                {out > 0 ? `OUT ${out}` : shortName(rp.player.name)}
              </Text>
            </View>
          );
        })}
        {roster.bench.length > 0 ? (
          <View style={styles.bench}>
            <Text style={styles.benchCount}>+{roster.bench.length}</Text>
            <Text style={styles.benchLabel}>BENCH</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: palette.bgPanel,
    borderTopWidth: BORDER.chunk,
    borderTopColor: palette.courtLine + 'AA',
    paddingHorizontal: space(3),
    paddingTop: space(2),
    paddingBottom: space(3),
  },
  headingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space(1),
  },
  heading: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.gold,
  },
  edit: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.micro,
    color: palette.steelBlue,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
  },
  member: {
    alignItems: 'center',
    width: 48,
  },
  injured: { opacity: 0.5 },
  avatar: { position: 'relative' },
  injuryBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
  },
  posChip: {
    paddingHorizontal: space(1),
    borderWidth: BORDER.thin,
    borderRadius: RADIUS.chip,
    marginTop: space(0.5),
  },
  pos: {
    fontFamily: FONT.display,
    fontSize: 7,
  },
  name: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
    marginTop: 1,
    maxWidth: 48,
  },
  bench: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
  },
  benchCount: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
    color: palette.ink,
  },
  benchLabel: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
  },
});
