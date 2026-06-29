import { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, Pressable, FlatList } from 'react-native';
import { Text } from '@/components/StyledText';
import { haptics } from '@/feel';
import { PlayerCard } from '@/components/run/PlayerCard';
import { StatNumber } from '@/components/run/StatNumber';
import { RosterFilterBar } from '@/components/run/RosterFilterBar';
import { useHomeRoster } from '@/context/HomeRosterContext';
import {
  applyUpgrade,
  playerKey,
  totalUpgrades,
  upgradeCount,
  type HomeRoster,
} from '@/game/home-roster';
import { canUpgrade, isPremiumStat, perStatMax, upgradeCost } from '@/game/upgrades';
import { availableClasses, availablePositions, compareByRatingDesc } from '@/game/roster-filter';
import type { PlayerClass } from '@/game/ratings';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import type { PlayerStats } from '@/types/player';
import type { Position, RosterPlayer } from '@/types/roster';

/**
 * The Locker tab: spend coins between runs on permanent +1 stat upgrades, capped
 * at +5 per stat. Premium stats (outside/playmaking/clutch) cost more. The owned
 * collection is large, so it is searchable + class-filterable, sorted by most
 * recently used (the home-roster order), and virtualized (FlatList) so only the
 * visible rows mount. Mirrors the in-run TrainingView grid. The shell (back, title,
 * coin pill) is owned by LockerScreen.
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

/** A rendered row: the live player plus the roster index the upgrade action keys on. */
interface Row {
  rp: RosterPlayer;
  i: number;
}

/** One +1 upgrade button: the stat label, its current value, and its coin cost (or MAX). */
function StatUpgradeButton({
  label,
  value,
  cost,
  upgradable,
  disabled,
  premium,
  onPress,
}: {
  label: string;
  value: number;
  cost: number;
  upgradable: boolean;
  disabled: boolean;
  premium: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.statBtn, premium && styles.premium, disabled && styles.disabled]}
    >
      <View style={styles.statBtnLine}>
        <Text style={styles.statBtnText}>{label}</Text>
        <StatNumber value={value} style={styles.statBtnText} />
      </View>
      <Text style={styles.statCost}>{upgradable ? `${cost}c` : 'MAX'}</Text>
    </Pressable>
  );
}

/**
 * One roster row in the locker grid: the (memoized) player card plus its eight
 * upgrade buttons. Only the visible rows mount, so a few hundred owned players no
 * longer freeze the screen on open, filter, or upgrade.
 */
function LockerRow({
  rp,
  index,
  home,
  coins,
  onUpgrade,
}: {
  rp: RosterPlayer;
  index: number;
  home: HomeRoster;
  coins: number;
  onUpgrade: (index: number, stat: keyof PlayerStats) => void;
}) {
  return (
    <View style={styles.row}>
      <PlayerCard rp={rp} showSpecialty />
      <View style={styles.groups}>
        {STAT_GROUPS.map((group) => (
          <View key={group.label} style={styles.group}>
            <Text style={styles.groupLabel}>{group.label}</Text>
            <View style={styles.statButtons}>
              {group.stats.map((s) => {
                const value = rp.player.stats[s.key];
                const bought = upgradeCount(home, rp, s.key);
                const cost = upgradeCost(s.key, bought);
                const upgradable = canUpgrade(s.key, value, bought, perStatMax());
                return (
                  <StatUpgradeButton
                    key={s.key}
                    label={s.label}
                    value={value}
                    cost={cost}
                    upgradable={upgradable}
                    disabled={!upgradable || coins < cost}
                    premium={isPremiumStat(s.key)}
                    onPress={() => onUpgrade(index, s.key)}
                  />
                );
              })}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export function LockerRoomTab() {
  const { homeRoster, saveHomeRoster } = useHomeRoster();
  const [query, setQuery] = useState('');
  const [classes, setClasses] = useState<Set<PlayerClass>>(new Set());
  const [positions, setPositions] = useState<Set<Position>>(new Set());

  const q = query.trim().toLowerCase();
  // Freeze the row order for this Locker visit. The order is memoized on the FILTER
  // inputs and an order-sensitive roster signature, NOT the live stats, so a +1
  // upgrade (which only raises an overall, never reorders the players array) does not
  // re-sort the list and the card you are tapping stays put across consecutive
  // upgrades. Changing a filter re-orders (expected); leaving and re-entering remounts
  // the tab and re-sorts to current overalls; a new signing changes the signature and
  // re-derives the indices so they never go stale. The captured roster only produces an
  // index ordering; the rows below read the live roster, so the stat numbers stay fresh.
  const rosterSignature = useMemo(
    () => homeRoster?.players.map(playerKey).join('\n') ?? '',
    [homeRoster]
  );
  const orderedIndices = useMemo(() => {
    if (!homeRoster) return [];
    // Precompute each player's total upgrades once, so the sort tiebreaker doesn't
    // recompute it O(n log n) times inside the comparator.
    const upgradesByKey = new Map<string, number>();
    for (const rp of homeRoster.players) {
      upgradesByKey.set(playerKey(rp), totalUpgrades(homeRoster, rp));
    }
    const byRating = compareByRatingDesc((rp: RosterPlayer) => upgradesByKey.get(playerKey(rp)) ?? 0);
    return homeRoster.players
      .map((rp, i) => ({ rp, i }))
      .filter(({ rp }) => {
        if (q && !rp.player.name.toLowerCase().includes(q)) return false;
        if (classes.size > 0 && (!rp.originalClass || !classes.has(rp.originalClass))) return false;
        if (positions.size > 0 && !positions.has(rp.position)) return false;
        return true;
      })
      .sort((a, b) => byRating(a.rp, b.rp))
      .map(({ i }) => i);
  }, [rosterSignature, q, classes, positions]);

  // Buy one +1 against the LIVE roster (read through the latest homeRoster).
  const onUpgrade = useCallback(
    (index: number, stat: keyof PlayerStats) => {
      if (!homeRoster) return;
      haptics.selection();
      saveHomeRoster(applyUpgrade(homeRoster, index, stat));
    },
    [homeRoster, saveHomeRoster]
  );

  if (!homeRoster) return null;

  const coins = homeRoster.coins;
  const enabledClasses = availableClasses(homeRoster.players);
  const enabledPositions = availablePositions(homeRoster.players);
  // Resolve the frozen order back onto the live roster. Indices stay valid because a
  // membership change bumps rosterSignature and re-derives orderedIndices; the guard
  // covers any momentary mismatch.
  const shown = orderedIndices
    .map((i) => ({ rp: homeRoster.players[i], i }))
    .filter((row): row is Row => Boolean(row.rp));
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
    <View style={styles.tab}>
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

      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={shown}
        keyExtractor={(row) => `${row.rp.player.name}-${row.i}`}
        renderItem={({ item }) => (
          <LockerRow
            rp={item.rp}
            index={item.i}
            home={homeRoster}
            coins={coins}
            onUpgrade={onUpgrade}
          />
        )}
        extraData={homeRoster}
        windowSize={5}
        initialNumToRender={8}
        removeClippedSubviews
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={styles.empty}>No players match.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tab: { flex: 1 },
  subtitle: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    marginTop: space(1),
  },
  list: { flex: 1, marginTop: space(4), alignSelf: 'stretch' },
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
  empty: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(4),
  },
});
