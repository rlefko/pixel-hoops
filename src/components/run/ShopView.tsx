import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from '@/components/StyledText';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/** Shop node stub. Gear and an economy are a later phase (see docs/roadmap.md). */

interface ShopViewProps {
  onContinue: () => void;
}

export function ShopView({ onContinue }: ShopViewProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>SHOP</Text>
      <Text style={styles.body}>Gear and upgrades are coming soon.</Text>
      <Pressable style={styles.button} onPress={onContinue}>
        <Text style={styles.buttonText}>CONTINUE</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bgDeep,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space(6),
  },
  title: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h2,
    color: palette.inkDim,
  },
  body: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.label,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(4),
  },
  button: {
    marginTop: space(6),
    paddingVertical: space(3),
    paddingHorizontal: space(6),
    borderWidth: BORDER.chunk,
    borderColor: palette.gold,
    borderRadius: RADIUS.chip,
  },
  buttonText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
    color: palette.gold,
  },
});
