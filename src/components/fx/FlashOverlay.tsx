import { forwardRef, useImperativeHandle } from 'react';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { useFlash } from '@/feel';

/** Imperative handle: call `flash(color)` to strobe the overlay. */
export interface FlashOverlayHandle {
  flash: (color?: string, opts?: { peak?: number }) => void;
}

/**
 * Full-bleed color flash for hit confirmation. Sits above the play area and is
 * never interactive. Trigger it through its ref on makes, blocks, and steals.
 */
export const FlashOverlay = forwardRef<FlashOverlayHandle>((_props, ref) => {
  const { flashStyle, color, flash } = useFlash();
  useImperativeHandle(ref, () => ({ flash }), [flash]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: color }, flashStyle]}
    />
  );
});

FlashOverlay.displayName = 'FlashOverlay';
