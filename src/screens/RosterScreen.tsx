import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Pressable, FlatList } from 'react-native';
import { useArcadeRouter } from '@/navigation';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { StaggerIn } from '@/components/fx';
import { useIdle } from '@/feel';
import { PlayerCard } from '@/components/run/PlayerCard';
import { RosterFilterBar } from '@/components/run/RosterFilterBar';
import { useHomeRoster } from '@/context/HomeRosterContext';
import { ownedRosterPlayers, totalUpgrades } from '@/game/home-roster';
import { CLASS_ORDER, type PlayerClass } from '@/game/ratings';
import {
  availableClasses,
  availablePositions,
  compareByRatingDesc,
} from '@/game/roster-filter';
import type { Position, RosterPlayer } from '@/types/roster';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * The roster browser: search and filter the full owned collection (now hundreds of
 * players) by name, class, and position, sortable by power / class / name. The list
 * is virtualized (FlatList) so only the visible cards mount. Reuses PlayerCard and
 * the shared RosterFilterBar so it reads the same as the draft.
 */

type Sort = 'recent' | 'power' | 'class' | 'name';
const SORTS: { id: Sort; label: string }[] = [
  { id: 'recent', label: 'RECENT' },
  { id: 'power', label: 'POWER' },
  { id: 'class', label: 'CLASS' },
  { id: 'name', label: 'NAME' },
];

// Quiet the drifting ambience after a stretch with no touch (mirrors the home menu).
const HUB_IDLE_MS = 30000;

/** One browse row: a (memoized) expandable player card. Memoized so toggling one
 * card's stat spread, or scrolling, only re-renders the cards that actually changed.
 * `entering` gates the one-shot stagger to the list's first appearance, so rows
 * recycled back into the window on scroll snap in instead of re-strobing. */
const RosterRow = memo(function RosterRow({
  rp,
  index,
  entering,
  expanded,
  onToggle,
}: {
  rp: RosterPlayer;
  index: number;
  entering: boolean;
  expanded: boolean;
  onToggle: (rp: RosterPlayer) => void;
}) {
  return (
    <StaggerIn index={index} enabled={entering} style={styles.row}>
      <PlayerCard
        rp={rp}
        showSpecialty
        expanded={expanded}
        onToggleExpand={() => onToggle(rp)}
      />
    </StaggerIn>
  );
});

export default function RosterScreen() {
  const nav = useArcadeRouter();
  const { homeRoster, loaded } = useHomeRoster();
  const { idle, bump } = useIdle(HUB_IDLE_MS);
  // Cascade the cards in once on first appearance, then snap recycled rows (no scroll strobe).
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setEntering(false), 800);
    return () => clearTimeout(t);
  }, []);
  const [query, setQuery] = useState('');
  const [classes, setClasses] = useState<Set<PlayerClass>>(new Set());
  const [positions, setPositions] = useState<Set<Position>>(new Set());
  const [sort, setSort] = useState<Sort>('recent');

  // Track the expanded player by object reference, not list slot, so an open stat
  // spread follows the player across re-sorts and filters (the collection can hold
  // duplicate name/position pairs, and ownedRosterPlayers returns stable instances).
  const [expanded, setExpanded] = useState<RosterPlayer | null>(null);
  // Stable toggle so memoized rows only re-render when their own expanded flag flips.
  const onToggle = useCallback(
    (rp: RosterPlayer) => setExpanded((prev) => (prev === rp ? null : rp)),
    []
  );

  const players = useMemo(
    () => (homeRoster ? ownedRosterPlayers(homeRoster) : []),
    [homeRoster]
  );

  const enabledClasses = useMemo(() => availableClasses(players), [players]);
  const enabledPositions = useMemo(
    () => availablePositions(players),
    [players]
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = players.filter((rp) => {
      if (q && !rp.player.name.toLowerCase().includes(q)) return false;
      if (
        classes.size > 0 &&
        (!rp.originalClass || !classes.has(rp.originalClass))
      )
        return false;
      if (positions.size > 0 && !positions.has(rp.position)) return false;
      return true;
    });
    if (sort === 'recent') return filtered; // the collection is already recency-ordered
    if (sort === 'power') {
      const upgradesOf = homeRoster
        ? (rp: RosterPlayer) => totalUpgrades(homeRoster, rp)
        : undefined;
      return filtered.sort(compareByRatingDesc(upgradesOf));
    }
    const classIdx = (rp: (typeof players)[number]) =>
      rp.originalClass ? CLASS_ORDER.indexOf(rp.originalClass) : -1;
    return filtered.sort((a, b) => {
      if (sort === 'name') return a.player.name.localeCompare(b.player.name);
      return (
        classIdx(b) - classIdx(a) || a.player.name.localeCompare(b.player.name)
      ); // class
    });
  }, [players, query, classes, positions, sort, homeRoster]);

  if (!loaded || !homeRoster) {
    return (
      <View style={styles.center}>
        <Text style={styles.loading}>LOADING...</Text>
      </View>
    );
  }

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
    <Screen
      style={styles.container}
      onBack={() => nav.back()}
      backdrop
      backdropPaused={idle}
      vignette
      onTouchStart={bump}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>ROSTER</Text>
        <Text style={styles.count}>{players.length} OWNED</Text>
      </View>
      <RosterFilterBar
        query={query}
        onQuery={setQuery}
        positions={positions}
        onTogglePosition={togglePosition}
        classes={classes}
        onToggleClass={toggleClass}
        enabledPositions={enabledPositions}
        enabledClasses={enabledClasses}
        right={
          <Pressable
            onPress={() =>
              setSort(
                (s) =>
                  SORTS[(SORTS.findIndex((x) => x.id === s) + 1) % SORTS.length]
                    .id
              )
            }
            style={styles.sortBtn}
          >
            <Text style={styles.sortText}>
              {SORTS.find((s) => s.id === sort)?.label}
            </Text>
          </Pressable>
        }
      />
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={shown}
        keyExtractor={(rp, i) => `${rp.player.name}-${rp.position}-${i}`}
        renderItem={({ item, index }) => (
          <RosterRow
            rp={item}
            index={index}
            entering={entering}
            expanded={expanded === item}
            onToggle={onToggle}
          />
        )}
        extraData={expanded}
        windowSize={5}
        initialNumToRender={10}
        removeClippedSubviews
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={styles.empty}>No players match.</Text>}
      />
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
  loading: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space(2),
  },
  title: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h3,
    color: palette.gold,
  },
  count: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
  },
  sortBtn: {
    paddingHorizontal: space(2),
    paddingVertical: space(1.5),
    borderWidth: BORDER.thin,
    borderColor: palette.gold + '88',
    borderRadius: RADIUS.chip,
  },
  sortText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.gold,
  },
  list: { marginTop: space(2), alignSelf: 'stretch' },
  listContent: { gap: space(2), paddingBottom: space(4) },
  row: {
    borderBottomWidth: BORDER.thin,
    borderBottomColor: palette.bgPanel,
    paddingBottom: space(2),
  },
  empty: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(4),
  },
});
