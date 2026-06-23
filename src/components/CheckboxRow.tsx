import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from '@/components/StyledText';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * A labeled pixel checkbox row. Tapping anywhere on the row flips the value, so
 * the whole row is the hit target. The box fills gold with a check when on.
 */
interface CheckboxRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onToggle: (next: boolean) => void;
}

export function CheckboxRow({ label, description, checked, onToggle }: CheckboxRowProps) {
  return (
    <Pressable
      style={styles.row}
      onPress={() => onToggle(!checked)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View style={styles.textCol}>
        <Text style={styles.label}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      <View style={[styles.box, checked && styles.boxOn]}>
        {checked ? <Text style={styles.check}>✓</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(3),
    paddingVertical: space(3),
    borderBottomWidth: BORDER.thin,
    borderBottomColor: palette.bgPanel,
  },
  textCol: { flex: 1, gap: space(1) },
  label: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
    color: palette.ink,
  },
  description: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
  },
  box: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: BORDER.chunk,
    borderColor: palette.gold,
    borderRadius: RADIUS.chip,
  },
  boxOn: { backgroundColor: palette.gold + '1A' },
  check: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.label,
    color: palette.gold,
  },
});
