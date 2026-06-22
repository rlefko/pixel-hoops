import { StyleSheet, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/StyledText';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/** Main menu screen — entry point for the game. */
export default function HomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.titleBlock}>
        <Text style={styles.title}>PIXEL</Text>
        <Text style={[styles.title, styles.highlight]}>HOOPS</Text>
        <Text style={styles.subtitle}>8-Bit Basketball Roguelike</Text>
      </View>

      <Text style={styles.instructions}>
        {'Build your five. Set the plan.\nWatch them ball out.'}
      </Text>

      <View style={styles.buttonContainer}>
        <Pressable
          style={[styles.button, styles.primaryButton]}
          onPress={() => router.push('/sim')}
        >
          <Text style={styles.primaryText}>NEW SIM RUN</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={() => router.push('/game')}>
          <Text style={styles.secondaryText}>Card Game (Classic)</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={() => router.push('/modal')}>
          <Text style={styles.secondaryText}>How to Play</Text>
        </Pressable>
      </View>

      <Text style={styles.tagline}>Auto-sim 5-on-5. One run at a time.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.bgDeep,
  },
  titleBlock: {
    alignItems: 'center',
    marginBottom: space(2),
  },
  title: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h2,
    color: palette.ink,
    letterSpacing: 2,
    lineHeight: FONT_SIZE.h2 + 8,
  },
  highlight: {
    color: palette.orange,
  },
  subtitle: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    marginTop: space(2),
    letterSpacing: 1,
  },
  instructions: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.label,
    color: palette.ink,
    textAlign: 'center',
    marginTop: space(8),
    lineHeight: 22,
  },
  buttonContainer: {
    marginTop: space(10),
    alignItems: 'center',
  },
  button: {
    paddingVertical: space(3),
    paddingHorizontal: space(8),
    marginTop: space(3),
    alignItems: 'center',
  },
  primaryButton: {
    borderRadius: RADIUS.chip,
    borderWidth: BORDER.chunk,
    borderColor: palette.gold,
    backgroundColor: palette.gold + '1A',
  },
  primaryText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
    color: palette.gold,
  },
  secondaryText: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.label,
    color: palette.inkDim,
    letterSpacing: 1,
  },
  tagline: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
    marginTop: space(12),
    letterSpacing: 1,
  },
});
