import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/StyledText';
import type { PassiveBoost } from '@/game/boosts';
import { resolveSets } from '@/game/sets';
import type { RosterPlayer } from '@/types/roster';
import { SYNERGY_CHROME } from './rarity-ui';
import { summarizeSetBonus } from './set-ui';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * A compact strip of synergy sets on the map: active sets read solid (flame, the
 * synergy color) with their effect, and the one or two closest in-progress sets show
 * a dimmed "have/need" chip so the player can chase a completion. Each chip names the
 * set and its bonus, e.g. "Track Meet (+2 pace, +1 ath)". Hidden when nothing is
 * active or even partially built.
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
        const color = p.met ? SYNERGY_CHROME : palette.inkDim;
        const head = p.met ? p.def.name : `${p.have}/${p.need} ${p.def.name}`;
        const effect = summarizeSetBonus(p.def.bonus);
        return (
          <View key={p.def.id} style={[styles.chip, { borderColor: color, opacity: p.met ? 1 : 0.75 }]}>
            <Text style={[styles.name, { color }]} numberOfLines={1}>
              {effect ? `${head} (${effect})` : head}
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
