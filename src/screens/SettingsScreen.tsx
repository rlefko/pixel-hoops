import { StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { CheckboxRow } from '@/components/CheckboxRow';
import { useFeelSettings } from '@/feel';
import { FONT, FONT_SIZE, palette, space } from '@/theme';

/**
 * Feedback and feel settings. Screen shake and haptics are independent: a player
 * can run with either, both, or neither. Changes persist via FeelSettings.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const { shakeEnabled, hapticsEnabled, update } = useFeelSettings();

  return (
    <Screen style={styles.container} onBack={() => router.back()}>
      <Text style={styles.title}>SETTINGS</Text>
      <Text style={styles.section}>FEEDBACK</Text>

      <CheckboxRow
        label="Screen Shake"
        description="Rattle the court on dunks, threes, and big stops"
        checked={shakeEnabled}
        onToggle={(next) => update({ shakeEnabled: next })}
      />
      <CheckboxRow
        label="Haptic Feedback"
        description="Buzz the phone on big plays"
        checked={hapticsEnabled}
        onToggle={(next) => update({ hapticsEnabled: next })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space(5) },
  title: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h3,
    color: palette.gold,
  },
  section: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.gold,
    marginTop: space(6),
    marginBottom: space(2),
  },
});
