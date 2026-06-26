import { View, StyleSheet } from 'react-native';
import { useArcadeRouter } from '@/navigation';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { HubHeader } from '@/components/locker/HubHeader';
import { useHomeRoster } from '@/context/HomeRosterContext';
import { ArcadeTab } from '@/components/locker/ArcadeTab';
import { palette, FONT, FONT_SIZE, space } from '@/theme';

/**
 * The Arcade: the coin gacha hub (player scouting, ability pulls, and the equip
 * loadout). Split out of the Locker Room into its own screen so it reads as its
 * own destination from the home menu. This shell owns the back control and the
 * shared title + coin header; the machines and loadout live in ArcadeTab.
 */
export default function ArcadeScreen() {
  const nav = useArcadeRouter();
  const { homeRoster, loaded } = useHomeRoster();

  if (!loaded || !homeRoster) {
    return (
      <View style={styles.center}>
        <Text style={styles.loading}>LOADING...</Text>
      </View>
    );
  }

  return (
    <Screen style={styles.container} onBack={() => nav.back()}>
      <HubHeader title="ARCADE" />
      <View style={styles.body}>
        <ArcadeTab />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space(4) },
  center: {
    flex: 1,
    backgroundColor: palette.bgDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loading: { fontFamily: FONT.display, fontSize: FONT_SIZE.body, color: palette.inkDim },
  body: { flex: 1, marginTop: space(2) },
});
