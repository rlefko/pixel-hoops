import { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { Pop } from '@/components/fx';
import { haptics } from '@/feel';
import { CoinIcon } from '@/components/run/PixelIcons';
import { useHomeRoster } from '@/context/HomeRosterContext';
import { LockerRoomTab } from '@/components/locker/LockerRoomTab';
import { ArcadeTab } from '@/components/locker/ArcadeTab';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * The Locker Room: the between-runs hub, tabbed into the LOCKER (permanent stat
 * upgrades) and ARCADE (coin gacha) sections under one shell. This container owns
 * the back control, the per-tab title, and the shared coin pill; the tab bodies
 * own their own scroll, search, and selection state. Both panes stay mounted (the
 * inactive one is display:none) so switching tabs preserves their state and scroll.
 */

type Tab = 'locker' | 'arcade';

const TABS: { key: Tab; label: string; title: string }[] = [
  { key: 'locker', label: 'LOCKER', title: 'LOCKER ROOM' },
  { key: 'arcade', label: 'ARCADE', title: 'ARCADE' },
];

export default function LockerScreen() {
  const router = useRouter();
  const { homeRoster, loaded } = useHomeRoster();
  const [tab, setTab] = useState<Tab>('locker');

  if (!loaded || !homeRoster) {
    return (
      <View style={styles.center}>
        <Text style={styles.loading}>LOADING...</Text>
      </View>
    );
  }

  const coins = homeRoster.coins;
  const title = TABS.find((t) => t.key === tab)?.title ?? 'LOCKER ROOM';

  return (
    <Screen style={styles.container} onBack={() => router.back()}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        <Pop trigger={coins} style={styles.coinPill}>
          <CoinIcon size={12} color={palette.gold} />
          <Text style={styles.coinText}>{coins}</Text>
        </Pop>
      </View>

      <View style={styles.tabBar}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => {
                if (active) return;
                haptics.selection();
                setTab(t.key);
              }}
              style={[styles.tabChip, active && styles.tabChipActive]}
            >
              <Text style={[styles.tabChipText, active && styles.tabChipTextActive]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.body}>
        <View style={[styles.pane, tab !== 'locker' && styles.hidden]}>
          <LockerRoomTab />
        </View>
        <View style={[styles.pane, tab !== 'arcade' && styles.hidden]}>
          <ArcadeTab />
        </View>
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontFamily: FONT.display, fontSize: FONT_SIZE.h3, color: palette.gold },
  coinPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1),
    paddingHorizontal: space(2),
    paddingVertical: space(1),
    backgroundColor: palette.bgPanel,
    borderWidth: BORDER.thin,
    borderColor: palette.gold + '55',
    borderRadius: RADIUS.chip,
  },
  coinText: { fontFamily: FONT.display, fontSize: FONT_SIZE.body, color: palette.gold },
  tabBar: { flexDirection: 'row', gap: space(2), marginTop: space(3) },
  tabChip: {
    paddingHorizontal: space(3),
    paddingVertical: space(1.5),
    borderWidth: BORDER.thin,
    borderColor: palette.inkDim,
    borderRadius: RADIUS.chip,
  },
  tabChipActive: { borderColor: palette.gold, backgroundColor: palette.gold + '1A' },
  tabChipText: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, color: palette.inkDim },
  tabChipTextActive: { color: palette.gold },
  body: { flex: 1, marginTop: space(2) },
  pane: { flex: 1 },
  hidden: { display: 'none' },
});
