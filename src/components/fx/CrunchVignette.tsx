import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { useGlowPulse } from '@/feel/usePulse';
import { palette } from '@/theme';

/**
 * The crunch-time frame: four thin gold strips breathing on the court's edges so
 * a close Q4 finish reads as a held breath without obscuring a single play.
 * Mount it only while crunch is live (it is one glow-pulse worklet); it holds a
 * steady faint tint under reduced motion via useGlowPulse.
 */

const STRIP = 5;

export function CrunchVignette() {
  const glowStyle = useGlowPulse(900);
  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, glowStyle]}>
      <Animated.View style={[styles.strip, styles.top]} />
      <Animated.View style={[styles.strip, styles.bottom]} />
      <Animated.View style={[styles.strip, styles.left]} />
      <Animated.View style={[styles.strip, styles.right]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  strip: {
    position: 'absolute',
    backgroundColor: palette.gold,
    // Faint by design: the frame leans in, the court stays fully legible.
    opacity: 0.08,
  },
  top: { top: 0, left: 0, right: 0, height: STRIP },
  bottom: { bottom: 0, left: 0, right: 0, height: STRIP },
  left: { top: STRIP, bottom: STRIP, left: 0, width: STRIP },
  right: { top: STRIP, bottom: STRIP, right: 0, width: STRIP },
});
