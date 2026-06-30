import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useArcadeRouter } from '@/navigation';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { SettingsControls } from '@/components/SettingsControls';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useHomeRoster } from '@/context/HomeRosterContext';
import { BORDER, FONT, FONT_SIZE, palette, RADIUS, space } from '@/theme';

/**
 * Feedback and feel settings. The toggles live in the shared SettingsControls so
 * the in-run settings modal renders the exact same rows. This route adds the
 * save-reset DANGER ZONE, which is route-only (it bounces home, so it must never
 * appear over a live run). Changes persist via FeelSettings.
 */
export default function SettingsScreen() {
  const nav = useArcadeRouter();
  const { resetHomeRoster } = useHomeRoster();
  const [confirmingReset, setConfirmingReset] = useState(false);

  return (
    <Screen scroll contentContainerStyle={styles.container} onBack={() => nav.back()}>
      <Text style={styles.title}>SETTINGS</Text>

      <SettingsControls />

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
