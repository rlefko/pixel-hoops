import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/StyledText';
import type { PassiveBoost } from '@/game/boosts';
import { resolveSets } from '@/game/sets';
import type { RosterPlayer } from '@/types/roster';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * A compact strip of synergy sets on the map: active sets read solid (purple, the
 * reward-chrome color), and the one or two closest in-progress sets show a "have/need"
 * ghost chip so the player can chase a completion. Hidden when nothing is active or
 * even partially built.
 */
export function SetRow({ five, boosts }: { five: RosterPlayer[]; boosts: PassiveBoost[] }) {
  const { progress } = resolveSets(five, boosts);
  const ratio = (p: { have: number; need: number }): number => (p.need ? p.have / p.need : 0);
  const shown = progress
    .filter((p) => p.met || p.have > 0)
    .sort((a, b) => Number(b.met) - Number(a.met) || ratio(b) - ratio(a))
    .slice(0, 4);

  if (shown.length === 0) return null;

  return (
    <View style={styles.row}>
      {shown.map((p) => {
        const color = p.met ? palette.purple : palette.inkDim;
        return (
          <View key={p.def.id} style={[styles.chip, { borderColor: color, opacity: p.met ? 1 : 0.75 }]}>
            <Text style={[styles.name, { color }]} numberOfLines={1}>
              {p.met ? p.def.name : `${p.have}/${p.need} ${p.def.name}`}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space(1.5),
    paddingHorizontal: space(4),
    paddingBottom: space(1),
  },
  chip: {
    paddingHorizontal: space(2),
    paddingVertical: space(0.5),
    borderWidth: BORDER.thin,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.bgPanel,
  },
  name: { fontFamily: FONT.body, fontSize: FONT_SIZE.micro },
});
