import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { StaggerIn, Pop } from '@/components/fx';
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
    <Screen style={styles.container}>
      <Pop popOnMount>
        <Text style={styles.title}>REST</Text>
      </Pop>
      <Text style={styles.body}>
        Catch your breath. Resting fully heals every injury. Rework your
        starting five, or move on.
      </Text>
      {injured.length > 0 ? (
        <View style={styles.injuredList}>
          <Text style={styles.injuredLabel}>RECOVERING</Text>
          {injured.map((rp, i) => (
            <StaggerIn key={i} index={i} style={styles.injuredRow}>
              <InjuryIcon size={12} />
              <Text style={styles.injuredName} numberOfLines={2}>
                {rp.player.name}
              </Text>
              <Text style={styles.injuredOut}>OUT {rp.gamesOut}</Text>
            </StaggerIn>
          ))}
        </View>
      ) : null}
      <Pressable style={styles.button} onPress={onRebuild}>
        <Text style={styles.buttonText}>REBUILD LINEUP</Text>
      </Pressable>
      <Pressable style={styles.button} onPress={onContinue}>
        <Text style={styles.buttonText}>CONTINUE</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(6),
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
    flexShrink: 1,
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
