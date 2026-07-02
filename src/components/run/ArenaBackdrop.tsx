import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { palette, BORDER, RADIUS, space } from '@/theme';
import { mix } from '@/theme/color';
import { PixelCrowd } from '@/components/fx/PixelCrowd';
import { BOARD_HEADROOM } from './map-geometry';

/**
 * The themed floor the run map sits on: a hardwood court (planked, framed) with
 * a crowd band along the top stands, all drawn with plain Views (no assets).
 * Sized to the board and rendered behind the dotted paths and node tiles, so it
 * scrolls with the run. Kept low-contrast so the tiles and labels stay legible.
 *
 * The stands scale with the bracket: `crowdDensity` fills the seats in as the
 * run climbs (see crowdDensityFor) and the final map seats a second row and
 * gilds the frame, so climbing LOOKS like climbing before a single tap.
 */

const PLANK_PITCH = 26;
const PLANK = mix(palette.bgCourt, palette.courtLine, 0.1);

export const ArenaBackdrop = memo(function ArenaBackdrop({
  width,
  height,
  paused = false,
  floorColor = palette.bgCourt,
  plankColor = PLANK,
  frameColor = palette.courtLine,
  crowdDensity = 1,
  crowdRows = 1,
  crowdSeed = 0,
}: {
  width: number;
  height: number;
  /** Freeze the crowd shimmer when the player is idle on the map. */
  paused?: boolean;
  /** Home-court theme overrides (src/game/court-themes.ts); defaults reproduce the
   * shipped arena exactly. */
  floorColor?: string;
  plankColor?: string;
  frameColor?: string;
  /** Crowd fullness 0..1 (bracket depth); defaults reproduce the packed band. */
  crowdDensity?: number;
  crowdRows?: number;
  crowdSeed?: string | number;
}) {
  const plankCount = Math.ceil(height / PLANK_PITCH);
  return (
    <View
      pointerEvents="none"
      style={[styles.floor, { width, height, backgroundColor: floorColor }]}
    >
      {Array.from({ length: plankCount }, (_, i) => (
        <View
          key={i}
          style={[
            styles.plank,
            { top: i * PLANK_PITCH, backgroundColor: plankColor },
          ]}
        />
      ))}
      <View style={[styles.frame, { borderColor: frameColor + 'AA' }]} />
      <PixelCrowd
        length={width - space(2)}
        rows={crowdRows}
        density={crowdDensity}
        seed={crowdSeed}
        shimmer
        paused={paused}
        style={styles.crowd}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  floor: {
    position: 'absolute',
    top: 0,
    left: 0,
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
    // borderColor comes from the theme (frameColor prop).
    borderRadius: RADIUS.chip,
  },
  crowd: {
    position: 'absolute',
    top: space(1),
    left: space(1),
    maxHeight: BOARD_HEADROOM,
    overflow: 'hidden',
  },
});
