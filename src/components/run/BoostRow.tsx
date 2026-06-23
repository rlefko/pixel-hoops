import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/StyledText';
import { BOOST_BY_ID, type PassiveBoost } from '@/game/boosts';
import { BOOST_FAMILY_COLOR } from './boost-ui';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/** A compact strip of the run's equipped passive boosts (shown on the map). */
export function BoostRow({ boosts }: { boosts: PassiveBoost[] }) {
  if (boosts.length === 0) return null;
  return (
    <View style={styles.row}>
      {boosts.map((b) => {
        const def = BOOST_BY_ID[b.id];
        if (!def) return null;
        const color = BOOST_FAMILY_COLOR[def.family];
        return (
          <View key={b.id} style={[styles.chip, { borderColor: color }]}>
            <Text style={[styles.name, { color }]} numberOfLines={1}>
              {def.name}
            </Text>
            {def.maxTier > 1 ? <Text style={styles.tier}>{'★'.repeat(b.tier)}</Text> : null}
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1),
    paddingHorizontal: space(2),
    paddingVertical: space(0.5),
    borderWidth: BORDER.thin,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.bgPanel,
  },
  name: { fontFamily: FONT.body, fontSize: FONT_SIZE.micro },
  tier: { fontFamily: FONT.body, fontSize: FONT_SIZE.micro, color: palette.gold },
});
