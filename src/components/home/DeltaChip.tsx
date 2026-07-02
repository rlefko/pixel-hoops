import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '@/components/StyledText';
import { LiveChip, StaggerIn } from '@/components/fx';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * The hub's "since you left" badge: a small gold rise earned while the player
 * was away, overlaid on existing chrome (absolute corners / row slots) so it
 * costs the one-viewport home column zero height. Honest by construction: it
 * renders nothing at zero — a badge that points at nothing new spends the trust
 * the whole system runs on — and it never intercepts a tap.
 *
 * `count` is for decision-relevant numbers (coins, copies); `dot` marks plain
 * novelty (new crests) where the count is not the message. The glow is a
 * LiveChip (idle-paused, steady under reduced motion); the entrance is a
 * one-shot StaggerIn, so the chip runs zero loops once the hub goes idle.
 */
interface DeltaChipProps {
  /** The earned rise; nothing renders at 0 or below. */
  amount: number;
  variant?: 'count' | 'dot';
  /** Cascade slot: chips enter 30ms apart, least important first. */
  index?: number;
  /** Parent gates on the reveal beat, so the hub lands static and tappable first. */
  visible: boolean;
  /** The hub's idle flag (quiet the glow). */
  paused?: boolean;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

export function DeltaChip({
  amount,
  variant = 'count',
  index = 0,
  visible,
  paused = false,
  color = palette.gold,
  style,
}: DeltaChipProps) {
  if (!visible || amount <= 0) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, style]}>
      <StaggerIn index={index} stepMs={30}>
        <LiveChip active color={color} paused={paused}>
          {variant === 'dot' ? (
            <View style={[styles.dot, { backgroundColor: color }]} />
          ) : (
            <Text style={[styles.count, { color, borderColor: color + '66' }]}>
              +{amount}
            </Text>
          )}
        </LiveChip>
      </StaggerIn>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center' },
  count: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    paddingHorizontal: space(1.5),
    paddingVertical: 2,
    borderWidth: BORDER.thin,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.bgDeep,
    overflow: 'hidden',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
});
