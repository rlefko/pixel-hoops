import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from '@/components/StyledText';
import { POSITION_COLOR } from '@/components/game/LineupBoard';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import type { RosterPlayer } from '@/types/roster';

/** Recruit node: pick one of a few depth-scaled candidates for your bench. */

interface RecruitViewProps {
  offers: RosterPlayer[];
  benchCount: number;
  onRecruit: (player: RosterPlayer) => void;
  onSkip: () => void;
}

export function RecruitView({
  offers,
  benchCount,
  onRecruit,
  onSkip,
}: RecruitViewProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>RECRUIT</Text>
      <Text style={styles.subtitle}>
        Add one to your bench ({benchCount} benched)
      </Text>

      <View style={styles.offers}>
        {offers.map((rp, i) => (
          <Pressable key={i} style={styles.card} onPress={() => onRecruit(rp)}>
            <View
              style={[
                styles.posChip,
                { borderColor: POSITION_COLOR[rp.position] },
              ]}
            >
              <Text
                style={[styles.pos, { color: POSITION_COLOR[rp.position] }]}
              >
                {rp.position}
              </Text>
            </View>
            <Text style={styles.name} numberOfLines={1}>
              {rp.player.name}
            </Text>
            <Text style={styles.stats}>
              SH{rp.player.stats.shooting} SP{rp.player.stats.speed} AT
              {rp.player.stats.athleticism} CL{rp.player.stats.clutch}
            </Text>
          </Pressable>
        ))}
      </View>

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
    padding: space(5),
    paddingTop: space(10),
  },
  title: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h3,
    color: palette.steelBlue,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(2),
  },
  offers: { marginTop: space(6), gap: space(3) },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space(3),
    borderWidth: BORDER.chunk,
    borderColor: palette.bgPanel,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.bgPanel,
  },
  posChip: {
    width: 34,
    paddingVertical: space(0.5),
    borderWidth: BORDER.chunk,
    borderRadius: RADIUS.chip,
    alignItems: 'center',
    marginRight: space(2),
  },
  pos: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro },
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
  skip: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(6),
  },
});
