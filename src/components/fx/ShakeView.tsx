import { forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { useScreenShake, type ShakeIntensity } from '@/feel';

/** Imperative handle: call `shake(intensity)` to rattle the container. */
export interface ShakeViewHandle {
  shake: (intensity?: ShakeIntensity) => void;
}

interface ShakeViewProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Wraps content in a container that can be shaken on big plays. Hold a ref and
 * call `shake('heavy')` when a dunk or block lands.
 */
export const ShakeView = forwardRef<ShakeViewHandle, ShakeViewProps>(
  ({ children, style }, ref) => {
    const { shakeStyle, shake } = useScreenShake();
    useImperativeHandle(ref, () => ({ shake }), [shake]);
    return <Animated.View style={[style, shakeStyle]}>{children}</Animated.View>;
  }
);

ShakeView.displayName = 'ShakeView';
