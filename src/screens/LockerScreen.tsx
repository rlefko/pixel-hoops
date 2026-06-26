import { View, StyleSheet } from 'react-native';
import { useArcadeRouter } from '@/navigation';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { HubHeader } from '@/components/locker/HubHeader';
import { useHomeRoster } from '@/context/HomeRosterContext';
import { LockerRoomTab } from '@/components/locker/LockerRoomTab';
import { palette, FONT, FONT_SIZE, space } from '@/theme';

/**
 * The Locker Room: the between-runs hub for permanent stat upgrades. It pairs
 * with the Arcade (the coin gacha), which is now its own screen reached from the
 * home menu. This shell owns the back control and the shared title + coin header;
 * the upgrade grid, search, and filters live in LockerRoomTab.
 */
export default function LockerScreen() {
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
      <HubHeader title="LOCKER ROOM" />
      <View style={styles.body}>
        <LockerRoomTab />
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
