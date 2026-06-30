import { type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Text } from '@/components/StyledText';
import { DUR, haptics, sfx, useFeelSettings, useFlash, useGlowPulse } from '@/feel';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * The chunky 8-bit menu button. A pressable tile with a raised look (accent
 * border, thicker bottom edge, and an optional idle attract glow) that physically
 * presses down on touch (translate + squish) and fires a haptic plus a quick
 * accent flash. The repo had no shared button before this; the home screen uses
 * it to build a clear NEW RUN > tiles > small-row hierarchy through `variant`,
 * `color`, and `attract`. Every effect degrades under reduced motion (no
 * transform, no glow, a static dim-on-press instead), so it stays accessible.
 */

type MenuButtonVariant = 'hero' | 'wide' | 'tile' | 'small';
type MenuHaptic = 'selection' | 'success' | 'light';

interface MenuButtonProps {
  label: string;
  /** Optional smaller, dimmed second line under the label (e.g. a run's "EASY • C"),
   * so a long caption never truncates the way a single one-line label would. */
  sublabel?: string;
  onPress: () => void;
  /** Accent color for the border, raised edge, label, glow, and press flash. */
  color?: string;
  variant?: MenuButtonVariant;
  icon?: ReactNode;
  /** Idle glow pulse behind the face (reserve for the primary CTA and the tiles). */
  attract?: boolean;
  /** Stagger the attract loop so a row of buttons doesn't pulse in lockstep. */
  attractDelayMs?: number;
  /** Override the per-variant haptic. */
  haptic?: MenuHaptic;
  /** Quick accent flash on press. Defaults on for hero/tile, off for wide/small. */
  flashOnPress?: boolean;
  /** Caller sets flex:1 for side-by-side tiles, or a width cap. */
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

interface VariantConfig {
  minHeight: number;
  padV: number;
  padH: number;
  border: number;
  bottom: number;
  font: number;
  direction: 'row' | 'column';
  gap: number;
  depth: number;
  tint: string;
  haptic: MenuHaptic;
  flash: boolean;
}

const VARIANTS: Record<MenuButtonVariant, VariantConfig> = {
  hero: {
    minHeight: space(15), padV: space(3), padH: space(4), border: BORDER.chunkier, bottom: 5,
    font: FONT_SIZE.h3, direction: 'row', gap: space(3), depth: 3, tint: '22',
    haptic: 'success', flash: true,
  },
  wide: {
    minHeight: space(12), padV: space(2), padH: space(4), border: BORDER.chunk, bottom: 4,
    font: FONT_SIZE.body, direction: 'row', gap: space(2), depth: 2, tint: '14',
    haptic: 'selection', flash: false,
  },
  tile: {
    minHeight: space(22), padV: space(3), padH: space(2), border: BORDER.chunkier, bottom: 5,
    font: FONT_SIZE.body, direction: 'column', gap: space(2), depth: 3, tint: '22',
    haptic: 'selection', flash: true,
  },
  small: {
    minHeight: space(12), padV: space(1.5), padH: space(2), border: BORDER.thin, bottom: 2,
    font: FONT_SIZE.micro, direction: 'column', gap: space(1), depth: 1, tint: '14',
    haptic: 'light', flash: false,
  },
};

export function MenuButton({
  label,
  sublabel,
  onPress,
  color = palette.gold,
  variant = 'wide',
  icon,
  attract = false,
  attractDelayMs = 0,
  haptic,
  flashOnPress,
  style,
  accessibilityLabel,
}: MenuButtonProps) {
  const cfg = VARIANTS[variant];
  const { reducedMotion } = useFeelSettings();
  const glowStyle = useGlowPulse(1100, { delayMs: attractDelayMs, paused: !attract });
  const { flashStyle, color: flashColor, flash } = useFlash();
  const pressed = useSharedValue(0);

  const faceAnim = useAnimatedStyle(() => ({
    transform: [
      { translateY: pressed.value * cfg.depth },
      { scale: 1 - 0.04 * pressed.value },
    ],
  }));

  const doFlash = flashOnPress ?? cfg.flash;
  const onPressIn = () => {
    if (!reducedMotion) pressed.value = withTiming(1, { duration: DUR.instant });
  };
  const onPressOut = () => {
    if (!reducedMotion) pressed.value = withTiming(0, { duration: DUR.fast });
  };
  const handlePress = () => {
    haptics[haptic ?? cfg.haptic]();
    sfx.tap(variant === 'hero' || variant === 'wide' ? 'primary' : 'secondary');
    if (doFlash) flash(color);
    onPress();
  };

  const showGlow = attract && !reducedMotion;

  return (
    <Pressable
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed: isPressed }) => [
        styles.outer,
        { minHeight: cfg.minHeight },
        reducedMotion && isPressed && styles.pressedStatic,
        style,
      ]}
    >
      {showGlow ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.glow, { backgroundColor: color + '22' }, glowStyle]}
        />
      ) : null}
      <Animated.View
        style={[
          styles.face,
          {
            flexDirection: cfg.direction,
            gap: cfg.gap,
            paddingVertical: cfg.padV,
            paddingHorizontal: cfg.padH,
            borderWidth: cfg.border,
            borderBottomWidth: cfg.bottom,
            borderColor: color,
            backgroundColor: color + cfg.tint,
          },
          faceAnim,
        ]}
      >
        {icon}
        {sublabel ? (
          <View style={styles.labelStack}>
            <Text style={[styles.label, { color, fontSize: cfg.font }]} numberOfLines={1}>
              {label}
            </Text>
            <Text style={[styles.sublabel, { color }]} numberOfLines={1}>
              {sublabel}
            </Text>
          </View>
        ) : (
          <Text style={[styles.label, { color, fontSize: cfg.font }]} numberOfLines={1}>
            {label}
          </Text>
        )}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: flashColor }, flashStyle]}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: {
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  pressedStatic: { opacity: 0.6 },
  glow: {
    position: 'absolute',
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderRadius: RADIUS.chip,
  },
  face: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.chip,
    overflow: 'hidden',
  },
  label: {
    fontFamily: FONT.display,
    textAlign: 'center',
    letterSpacing: 1,
  },
  labelStack: {
    alignItems: 'center',
    gap: space(1),
  },
  sublabel: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    textAlign: 'center',
    letterSpacing: 1,
    opacity: 0.7,
  },
});
