import { View, StyleSheet } from 'react-native';
import { palette, BORDER } from '@/theme';

/**
 * A decorative, programmatic 8-bit basketball court drawn with plain Views (no
 * sprite art): half-court line, center circle, two keys, two rims. Sits behind
 * the play-by-play feed to give the sim a sense of place. Sprite players, crowd,
 * and animation are a later art pass.
 */
export function PixelCourt() {
  return (
    <View style={styles.court}>
      <View style={styles.centerLine} />
      <View style={styles.centerCircle} />
      <View style={[styles.key, styles.keyTop]} />
      <View style={[styles.key, styles.keyBottom]} />
      <View style={[styles.rim, styles.rimTop]} />
      <View style={[styles.rim, styles.rimBottom]} />
    </View>
  );
}

const KEY_HEIGHT = 88;
const KEY_WIDTH = 84;

const styles = StyleSheet.create({
  court: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: palette.bgCourt,
    borderColor: palette.courtLine,
    borderWidth: BORDER.chunk,
    overflow: 'hidden',
  },
  centerLine: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: BORDER.chunk,
    backgroundColor: palette.courtLine,
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
    borderColor: palette.courtLine,
  },
  key: {
    position: 'absolute',
    left: '50%',
    width: KEY_WIDTH,
    height: KEY_HEIGHT,
    marginLeft: -KEY_WIDTH / 2,
    borderWidth: BORDER.chunk,
    borderColor: palette.courtLine,
  },
  keyTop: { top: 0 },
  keyBottom: { bottom: 0 },
  rim: {
    position: 'absolute',
    left: '50%',
    width: 26,
    height: 6,
    marginLeft: -13,
    backgroundColor: palette.orange,
  },
  rimTop: { top: KEY_HEIGHT - 3 },
  rimBottom: { bottom: KEY_HEIGHT - 3 },
});
