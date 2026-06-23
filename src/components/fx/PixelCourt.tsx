import { View, StyleSheet } from 'react-native';
import { palette, BORDER } from '@/theme';

/**
 * A decorative, programmatic 8-bit basketball court drawn with plain Views (no
 * sprite art): half-court line, center circle, two keys, and a real hoop at each
 * baseline (backboard, rim, and a hanging net). Sits behind the play-by-play
 * feed to give the sim a sense of place. Colors are themed per matchup (the
 * opponent's arena, see courtThemeFor), defaulting to the house palette.
 * Geometry stays fixed so the ball-flight math can target the rims.
 */

/** Key (paint) height in px; the lane leads up to the basket. Exported for layout. */
export const KEY_HEIGHT = 76;
const KEY_WIDTH = 84;
/** Rim thickness in px. */
export const RIM_HEIGHT = 6;

/** Gap from the court edge (baseline) to the backboard. */
const BASELINE_INSET = 14;
const BACKBOARD_W = 40;
const BACKBOARD_H = 5;
const RIM_W = 26;
/** Net silhouette: a short cinched drape of strands hanging off the rim. */
const NET_W = 22;
const NET_H = 14;
const NET_STRAND_W = 2;
const NET_STRAND_GAP = 3;
/** Strand heights, tallest in the middle so the net droops like a real one. */
const NET_STRANDS = [10, 13, 14, 13, 10];

/**
 * Distance from the baseline to the rim's top edge. The rim hangs just in front
 * of the backboard, at the end of the court, so a shot arcs into it. Exported
 * for the ball-flight target math (see courtGeometry.rimCenterPx).
 */
export const RIM_OFFSET = BASELINE_INSET + BACKBOARD_H + RIM_HEIGHT / 2;

interface PixelCourtProps {
  /** Floor fill. Defaults to the house court color. */
  floorColor?: string;
  /** Border, center line, circle, and keys. Defaults to the house court line. */
  lineColor?: string;
  /** Rim color. Defaults to the brand orange. */
  accentColor?: string;
}

/** A hanging net: a centered row of dim strands that droop toward mid-court. */
function HoopNet({ end }: { end: 'top' | 'bottom' }) {
  return (
    <View
      style={[
        styles.net,
        end === 'top' ? styles.netTop : styles.netBottom,
        // Top hoop drapes down from the rim, bottom hoop drapes up toward it.
        { alignItems: end === 'top' ? 'flex-start' : 'flex-end' },
      ]}
    >
      {NET_STRANDS.map((h, i) => (
        <View key={i} style={[styles.netStrand, { height: h }]} />
      ))}
    </View>
  );
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

      {/* Hoops: backboard (behind) -> net -> rim (in front), mirrored each end. */}
      <View
        style={[styles.backboard, styles.backboardTop, { backgroundColor: lineColor }]}
      />
      <View
        style={[
          styles.backboard,
          styles.backboardBottom,
          { backgroundColor: lineColor },
        ]}
      />
      <HoopNet end="top" />
      <HoopNet end="bottom" />
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
  backboard: {
    position: 'absolute',
    left: '50%',
    width: BACKBOARD_W,
    height: BACKBOARD_H,
    marginLeft: -BACKBOARD_W / 2,
    borderRadius: RIM_HEIGHT / 6,
  },
  backboardTop: { top: BASELINE_INSET },
  backboardBottom: { bottom: BASELINE_INSET },
  net: {
    position: 'absolute',
    left: '50%',
    width: NET_W,
    height: NET_H,
    marginLeft: -NET_W / 2,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: NET_STRAND_GAP,
    opacity: 0.55,
  },
  netTop: { top: RIM_OFFSET + RIM_HEIGHT },
  netBottom: { bottom: RIM_OFFSET + RIM_HEIGHT },
  netStrand: {
    width: NET_STRAND_W,
    backgroundColor: palette.inkDim,
  },
  rim: {
    position: 'absolute',
    left: '50%',
    width: RIM_W,
    height: RIM_HEIGHT,
    marginLeft: -RIM_W / 2,
  },
  rimTop: { top: RIM_OFFSET },
  rimBottom: { bottom: RIM_OFFSET },
});
