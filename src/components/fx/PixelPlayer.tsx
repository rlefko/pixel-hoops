import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/StyledText';
import { palette, FONT } from '@/theme';

/**
 * A procedural 8-bit player sprite drawn with plain Views (no image assets): a
 * head, a team-colored jersey with a number, shorts, and legs. `active` lights
 * the sprite up (gold ring) for the player making the current play. Kept tiny
 * and crisp so a full ten-player floor reads at a glance.
 */

const SKIN_TONES = ['#F2C8A0', '#E0A878', '#C68642', '#8D5524', '#5C3A21'];

interface PixelPlayerProps {
  /** Jersey color (the team's colorHex). */
  color: string;
  /** Jersey number shown on the chest. */
  number: number;
  /** Sprite footprint in px (height scales from this). */
  size?: number;
  /** Picks a skin tone deterministically; defaults to the first. */
  skinIndex?: number;
  /** Highlights the sprite as the player making the current play. */
  active?: boolean;
}

export function PixelPlayer({
  color,
  number,
  size = 30,
  skinIndex = 0,
  active = false,
}: PixelPlayerProps) {
  const skin = SKIN_TONES[skinIndex % SKIN_TONES.length];
  const head = size * 0.36;
  const jerseyW = size * 0.74;
  const jerseyH = size * 0.5;
  const legW = size * 0.28;
  const legH = size * 0.34;

  return (
    <View style={[styles.wrap, { width: size }]}>
      {active ? (
        <View
          style={[
            styles.ring,
            { width: size + 6, height: size * 1.5 + 6, borderColor: palette.gold },
          ]}
        />
      ) : null}
      <View
        style={[styles.head, { width: head, height: head, backgroundColor: skin }]}
      />
      <View
        style={[
          styles.jersey,
          {
            width: jerseyW,
            height: jerseyH,
            backgroundColor: color,
            borderColor: active ? palette.gold : palette.bgPanel,
          },
        ]}
      >
        <Text style={[styles.number, { fontSize: Math.max(7, size * 0.26) }]}>
          {number}
        </Text>
      </View>
      <View style={styles.legs}>
        <View style={[styles.leg, { width: legW, height: legH }]} />
        <View style={[styles.leg, { width: legW, height: legH }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  ring: {
    position: 'absolute',
    top: -3,
    borderWidth: 2,
    borderRadius: 2,
  },
  head: {
    borderWidth: 1,
    borderColor: palette.bgPanel,
  },
  jersey: {
    marginTop: -1,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: {
    fontFamily: FONT.display,
    color: palette.ink,
  },
  legs: {
    flexDirection: 'row',
    gap: 2,
    marginTop: -1,
  },
  leg: {
    backgroundColor: palette.bgPanel,
  },
});
