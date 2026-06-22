import { View, StyleSheet } from 'react-native';
import { palette, BORDER } from '@/theme';

/**
 * A decorative, programmatic 8-bit basketball court drawn with plain Views (no
 * sprite art): half-court line, center circle, two keys, two rims. Sits behind
 * the play-by-play feed to give the sim a sense of place. Colors are themed per
 * matchup (the opponent's arena, see courtThemeFor), defaulting to the house
 * palette. Geometry stays fixed so the ball-flight math can target the rims.
 */

/** Key height in px; the rim sits at its far edge. Exported for ball flight. */
export const KEY_HEIGHT = 88;
const KEY_WIDTH = 84;
/** Rim thickness in px. */
export const RIM_HEIGHT = 6;
/** Distance from the baseline to the rim's top edge (rim straddles the key line). */
export const RIM_OFFSET = KEY_HEIGHT - RIM_HEIGHT / 2;

interface PixelCourtProps {
  /** Floor fill. Defaults to the house court color. */
  floorColor?: string;
  /** Border, center line, circle, and keys. Defaults to the house court line. */
  lineColor?: string;
  /** Rim color. Defaults to the brand orange. */
  accentColor?: string;
}

export function PixelCourt({
  floorColor = palette.bgCourt,
  lineColor = palette.courtLine,
  accentColor = palette.orange,
}: PixelCourtProps) {
  return (
    <View
      style={[styles.court, { backgroundColor: floorColor, borderColor: lineColor }]}
    >
      <View style={[styles.centerLine, { backgroundColor: lineColor }]} />
      <View style={[styles.centerCircle, { borderColor: lineColor }]} />
      <View style={[styles.key, styles.keyTop, { borderColor: lineColor }]} />
      <View style={[styles.key, styles.keyBottom, { borderColor: lineColor }]} />
      <View style={[styles.rim, styles.rimTop, { backgroundColor: accentColor }]} />
      <View
        style={[styles.rim, styles.rimBottom, { backgroundColor: accentColor }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  court: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: BORDER.chunk,
    overflow: 'hidden',
  },
  centerLine: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: BORDER.chunk,
  },
  centerCircle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 64,
    height: 64,
    marginTop: -32,
    marginLeft: -32,
    borderRadius: 32,
    borderWidth: BORDER.chunk,
  },
  key: {
    position: 'absolute',
    left: '50%',
    width: KEY_WIDTH,
    height: KEY_HEIGHT,
    marginLeft: -KEY_WIDTH / 2,
    borderWidth: BORDER.chunk,
  },
  keyTop: { top: 0 },
  keyBottom: { bottom: 0 },
  rim: {
    position: 'absolute',
    left: '50%',
    width: 26,
    height: RIM_HEIGHT,
    marginLeft: -13,
  },
  rimTop: { top: RIM_OFFSET },
  rimBottom: { bottom: RIM_OFFSET },
});
