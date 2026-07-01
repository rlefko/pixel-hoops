import { View, StyleSheet } from 'react-native';
import { useArcadeRouter } from '@/navigation';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { StaggerIn } from '@/components/fx';
import { useHubBackdrop } from '@/feel';
import { HallOfFameCard } from '@/components/locker/HallOfFameCard';
import { BountyCrestShelf } from '@/components/locker/BountyCrestShelf';
import { useHomeRoster } from '@/context/HomeRosterContext';
import { palette, FONT, FONT_SIZE, space } from '@/theme';

/**
 * The Hall of Fame: a scrollable trophy case of every roster that won a ladder,
 * newest first. Each banner expands to its starting five and a Share button. A
 * standalone screen reached from the home menu (not a Locker Room tab).
 */
export default function HallOfFameScreen() {
  const nav = useArcadeRouter();
  const { homeRoster, loaded } = useHomeRoster();
  const { screenProps } = useHubBackdrop();

  if (!loaded || !homeRoster) {
    return (
      <View style={styles.center}>
        <Text style={styles.loading}>LOADING...</Text>
      </View>
    );
  }

  const entries = homeRoster.hallOfFame;

  return (
    <Screen
      scroll
      onBack={() => nav.back()}
      contentContainerStyle={styles.content}
      {...screenProps}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>HALL OF FAME</Text>
        <Text style={styles.count}>
          {entries.length} {entries.length === 1 ? 'banner' : 'banners'}
        </Text>
      </View>

      <BountyCrestShelf clearedCells={homeRoster.clearedCells} />

      {entries.length === 0 ? (
        <Text style={styles.empty}>
          Win a ladder to hang your first banner.
        </Text>
      ) : (
        entries.map((entry, i) => (
          <StaggerIn key={entry.id} index={i}>
            <HallOfFameCard entry={entry} />
          </StaggerIn>
        ))
      )}
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
    color: palette.gold,
  },
  count: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
  },
  empty: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    marginTop: space(4),
    textAlign: 'center',
  },
});
