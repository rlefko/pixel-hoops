import { type ReactNode } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { useStaggerIn } from '@/feel';

/**
 * Declarative one-shot entrance for list rows and cards: a fade + slide-up cascaded
 * by `index` (see useStaggerIn). Wrap each item. One-shot, so no idle wiring is
 * needed; it snaps straight to shown under reduced motion.
 */
interface StaggerInProps {
  /** Position in the list; later items enter slightly later. */
  index: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Delay per index (default 45ms). */
  stepMs?: number;
  /** Clamp the cascade (default 8); pass the on-screen window size for long lists. */
  maxIndex?: number;
  /** Slide-up travel in px (default 6). */
  distancePx?: number;
}

export function StaggerIn({ index, children, style, stepMs, maxIndex, distancePx }: StaggerInProps) {
  const enterStyle = useStaggerIn(index, { stepMs, maxIndex, distancePx });
  return <Animated.View style={[style, enterStyle]}>{children}</Animated.View>;
}
