import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '@/components/StyledText';
import { sfx } from '@/feel';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * The shared outlined action button for the run's decision screens (decline,
 * reroll, keep-squad, boost-skip). A plain box that sizes to its label, so the
 * space around it is never tappable. Deliberately distinct from the home menu's
 * animated MenuButton: these screens want a quiet, explicit, bounded control.
 *
 * Stays layout-neutral (no margins baked in); callers position it via `style`.
 */
interface PixelButtonProps {
  label: string;
  onPress: () => void;
  /** Gold-filled emphasis vs dim outline. Default 'secondary'. */
  variant?: 'primary' | 'secondary';
  /** 'small' shrinks padding and text for inline controls like reroll. */
  size?: 'normal' | 'small';
  disabled?: boolean;
  /** Caller-supplied spacing/alignment. */
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function PixelButton({
  label,
  onPress,
  variant = 'secondary',
  size = 'normal',
  disabled = false,
  style,
  accessibilityLabel,
}: PixelButtonProps) {
  const small = size === 'small';
  return (
    <Pressable
      onPress={() => {
        sfx.tap(variant === 'primary' ? 'primary' : 'secondary');
        onPress();
      }}
      disabled={disabled}
      hitSlop={small ? space(1) : undefined}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      style={[
        styles.base,
        small ? styles.small : styles.normal,
        variant === 'primary' ? styles.primary : styles.secondary,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text
        style={[
          styles.label,
          small ? styles.labelSmall : styles.labelNormal,
          variant === 'primary' ? styles.labelPrimary : styles.labelSecondary,
          disabled && styles.labelDisabled,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: BORDER.chunk,
    borderRadius: RADIUS.chip,
  },
  normal: { paddingVertical: space(3), paddingHorizontal: space(6) },
  small: { paddingVertical: space(1), paddingHorizontal: space(2) },
  primary: { borderColor: palette.gold, backgroundColor: palette.gold + '1A' },
  secondary: { borderColor: palette.inkDim },
  disabled: { opacity: 0.4, borderColor: palette.inkDim },
  label: { fontFamily: FONT.display, textAlign: 'center' },
  labelNormal: { fontSize: FONT_SIZE.label },
  labelSmall: { fontSize: FONT_SIZE.micro },
  labelPrimary: { color: palette.gold },
  labelSecondary: { color: palette.inkDim },
  labelDisabled: { color: palette.inkDim },
});
