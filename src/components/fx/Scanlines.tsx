import { useState } from 'react';
import { View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { palette } from '@/theme';
import { useFeelSettings } from '@/feel';

/**
 * A subtle CRT scanline overlay: thin dark horizontal lines over the play area.
 * Static (no animation) and non-interactive, so it is cheap. Toggleable via
 * FeelSettings. Mount as a sibling above the content you want to "CRT".
 */
interface ScanlinesProps {
  /** Pixels between lines. Keep >= 2 to stay subtle. */
  spacing?: number;
  color?: string;
  /** Overrides the FeelSettings toggle when provided. */
  enabled?: boolean;
}

const MAX_LINES = 400;

export function Scanlines({ spacing = 3, color = palette.scanline, enabled }: ScanlinesProps) {
  const settings = useFeelSettings();
  const on = enabled ?? settings.scanlinesEnabled;
  const [height, setHeight] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height);

  const lineCount = on ? Math.min(MAX_LINES, Math.ceil(height / spacing)) : 0;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {Array.from({ length: lineCount }, (_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            top: i * spacing,
            left: 0,
            right: 0,
            height: 1,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}
