import { Fragment } from 'react';
import { StyleSheet } from 'react-native';
import { Text } from '@/components/StyledText';
import { CheckboxRow } from '@/components/CheckboxRow';
import { useFeelSettings } from '@/feel';
import { FONT, FONT_SIZE, palette, space } from '@/theme';

/**
 * The shared settings toggles (feedback, motion, gameplay). Rendered by both the
 * full-screen Settings route and the in-run settings modal so the two never drift.
 * Pure controls only: the save-reset DANGER ZONE stays on the route, since wiping
 * the save and bouncing home would kill an active run.
 */
export function SettingsControls() {
  const { shakeEnabled, hapticsEnabled, reducedMotion, autoSkipGames, update } =
    useFeelSettings();

  return (
    <Fragment>
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

      <Text style={styles.section}>GAMEPLAY</Text>
      <CheckboxRow
        label="Auto-Skip Games"
        description="Jump straight to the final score, no watching"
        checked={autoSkipGames}
        onToggle={(next) => update({ autoSkipGames: next })}
      />
    </Fragment>
  );
}

const styles = StyleSheet.create({
  section: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.gold,
    marginTop: space(6),
    marginBottom: space(2),
  },
});
