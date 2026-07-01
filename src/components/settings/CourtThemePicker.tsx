import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from '@/components/StyledText';
import { LockIcon } from '@/components/run/PixelIcons';
import {
  COURT_THEMES,
  courtThemeUnlocked,
  courtThemeUnlockHint,
  getCourtTheme,
  type CourtThemeDef,
} from '@/game/court-themes';
import { useHomeRoster } from '@/context/HomeRosterContext';
import { selectCourtTheme } from '@/game/home-roster';
import { haptics, sfx } from '@/feel';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * The home-court theme picker: one row per theme with a procedural three-band
 * swatch (floor / line / accent), the earned themes selectable and the locked
 * ones showing their difficulty-conquest hint. Unlocks derive from the
 * cleared-cell set, so this is a read of progress, never a purchase.
 */
export function CourtThemePicker() {
  const { homeRoster, saveHomeRoster } = useHomeRoster();
  if (!homeRoster) return null;
  const cells = homeRoster.clearedCells ?? [];
  const selectedId = getCourtTheme(homeRoster.courtTheme).id;

  const pick = (theme: CourtThemeDef) => {
    if (theme.id === selectedId) return;
    haptics.selection();
    sfx.tap();
    saveHomeRoster(selectCourtTheme(homeRoster, theme.id));
  };

  return (
    <View style={styles.section}>
      <Text style={styles.title}>HOME COURT</Text>
      <Text style={styles.desc}>
        Earned by conquering higher difficulties. Styles the run map and the
        game floor (visiting arenas still tint it their colors).
      </Text>
      {COURT_THEMES.map((theme) => {
        const unlocked = courtThemeUnlocked(theme, cells);
        const active = theme.id === selectedId;
        return (
          <Pressable
            key={theme.id}
            disabled={!unlocked}
            onPress={() => pick(theme)}
            accessibilityRole="button"
            style={[styles.row, active && styles.rowActive, !unlocked && styles.rowLocked]}
          >
            <View style={styles.swatch}>
              <View style={[styles.swatchBand, { backgroundColor: theme.floor }]} />
              <View style={[styles.swatchBand, { backgroundColor: theme.line }]} />
              <View style={[styles.swatchBand, { backgroundColor: theme.accent }]} />
            </View>
            <View style={styles.rowBody}>
              <Text style={[styles.name, active && styles.nameActive]}>{theme.name}</Text>
              <Text style={styles.blurb} numberOfLines={1}>
                {unlocked ? theme.blurb : courtThemeUnlockHint(theme)}
              </Text>
            </View>
            {unlocked ? (
              active ? <Text style={styles.equipped}>ON</Text> : null
            ) : (
              <LockIcon size={14} color={palette.inkDim} />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { alignSelf: 'stretch', marginTop: space(6), gap: space(2) },
  title: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.small,
    color: palette.ink,
  },
  desc: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
    marginBottom: space(1),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    borderWidth: BORDER.thin,
    borderColor: palette.inkDim + '55',
    borderRadius: RADIUS.chip,
    padding: space(3),
  },
  rowActive: { borderColor: palette.gold },
  rowLocked: { opacity: 0.55 },
  swatch: {
    width: 34,
    height: 26,
    borderRadius: 3,
    overflow: 'hidden',
    borderWidth: BORDER.thin,
    borderColor: palette.inkDim + '66',
  },
  swatchBand: { flex: 1 },
  rowBody: { flex: 1, gap: 2 },
  name: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.small,
    color: palette.ink,
  },
  nameActive: { color: palette.gold },
  blurb: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
  },
  equipped: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.gold,
  },
});
