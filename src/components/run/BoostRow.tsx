import { View, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text } from '@/components/StyledText';
import { BOOST_BY_ID, type PassiveBoost } from '@/game/boosts';
import { useGlowPulse } from '@/feel';
import { RARITY_COLOR } from './rarity-ui';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/** A compact strip of the run's equipped passive boosts (shown on the map). */
export function BoostRow({ boosts }: { boosts: PassiveBoost[] }) {
  // One shared breathe for the strip's legendary chips (top-tier only); lower rarities stay
  // flat. Paused (no loop) when there is no legendary chip to animate.
  const hasLegendary = boosts.some((b) => BOOST_BY_ID[b.id]?.rarity === 'legendary');
  const glowStyle = useGlowPulse(900, { paused: !hasLegendary });
  if (boosts.length === 0) return null;
  return (
    <View style={styles.row}>
      {boosts.map((b) => {
        const def = BOOST_BY_ID[b.id];
        if (!def) return null;
        const color = RARITY_COLOR[def.rarity];
        const legendary = def.rarity === 'legendary';
        return (
          <Animated.View
            key={b.id}
            style={[styles.chip, { borderColor: color }, legendary && glowStyle]}
          >
            <Text style={[styles.name, { color }]} numberOfLines={1}>
              {def.name}
            </Text>
          </Animated.View>
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
});
