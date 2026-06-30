import { View, StyleSheet } from 'react-native';
import { useArcadeRouter } from '@/navigation';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { StaggerIn } from '@/components/fx';
import { useHubBackdrop } from '@/feel';
import { CoachCard } from '@/components/coach/CoachCard';
import { useHomeRoster } from '@/context/HomeRosterContext';
import { selectCoach } from '@/game/home-roster';
import { COACHES, coachesByClass } from '@/game/coaches';
import { LADDER_CLASSES } from '@/game/difficulty-mode';
import { palette, FONT, FONT_SIZE, space } from '@/theme';

/**
 * The coach collection: every coach graded by class, owned ones equippable and locked
 * ones showing how they are won (off the ladder, never bought). The equipped coach is
 * the run's strategic identity; picking one here is optional (a default is always set).
 * A standalone screen reached from the home menu, mirroring the Hall of Fame.
 */
export default function CoachesScreen() {
  const nav = useArcadeRouter();
  const { homeRoster, loaded, saveHomeRoster } = useHomeRoster();
  const { idle, screenProps } = useHubBackdrop();

  if (!loaded || !homeRoster) {
    return (
      <View style={styles.center}>
        <Text style={styles.loading}>LOADING...</Text>
      </View>
    );
  }

  const owned = new Set(homeRoster.ownedCoaches);

  return (
    <Screen
      scroll
      onBack={() => nav.back()}
      contentContainerStyle={styles.content}
      {...screenProps}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>COACHES</Text>
        <Text style={styles.count}>
          {owned.size} / {COACHES.length}
        </Text>
      </View>
      <Text style={styles.intro}>
        Equip one to lead your run. Win more by clearing ladders.
      </Text>

      {LADDER_CLASSES.map((cls) => (
        <View key={cls} style={styles.group}>
          <Text style={styles.groupLabel}>{cls}-CLASS</Text>
          {coachesByClass(cls).map((coach, ci) => (
            <StaggerIn key={coach.id} index={ci}>
              <CoachCard
                coach={coach}
                owned={owned.has(coach.id)}
                equipped={homeRoster.selectedCoachId === coach.id}
                onEquip={() =>
                  saveHomeRoster(selectCoach(homeRoster, coach.id))
                }
                paused={idle}
              />
            </StaggerIn>
          ))}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: palette.bgDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loading: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
  },
  content: { paddingHorizontal: space(4), gap: space(3) },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h3,
    color: palette.chrome,
  },
  count: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
  },
  intro: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
    marginTop: -space(1),
  },
  group: { gap: space(2) },
  groupLabel: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.gold,
    marginTop: space(2),
  },
});
