import { View, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text } from '@/components/StyledText';
import { useGlowPulse } from '@/feel';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import { FlameIcon } from './PixelIcons';

/**
 * The run-heat chip: persistent, ambient proof that THIS run is hot, which is
 * exactly what "one more game" protects. Hidden below two wins, then it climbs:
 * an ember (2-3 wins, dim and static), a flame (4-5, breathing), a blaze (6+,
 * gold and breathing faster). Reflects real wins only (RunModel.wins); when a
 * run ends the chip simply goes with it, no shame copy. Pass `paused` (the
 * screen's idle flag, or true on screens without one) to keep the loop honest
 * with the battery conventions; useGlowPulse holds steady under reduced motion.
 */
interface StreakFlameProps {
  streak: number;
  paused?: boolean;
}

const EMBER = 2;
const FLAME = 4;
const BLAZE = 6;

export function StreakFlame({ streak, paused = false }: StreakFlameProps) {
  const tier = streak >= BLAZE ? 'blaze' : streak >= FLAME ? 'flame' : 'ember';
  const color =
    tier === 'blaze' ? palette.gold : tier === 'flame' ? palette.flame : palette.orange;
  // One loop at most, and only while an actual flame is burning on screen. The
  // blaze breathes faster than the flame (560ms vs 900ms): urgency climbs with
  // the streak.
  const glow = useGlowPulse(tier === 'blaze' ? 560 : 900, {
    paused: paused || streak < FLAME,
  });
  if (streak < EMBER) return null;

  const inner = (
    <View style={[styles.chip, { borderColor: color }, tier === 'ember' && styles.emberDim]}>
      <FlameIcon size={12} color={color} />
      <Text style={[styles.label, { color }]}>{streak}W</Text>
    </View>
  );
  if (tier === 'ember') return inner;
  return <Animated.View style={glow}>{inner}</Animated.View>;
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1),
    paddingHorizontal: space(2),
    paddingVertical: space(1),
    backgroundColor: palette.bgPanel,
    borderWidth: BORDER.thin,
    borderRadius: RADIUS.chip,
  },
  emberDim: { opacity: 0.75 },
  label: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.small,
  },
});
