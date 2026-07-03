import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { MonoText } from '@/components/StyledText';
import { sfx } from '@/feel';
import { useOpenHandbook, type HandbookSection } from '@/navigation';
import { palette, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

interface MoreLinkProps {
  /** Handbook anchor to land on. */
  section: HandbookSection;
  label?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * A quiet "MORE ›" micro chip that deep-links into the How to Play handbook at a
 * section anchor. Sized to sit inline with TagChip micro rows; deliberately no
 * haptic and no glow loop, it is a doorway, not a reward.
 */
export function MoreLink({ section, label = 'MORE', style }: MoreLinkProps) {
  const openHandbook = useOpenHandbook();
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={space(2)}
      style={[styles.chip, style]}
      onPress={() => {
        sfx.tap('primary');
        openHandbook(section);
      }}
    >
      <MonoText style={styles.label}>{`${label} ›`}</MonoText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: BORDER.thin,
    borderColor: palette.inkDim + '66',
    borderRadius: RADIUS.chip,
    paddingHorizontal: space(2),
    paddingVertical: space(1.5),
  },
  label: { color: palette.inkDim, fontSize: FONT_SIZE.micro, letterSpacing: 1 },
});
