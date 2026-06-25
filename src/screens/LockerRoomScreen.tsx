import { useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { Pop } from '@/components/fx';
import { haptics } from '@/feel';
import { PlayerCard } from '@/components/run/PlayerCard';
import { StatNumber } from '@/components/run/StatNumber';
import { RosterFilterBar } from '@/components/run/RosterFilterBar';
import { CoinIcon } from '@/components/run/PixelIcons';
import { useHomeRoster } from '@/context/HomeRosterContext';
import { applyUpgrade, totalUpgrades, upgradeCount } from '@/game/home-roster';
import { canUpgrade, isPremiumStat, perStatMax, upgradeCost } from '@/game/upgrades';
import { availableClasses, availablePositions, compareByRatingDesc } from '@/game/roster-filter';
import type { PlayerClass } from '@/game/ratings';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import type { PlayerStats } from '@/types/player';
import type { Position, RosterPlayer } from '@/types/roster';

/**
 * The Locker Room: spend coins between runs on permanent +1 stat upgrades, capped
 * at +5 per stat. Premium stats (outside/playmaking/clutch) cost more. The owned
 * collection is large, so it is searchable + class-filterable, sorted by most
 * recently used (the home-roster order). Mirrors the in-run TrainingView grid.
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
  const [query, setQuery] = useState('');
  const [classes, setClasses] = useState<Set<PlayerClass>>(new Set());
  const [positions, setPositions] = useState<Set<Position>>(new Set());

  if (!loaded || !homeRoster) {
    return (
      <View style={styles.center}>
        <Text style={styles.loading}>LOADING...</Text>
      </View>
    );
  }

  const coins = homeRoster.coins;
  const q = query.trim().toLowerCase();
  const enabledClasses = availableClasses(homeRoster.players);
  const enabledPositions = availablePositions(homeRoster.players);
  // Filter, then surface the highest-rated players first (ties broken by upgrades).
  // The original index is carried through so each upgrade still targets the right
  // player in the home roster.
  const byRating = compareByRatingDesc((rp: RosterPlayer) => totalUpgrades(homeRoster, rp));
  const shown = homeRoster.players
    .map((rp, i) => ({ rp, i }))
    .filter(({ rp }) => {
      if (q && !rp.player.name.toLowerCase().includes(q)) return false;
      if (classes.size > 0 && (!rp.originalClass || !classes.has(rp.originalClass))) return false;
      if (positions.size > 0 && !positions.has(rp.position)) return false;
      return true;
    })
    .sort((a, b) => byRating(a.rp, b.rp));
  const toggleClass = (cls: PlayerClass) =>
    setClasses((prev) => {
      const next = new Set(prev);
      if (next.has(cls)) next.delete(cls);
      else next.add(cls);
      return next;
    });
  const togglePosition = (pos: Position) =>
    setPositions((prev) => {
      const next = new Set(prev);
      if (next.has(pos)) next.delete(pos);
      else next.add(pos);
      return next;
    });

  return (
    <Screen style={styles.container} onBack={() => router.back()}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>LOCKER ROOM</Text>
        <Pop trigger={coins} style={styles.coinPill}>
          <CoinIcon size={12} color={palette.gold} />
          <Text style={styles.coinText}>{coins}</Text>
        </Pop>
      </View>
      <Text style={styles.subtitle}>Spend coins on permanent upgrades (+5 cap per stat)</Text>
      <RosterFilterBar
        query={query}
        onQuery={setQuery}
        positions={positions}
        onTogglePosition={togglePosition}
        classes={classes}
        onToggleClass={toggleClass}
        enabledPositions={enabledPositions}
        enabledClasses={enabledClasses}
      />

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {shown.map(({ rp, i }) => (
          <View key={`${rp.player.name}-${i}`} style={styles.row}>
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
                      const upgradable = canUpgrade(s.key, value, bought, perStatMax());
                      const afford = coins >= cost;
                      const disabled = !upgradable || !afford;
                      return (
                        <Pressable
                          key={s.key}
                          disabled={disabled}
                          onPress={() => {
                            haptics.selection();
                            saveHomeRoster(applyUpgrade(homeRoster, i, s.key));
                          }}
                          style={[
                            styles.statBtn,
                            isPremiumStat(s.key) && styles.premium,
                            disabled && styles.disabled,
                          ]}
                        >
                          <View style={styles.statBtnLine}>
                            <Text style={styles.statBtnText}>{s.label}</Text>
                            <StatNumber value={value} style={styles.statBtnText} />
                          </View>
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
  statBtnLine: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
  statBtnText: { fontFamily: FONT.body, fontSize: FONT_SIZE.small, color: palette.ink },
  statCost: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, color: palette.gold },
});
