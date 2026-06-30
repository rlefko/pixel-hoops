import { Fragment } from 'react';
import { StyleSheet } from 'react-native';
import { Text } from '@/components/StyledText';
import { CheckboxRow } from '@/components/CheckboxRow';
import { SliderRow } from '@/components/SliderRow';
import { useFeelSettings, setSoundVolume, sfx } from '@/feel';
import { FONT, FONT_SIZE, palette, space } from '@/theme';

/**
 * The shared settings toggles (feedback, motion, gameplay). Rendered by both the
 * full-screen Settings route and the in-run settings modal so the two never drift.
 * Pure controls only: the save-reset DANGER ZONE stays on the route, since wiping
 * the save and bouncing home would kill an active run.
 */
export function SettingsControls() {
  const {
    shakeEnabled,
    hapticsEnabled,
    soundEnabled,
    sfxVolume,
    reducedMotionSetting,
    lowPowerMode,
    arcadeExtras,
    autoSkipGames,
    update,
  } = useFeelSettings();

  // The toggle reflects the player's own choice; when low power mode forces motion down
  // on its own, say so instead of silently flipping the box.
  const reduceMotionDescription =
    lowPowerMode && !reducedMotionSetting
      ? 'On automatically while your device is in Low Power Mode'
      : 'Calm the ball, particles, shake, and other animations';

  // Sound is auto-muted in low power mode (like reduce motion); say so when it's
  // overriding a player who has sound on, instead of leaving the copy misleading.
  const soundDescription =
    lowPowerMode && soundEnabled
      ? 'Off automatically while your device is in Low Power Mode'
      : 'Arcade blips on makes, big plays, and rewards (off when phone is on silent)';

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
      <CheckboxRow
        label="Sound Effects"
        description={soundDescription}
        checked={soundEnabled}
        onToggle={(next) => update({ soundEnabled: next })}
      />
      <SliderRow
        label="Sound Volume"
        value={sfxVolume}
        disabled={!soundEnabled || lowPowerMode}
        // Live preview while dragging (module-only, so the global context never
        // re-renders per drag step); persist once on release, then play a blip so the
        // player hears the new level.
        onPreview={setSoundVolume}
        onCommit={(next) => {
          update({ sfxVolume: next });
          sfx.tap();
        }}
      />

      <Text style={styles.section}>MOTION</Text>
      <CheckboxRow
        label="Reduce Motion"
        description={reduceMotionDescription}
        checked={reducedMotionSetting}
        onToggle={(next) => update({ reducedMotion: next })}
      />

      <Text style={styles.section}>ARCADE</Text>
      <CheckboxRow
        label="Arcade Extras"
        description="CRT edge glow and drifting court ambience"
        checked={arcadeExtras}
        onToggle={(next) => update({ arcadeExtras: next })}
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
