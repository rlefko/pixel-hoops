import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from '@/components/StyledText';
import { InjuryIcon } from '@/components/run/PixelIcons';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import type { Roster } from '@/types/roster';

/** Rest node: recover from injuries, rework your starting five, or move on. */

interface RestViewProps {
  roster: Roster;
  onRebuild: () => void;
  onContinue: () => void;
}

export function RestView({ roster, onRebuild, onContinue }: RestViewProps) {
  const injured = [...roster.starters, ...roster.bench].filter(
    (rp) => (rp.gamesOut ?? 0) > 0
  );
  return (
    <View style={styles.container}>
      <Text style={styles.title}>REST</Text>
      <Text style={styles.body}>
        Catch your breath. Resting fully heals every injury. Rework your
        starting five, or move on.
      </Text>
      {injured.length > 0 ? (
        <View style={styles.injuredList}>
          <Text style={styles.injuredLabel}>RECOVERING</Text>
          {injured.map((rp, i) => (
            <View key={i} style={styles.injuredRow}>
              <InjuryIcon size={12} />
              <Text style={styles.injuredName} numberOfLines={1}>
                {rp.player.name}
              </Text>
              <Text style={styles.injuredOut}>OUT {rp.gamesOut}</Text>
            </View>
          ))}
        </View>
      ) : null}
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
  injuredList: {
    alignSelf: 'stretch',
    marginTop: space(5),
    gap: space(1),
  },
  injuredLabel: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.injury,
    textAlign: 'center',
    marginBottom: space(1),
  },
  injuredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    justifyContent: 'center',
  },
  injuredName: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.ink,
  },
  injuredOut: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.injury,
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
