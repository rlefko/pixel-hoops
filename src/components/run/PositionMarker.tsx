import { View, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text } from '@/components/StyledText';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import { usePulse } from '@/feel';
import { nodeTop } from './map-geometry';

/**
 * The "you are here" token: a small chip with a down chevron that floats in the
 * row's headroom above the current node, so it never clips even on the top row.
 * Gently bobs (steady under reduced motion). At run start there is no current
 * node, so EntryBanner prompts the player to pick their first game instead.
 */

const MARKER_W = 96;
const MARKER_H = 26;

export function PositionMarker({ centerX, layer }: { centerX: number; layer: number }) {
  const { bobStyle } = usePulse(1100);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.marker,
        { left: centerX - MARKER_W / 2, top: nodeTop(layer) - MARKER_H - 6 },
        bobStyle,
      ]}
    >
      <View style={styles.chip}>
        <Text style={styles.chipText}>YOU ARE HERE</Text>
      </View>
      <View style={styles.chevron} />
    </Animated.View>
  );
}

export function EntryBanner({ width }: { width: number }) {
  const { glowStyle } = usePulse(1100);
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.banner, { width, top: space(2) }, glowStyle]}
    >
      <Text style={styles.bannerText}>TIP-OFF: CHOOSE YOUR FIRST GAME</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  marker: {
    position: 'absolute',
    width: MARKER_W,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: space(2),
    paddingVertical: space(1),
    backgroundColor: palette.bgPanel,
    borderWidth: BORDER.thin,
    borderColor: palette.gold,
    borderRadius: RADIUS.chip,
  },
  chipText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.gold,
  },
  chevron: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: palette.gold,
  },
  banner: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
    paddingVertical: space(1.5),
    backgroundColor: palette.bgPanel,
    borderWidth: BORDER.thin,
    borderColor: palette.gold,
    borderRadius: RADIUS.chip,
  },
  bannerText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.gold,
  },
});
