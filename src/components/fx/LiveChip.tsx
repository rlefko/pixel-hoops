import { type ReactNode } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { useLiveChip } from '@/feel';
import { palette, RADIUS } from '@/theme';

/**
 * Wraps a chip or card with the "live selection" glow (see useLiveChip): a slow
 * breathe behind the face while `active`, nothing when inactive. The glow tint
 * matches the MenuButton / LegendaryHalo convention (color + '22'). Pass `paused`
 * (the screen's idle flag) to quiet the loop; it holds steady-lit under reduced
 * motion. Position and size the chip via `style`; the glow insets behind it.
 */
interface LiveChipProps {
  active: boolean;
  /** Glow color (the chip's accent). Default gold. */
  color?: string;
  /** Quiet the loop when the screen is idle. */
  paused?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function LiveChip({
  active,
  color = palette.gold,
  paused = false,
  children,
  style,
}: LiveChipProps) {
  const glowStyle = useLiveChip(active, { paused });
  return (
    <View style={[styles.wrap, style]}>
      {active ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.glow, { backgroundColor: color + '22' }, glowStyle]}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  glow: {
    position: 'absolute',
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderRadius: RADIUS.chip,
  },
});
