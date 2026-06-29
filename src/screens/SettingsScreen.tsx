import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useArcadeRouter } from '@/navigation';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { CheckboxRow } from '@/components/CheckboxRow';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useFeelSettings } from '@/feel';
import { useHomeRoster } from '@/context/HomeRosterContext';
import { useActiveRun } from '@/context/ActiveRunContext';
import { BORDER, FONT, FONT_SIZE, palette, RADIUS, space } from '@/theme';

/**
 * Feedback and feel settings. Screen shake and haptics are independent: a player
 * can run with either, both, or neither. Reduce Motion is the in-app control for
 * the game's animations, since the app ignores the OS reduce-motion flag so the
 * juice plays by default. Changes persist via FeelSettings.
 */
export default function SettingsScreen() {
  const nav = useArcadeRouter();
  const { shakeEnabled, hapticsEnabled, reducedMotion, update } = useFeelSettings();
  const { resetHomeRoster } = useHomeRoster();
  const { clearActiveRun } = useActiveRun();
  const [confirmingReset, setConfirmingReset] = useState(false);

  return (
    <Screen style={styles.container} onBack={() => nav.back()}>
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

      <Text style={styles.section}>MOTION</Text>

      <CheckboxRow
        label="Reduce Motion"
        description="Calm the ball, particles, shake, and other animations"
        checked={reducedMotion}
        onToggle={(next) => update({ reducedMotion: next })}
      />

      <Text style={styles.dangerSection}>DANGER ZONE</Text>
      <Text style={styles.dangerDesc}>
        Wipe your roster, coins, and upgrades and start over. This cannot be undone.
      </Text>
      <Pressable
        style={styles.dangerButton}
        onPress={() => setConfirmingReset(true)}
        accessibilityRole="button"
      >
        <Text style={styles.dangerButtonText}>RESET SAVE</Text>
      </Pressable>

      <ConfirmDialog
        visible={confirmingReset}
        title="RESET SAVE?"
        message="This permanently deletes your roster, coins, and upgrades. Your settings are kept."
        confirmLabel="RESET"
        destructive
        onConfirm={() => {
          setConfirmingReset(false);
          resetHomeRoster();
          clearActiveRun();
          nav.replace('/', 'menu');
        }}
        onCancel={() => setConfirmingReset(false)}
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
  dangerSection: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.missRed,
    marginTop: space(8),
    marginBottom: space(2),
  },
  dangerDesc: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
    marginBottom: space(3),
  },
  dangerButton: {
    paddingVertical: space(3),
    borderWidth: BORDER.chunk,
    borderColor: palette.missRed,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.missRed + '1A',
    alignItems: 'center',
  },
  dangerButtonText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
    color: palette.missRed,
  },
});
