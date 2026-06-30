import { memo, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { palette, BORDER, RADIUS, space } from '@/theme';
import { mix } from '@/theme/color';
import { useFeelSettings } from '@/feel';
import { BOARD_HEADROOM } from './map-geometry';

/**
 * The themed floor the run map sits on: a hardwood court (planked, framed) with
 * a crowd band along the top stands, all drawn with plain Views (no assets).
 * Sized to the board and rendered behind the dotted paths and node tiles, so it
 * scrolls with the run. Kept low-contrast so the tiles and labels stay legible.
 */

const PLANK_PITCH = 26;
const PLANK = mix(palette.bgCourt, palette.courtLine, 0.1);
const CROWD_COLORS = [palette.inkDim, palette.steelBlue, palette.orange];

function CrowdBand({ width }: { width: number }) {
  const seats = Math.max(0, Math.floor(width / 8));
  const { reducedMotion } = useFeelSettings();
  // A slow shimmer wave across the whole crowd band (one worklet, not per-seat), so
  // the stands feel alive without thrashing. Holds steady under reduced motion.
  const v = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) {
      v.value = 0.5;
      return;
    }
    v.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
    return () => cancelAnimation(v);
  }, [reducedMotion, v]);
  const shimmer = useAnimatedStyle(() => ({ opacity: 0.16 + 0.1 * v.value }));
  return (
    <Animated.View style={[styles.crowd, shimmer]} pointerEvents="none">
      {Array.from({ length: seats }, (_, i) => (
        <View
          key={i}
          style={[
            styles.seat,
            { backgroundColor: CROWD_COLORS[i % CROWD_COLORS.length] },
          ]}
        />
      ))}
    </Animated.View>
  );
}

export const ArenaBackdrop = memo(function ArenaBackdrop({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  const plankCount = Math.ceil(height / PLANK_PITCH);
  return (
    <View pointerEvents="none" style={[styles.floor, { width, height }]}>
      {Array.from({ length: plankCount }, (_, i) => (
        <View
          key={i}
          style={[
            styles.plank,
            { top: i * PLANK_PITCH, backgroundColor: PLANK },
          ]}
        />
      ))}
      <View style={styles.frame} />
      <CrowdBand width={width} />
    </View>
  );
});

const styles = StyleSheet.create({
  floor: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: palette.bgCourt,
    overflow: 'hidden',
  },
  plank: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
  },
  frame: {
    position: 'absolute',
    top: space(1),
    left: space(1),
    right: space(1),
    bottom: space(1),
    borderWidth: BORDER.chunk,
    borderColor: palette.courtLine + 'AA',
    borderRadius: RADIUS.chip,
  },
  crowd: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: BOARD_HEADROOM,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'flex-start',
    // opacity is driven by the shimmer animation (see CrowdBand).
    paddingHorizontal: space(1),
    paddingTop: space(1),
  },
  seat: {
    width: 5,
    height: 5,
    margin: 1.5,
    borderRadius: 1,
  },
});
