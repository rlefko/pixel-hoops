import { forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
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
    // `baseTransform` declares the transform prop at mount so the New
    // Architecture renderer keeps a transform node to animate. Without it, an
    // identity-only initial transform can be dropped on iOS/Android and later
    // shake updates have nothing to attach to (web is unaffected).
    return (
      <Animated.View style={[styles.baseTransform, style, shakeStyle]}>
        {children}
      </Animated.View>
    );
  }
);

ShakeView.displayName = 'ShakeView';

const styles = StyleSheet.create({
  baseTransform: { transform: [{ translateX: 0 }, { translateY: 0 }] },
});
