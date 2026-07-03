import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Pressable, FlatList } from 'react-native';
import { Text } from '@/components/StyledText';
import { haptics, sfx } from '@/feel';
import { StaggerIn } from '@/components/fx';
import { PlayerCard } from '@/components/run/PlayerCard';
import { StatNumber } from '@/components/run/StatNumber';
import { RosterFilterBar } from '@/components/run/RosterFilterBar';
import { useHomeRoster } from '@/context/HomeRosterContext';
import { applyUpgrade, playerKey, totalUpgrades } from '@/game/home-roster';
import {
  affordMask,
  canUpgrade,
  isPremiumStat,
  maskBit,
  perStatMax,
  upgradeCost,
} from '@/game/upgrades';
import {
  availableClasses,
  availablePositions,
  compareByRatingDesc,
} from '@/game/roster-filter';
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
      style={[
        styles.statBtn,
        premium && styles.premium,
        disabled && styles.disabled,
      ]}
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
 *
 * memo'd behind identity-stable props: applyUpgrade structurally shares every
 * untouched player object and per-player `upgrades` ledger entry, and affordability
 * arrives pre-computed as a bitmask, so an upgrade spend re-renders ONLY the tapped
 * row (plus rows whose afford bit flipped when the wallet crossed a cost threshold)
 * instead of every visible row's ~50-element subtree. The identity contract: any
 * future flow that mutates rp.player.stats or a ledger entry in place, instead of
 * immutably like applyUpgrade / the settle merge / deserialize, breaks this memo.
 */
const LockerRow = memo(function LockerRow({
  rp,
  index,
  listIndex,
  entering,
  upgrades,
  mask,
  onUpgrade,
}: {
  rp: RosterPlayer;
  index: number;
  listIndex: number;
  entering: boolean;
  /** This player's permanent-upgrade ledger entry (identity-stable across saves). */
  upgrades: Partial<Record<keyof PlayerStats, number>> | undefined;
  /** affordMask() of this player: which stats are under-cap AND affordable now. */
  mask: number;
  onUpgrade: (index: number, stat: keyof PlayerStats) => void;
}) {
  return (
    <StaggerIn index={listIndex} enabled={entering} style={styles.row}>
      <PlayerCard rp={rp} showSpecialty />
      <View style={styles.groups}>
        {STAT_GROUPS.map((group) => (
          <View key={group.label} style={styles.group}>
            <Text style={styles.groupLabel}>{group.label}</Text>
            <View style={styles.statButtons}>
              {group.stats.map((s) => {
                const value = rp.player.stats[s.key];
                const bought = upgrades?.[s.key] ?? 0;
                const upgradable = canUpgrade(s.key, value, bought, perStatMax());
                return (
                  <StatUpgradeButton
                    key={s.key}
                    label={s.label}
                    value={value}
                    cost={upgradeCost(s.key, bought)}
                    upgradable={upgradable}
                    disabled={!maskBit(mask, s.key)}
                    premium={isPremiumStat(s.key)}
                    onPress={() => onUpgrade(index, s.key)}
                  />
                );
              })}
            </View>
          </View>
        ))}
      </View>
    </StaggerIn>
  );
});

export function LockerRoomTab() {
  const { homeRoster, saveHomeRoster } = useHomeRoster();
  const [query, setQuery] = useState('');
  const [classes, setClasses] = useState<Set<PlayerClass>>(new Set());
  const [positions, setPositions] = useState<Set<Position>>(new Set());
  // Cascade rows in once on first appearance, then snap recycled rows (no scroll strobe).
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setEntering(false), 800);
    return () => clearTimeout(t);
  }, []);

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
    const byRating = compareByRatingDesc(
      (rp: RosterPlayer) => upgradesByKey.get(playerKey(rp)) ?? 0
    );
    return homeRoster.players
      .map((rp, i) => ({ rp, i }))
      .filter(({ rp }) => {
        if (q && !rp.player.name.toLowerCase().includes(q)) return false;
        if (
          classes.size > 0 &&
          (!rp.originalClass || !classes.has(rp.originalClass))
        )
          return false;
        if (positions.size > 0 && !positions.has(rp.position)) return false;
        return true;
      })
      .sort((a, b) => byRating(a.rp, b.rp))
      .map(({ i }) => i);
  }, [rosterSignature, q, classes, positions]);

  // Buy one +1 against the LIVE roster, read through a ref (the onPin precedent in
  // RosterScreen): the callback identity never churns on a save, so the memoized
  // rows keep their props across consecutive upgrades instead of all re-rendering
  // on every tap. saveHomeRoster is already identity-stable (deps [writer]).
  const homeRosterRef = useRef(homeRoster);
  homeRosterRef.current = homeRoster;
  const onUpgrade = useCallback(
    (index: number, stat: keyof PlayerStats) => {
      const home = homeRosterRef.current;
      if (!home) return;
      haptics.selection();
      sfx.tick(0.9); // a notch below the in-run training tick: a spend, not a gain
      saveHomeRoster(applyUpgrade(home, index, stat));
    },
    [saveHomeRoster]
  );

  // Filter-bar inputs, all identity-stable across an upgrade tap: the enabled sets
  // are keyed on the roster signature (membership + order; a player's class and
  // position can never change without changing their playerKey), and the togglers
  // are functional updaters, so the memoized bar bails on every spend.
  const players = homeRoster?.players;
  const enabledClasses = useMemo(
    () => (players ? availableClasses(players) : new Set<PlayerClass>()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rosterSignature]
  );
  const enabledPositions = useMemo(
    () => (players ? availablePositions(players) : new Set<Position>()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rosterSignature]
  );
  const toggleClass = useCallback(
    (cls: PlayerClass) =>
      setClasses((prev) => {
        const next = new Set(prev);
        if (next.has(cls)) next.delete(cls);
        else next.add(cls);
        return next;
      }),
    []
  );
  const togglePosition = useCallback(
    (pos: Position) =>
      setPositions((prev) => {
        const next = new Set(prev);
        if (next.has(pos)) next.delete(pos);
        else next.add(pos);
        return next;
      }),
    []
  );

  // Resolve the frozen order back onto the live roster. Indices stay valid because a
  // membership change bumps rosterSignature and re-derives orderedIndices; the guard
  // covers any momentary mismatch. Memoized so only saves and re-orders rebuild it
  // (an upgrade replaces the players array, so the tapped row resolves its fresh
  // player object while untouched rows keep identity for the memo bail).
  const shown = useMemo(
    () =>
      homeRoster
        ? orderedIndices
            .map((i) => ({ rp: homeRoster.players[i], i }))
            .filter((row): row is Row => Boolean(row.rp))
        : [],
    [orderedIndices, homeRoster]
  );

  if (!homeRoster) return null;

  const coins = homeRoster.coins;

  return (
    <View style={styles.tab}>
      <Text style={styles.subtitle}>
        Spend coins on permanent upgrades (+5 cap per stat)
      </Text>
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
        renderItem={({ item, index }) => {
          // Cheap per-cell derivations (a map lookup + 8 arithmetic ops); the row
          // itself bails via memo unless ITS inputs changed.
          const upgrades = homeRoster.upgrades[playerKey(item.rp)];
          return (
            <LockerRow
              rp={item.rp}
              index={item.i}
              listIndex={index}
              entering={entering}
              upgrades={upgrades}
              mask={affordMask(item.rp.player.stats, upgrades, coins)}
              onUpgrade={onUpgrade}
            />
          );
        }}
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
  groupLabel: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
  },
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
  statBtnText: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.ink,
  },
  statCost: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.gold,
  },
  empty: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(4),
  },
});
