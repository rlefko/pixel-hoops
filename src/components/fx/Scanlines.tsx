import { memo, useId, useState } from 'react';
import { View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';
import { palette } from '@/theme';
import { useFeelSettings } from '@/feel';

/**
 * A subtle CRT scanline overlay: thin dark horizontal lines over the play area.
 * Static (no animation) and non-interactive. Drawn as a single SVG rect filled
 * with a 1px-line pattern (one tile that repeats down the area), so the whole
 * overlay is a handful of native nodes instead of one View per line. Toggleable
 * via FeelSettings. Mount as a sibling above the content you want to "CRT".
 */
interface ScanlinesProps {
  /** Pixels between lines. Keep >= 2 to stay subtle. */
  spacing?: number;
  color?: string;
  /** Overrides the FeelSettings toggle when provided. */
  enabled?: boolean;
}

function ScanlinesImpl({ spacing = 3, color = palette.scanline, enabled }: ScanlinesProps) {
  const settings = useFeelSettings();
  const on = enabled ?? settings.scanlinesEnabled;
  const [size, setSize] = useState({ width: 0, height: 0 });
  // A unique pattern id so multiple overlays never collide (notably on web,
  // where every Svg shares one id namespace), as in PixelIcons' clip paths.
  const patternId = useId();

  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });

  const show = on && size.width > 0 && size.height > 0;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {show ? (
        <Svg width={size.width} height={size.height}>
          <Defs>
            <Pattern
              id={patternId}
              patternUnits="userSpaceOnUse"
              x={0}
              y={0}
              width={size.width}
              height={spacing}
            >
              <Rect x={0} y={0} width={size.width} height={1} fill={color} />
            </Pattern>
          </Defs>
          <Rect width={size.width} height={size.height} fill={`url(#${patternId})`} />
        </Svg>
      ) : null}
    </View>
  );
}

/**
 * Memoized so a busy parent (notably PlayByPlayFeed, which re-renders on every play-by-play
 * event) does not reconcile this static SVG overlay each tick. Its own props are usually
 * fixed at the call site, so it re-renders only when the scanlines toggle actually changes.
 */
export const Scanlines = memo(ScanlinesImpl);
