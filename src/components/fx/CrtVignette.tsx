import { memo, useId } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { palette } from '@/theme';
import { useFeelSettings } from '@/feel';

/**
 * A static CRT-style vignette: a soft radial darkening at the screen edges
 * (transparent center, ~22% shadow at the corners) that, with the scanline overlay,
 * completes the arcade-cabinet read. Non-animated (zero battery cost) and
 * non-interactive, so it is fine under reduced motion; gated by the Arcade Extras
 * setting. Mount full-bleed above content, next to Scanlines. A unique gradient id
 * (useId) keeps multiple overlays from colliding, notably on web.
 */
function CrtVignetteImpl() {
  const { arcadeExtras } = useFeelSettings();
  const { width, height } = useWindowDimensions();
  const gradientId = useId();
  if (!arcadeExtras || width === 0 || height === 0) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id={gradientId} cx="50%" cy="50%" r="75%">
            <Stop offset="55%" stopColor={palette.shadow} stopOpacity={0} />
            <Stop offset="100%" stopColor={palette.shadow} stopOpacity={0.22} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill={`url(#${gradientId})`} />
      </Svg>
    </View>
  );
}

export const CrtVignette = memo(CrtVignetteImpl);
