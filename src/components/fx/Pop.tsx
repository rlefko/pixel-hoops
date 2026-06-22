import { useEffect, useRef, type ReactNode } from 'react';
import Animated from 'react-native-reanimated';
import { type StyleProp, type ViewStyle } from 'react-native';
import { usePop } from '@/feel';

/**
 * Declarative scale-punch. Pops whenever `trigger` changes (e.g. a score), and
 * optionally on mount. Wrap anything that should react to a moment.
 */
interface PopProps {
  children: ReactNode;
  /** Pop fires whenever this value changes. */
  trigger?: unknown;
  popOnMount?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Pop({ children, trigger, popOnMount = false, style }: PopProps) {
  const { popStyle, pop } = usePop();
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      if (popOnMount) pop();
      return;
    }
    pop();
    // Intentionally keyed on `trigger` only.
  }, [trigger]); // eslint-disable-line react-hooks/exhaustive-deps

  return <Animated.View style={[style, popStyle]}>{children}</Animated.View>;
}
