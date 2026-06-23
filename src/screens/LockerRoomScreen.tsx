import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/StyledText';
import { Pop } from '@/components/fx';
import { PlayerCard } from '@/components/run/PlayerCard';
import { CoinIcon } from '@/components/run/PixelIcons';
import { useHomeRoster } from '@/context/HomeRosterContext';
import { applyUpgrade, upgradeCount } from '@/game/home-roster';
import { canUpgrade, isPremiumStat, upgradeCost } from '@/game/upgrades';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import type { PlayerStats } from '@/types/player';

/**
 * The Locker Room: spend coins between runs on permanent +1 stat upgrades. Each
 * purchase is a flat +1; the cost rises per tier and per-stat upgrades cap at +5
 * (and the rating ceiling of 10). Premium stats (outside/playmaking/clutch) cost
 * more. Mirrors the in-run TrainingView grid for a familiar read.
 */

interface StatDef {
  key: keyof PlayerStats;
  label: string;
}

const STAT_GROUPS: { label: string; stats: StatDef[] }[] = [
  {
    label: 'OFFENSE',
    stats: [
      { key: 'inside', label: 'IN' },
      { key: 'outside', label: 'OUT' },
      { key: 'playmaking', label: 'PM' },
    ],
  },
  {
    label: 'DEFENSE',
    stats: [
      { key: 'perimeterD', label: 'PD' },
      { key: 'interiorD', label: 'ID' },
    ],
  },
  {
    label: 'PHYSICAL + MENTAL',
    stats: [
      { key: 'athleticism', label: 'AT' },
      { key: 'iq', label: 'IQ' },
      { key: 'clutch', label: 'CL' },
    ],
  },
];

export default function LockerRoomScreen() {
  const router = useRouter();
  const { homeRoster, loaded, saveHomeRoster } = useHomeRoster();

  if (!loaded || !homeRoster) {
    return (
      <View style={styles.center}>
        <Text style={styles.loading}>LOADING...</Text>
      </View>
    );
  }

  const coins = homeRoster.coins;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>LOCKER ROOM</Text>
        <Pop trigger={coins} style={styles.coinPill}>
          <CoinIcon size={12} color={palette.gold} />
          <Text style={styles.coinText}>{coins}</Text>
        </Pop>
      </View>
      <Text style={styles.subtitle}>Spend coins on permanent +1 upgrades</Text>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {homeRoster.players.map((rp, i) => (
          <View key={i} style={styles.row}>
            <PlayerCard rp={rp} />
            <View style={styles.groups}>
              {STAT_GROUPS.map((group) => (
                <View key={group.label} style={styles.group}>
                  <Text style={styles.groupLabel}>{group.label}</Text>
                  <View style={styles.statButtons}>
                    {group.stats.map((s) => {
                      const value = rp.player.stats[s.key];
                      const bought = upgradeCount(homeRoster, rp, s.key);
                      const cost = upgradeCost(s.key, bought);
                      const upgradable = canUpgrade(s.key, value, bought);
                      const afford = coins >= cost;
                      const disabled = !upgradable || !afford;
                      return (
                        <Pressable
                          key={s.key}
                          disabled={disabled}
                          onPress={() => saveHomeRoster(applyUpgrade(homeRoster, i, s.key))}
                          style={[
                            styles.statBtn,
                            isPremiumStat(s.key) && styles.premium,
                            disabled && styles.disabled,
                          ]}
                        >
                          <Text style={styles.statBtnText}>
                            {s.label} {value}
                          </Text>
                          <Text style={styles.statCost}>
                            {upgradable ? `${cost}c` : 'MAX'}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>Done</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bgDeep, padding: space(4), paddingTop: space(10) },
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
  subtitle: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    marginTop: space(2),
  },
  list: { marginTop: space(4), alignSelf: 'stretch' },
  listContent: { gap: space(3), paddingBottom: space(4) },
  row: {
    borderBottomWidth: BORDER.thin,
    borderBottomColor: palette.bgPanel,
    paddingBottom: space(3),
  },
  groups: { marginTop: space(2), gap: space(2) },
  group: { gap: space(1) },
  groupLabel: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, color: palette.inkDim },
  statButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  statBtn: {
    alignItems: 'center',
    paddingVertical: space(1),
    paddingHorizontal: space(2),
    borderWidth: BORDER.thin,
    borderColor: palette.gold,
    borderRadius: RADIUS.chip,
  },
  premium: { borderColor: palette.orange },
  disabled: { opacity: 0.3 },
  statBtnText: { fontFamily: FONT.body, fontSize: FONT_SIZE.small, color: palette.ink },
  statCost: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, color: palette.gold },
  back: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(4),
  },
});
