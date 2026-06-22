import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from '@/components/StyledText';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/** Rest node: rework your starting five (no HP system yet) or move on for a small rep bump. */

interface RestViewProps {
  onRebuild: () => void;
  onContinue: () => void;
}

export function RestView({ onRebuild, onContinue }: RestViewProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>REST</Text>
      <Text style={styles.body}>
        Catch your breath. Rework your starting five, or move on.
      </Text>
      <Pressable style={styles.button} onPress={onRebuild}>
        <Text style={styles.buttonText}>REBUILD LINEUP</Text>
      </Pressable>
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
    color: palette.gold,
  },
  body: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.label,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(4),
  },
  button: {
    marginTop: space(5),
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
