import { useEffect, useRef } from 'react';
import Animated from 'react-native-reanimated';
import type { StyleProp, TextStyle } from 'react-native';
import { usePop } from '@/feel';
import { classForOvr, CLASS_ORDER } from '@/game/ratings';
import { statColor } from './class-ui';

/**
 * A rating number tinted by the strength class its value falls into (reusing the
 * class ladder and colors), so power reads at a glance: a weak stat is dim, an
 * elite one glows, and the tint always matches the player's tier badge. When the
 * value climbs into a higher class band between renders it pops once, turning a
 * stat upgrade or training tick into a small visible payoff. Pass the same `style`
 * a plain stat Text would use; the class color is layered on top. `animate={false}`
 * suppresses the pop for numbers that sit beside the tier badge (the OVR), which
 * already celebrates the promotion, so the moment does not double-fire.
 */
export function StatNumber({
  value,
  style,
  animate = true,
}: {
  value: number;
  style?: StyleProp<TextStyle>;
  animate?: boolean;
}) {
  const band = CLASS_ORDER.indexOf(classForOvr(value));
  // Seed with the mount value so a freshly rendered number never pops; only a
  // band that rises between renders (an upgrade/training tick) celebrates.
  const prevBand = useRef(band);
  const { popStyle, pop } = usePop();
  useEffect(() => {
    if (animate && band > prevBand.current) pop({ scale: 1.35 });
    prevBand.current = band;
  }, [animate, band, pop]);

  return (
    <Animated.Text style={[style, { color: statColor(value) }, popStyle]}>
      {value}
    </Animated.Text>
  );
}
