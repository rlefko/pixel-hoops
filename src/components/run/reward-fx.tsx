import { Dimensions, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { ParticleBurst } from '@/components/fx';
import { useGlowPulse } from '@/feel';
import { palette, space, RADIUS } from '@/theme';

const CENTER_X = Dimensions.get('window').width / 2;

/**
 * The pulsing gold halo behind a legendary reward (the same S++ "breathe" the
 * PlayerCard uses). Renders nothing unless `visible`. Place it inside a
 * relatively-positioned wrapper, before the card; pass `style` to override the
 * default insets for a tighter or looser glow.
 */
export function LegendaryHalo({
  visible,
  style,
}: {
  visible: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const glowStyle = useGlowPulse();
  if (!visible) return null;
  return <Animated.View pointerEvents="none" style={[styles.halo, style, glowStyle]} />;
}

/**
 * The legendary confetti burst that pairs with useRewardBurst: pass its
 * `confettiTrigger`. It stays dormant until the first legendary reveal bumps the
 * trigger above zero, then re-fires on every bump.
 */
export function RewardConfetti({ trigger }: { trigger: number }) {
  return (
    <ParticleBurst
      origin={trigger > 0 ? { x: CENTER_X, y: 120 } : null}
      variant="confetti"
      color={palette.gold}
      trigger={trigger}
    />
  );
}

const styles = StyleSheet.create({
  halo: {
    position: 'absolute',
    left: -space(1),
    right: -space(1),
    top: -space(1),
    bottom: -space(1),
    backgroundColor: palette.gold + '22',
    borderRadius: RADIUS.chip,
  },
});
