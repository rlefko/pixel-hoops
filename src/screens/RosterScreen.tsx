import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Pressable, FlatList } from 'react-native';
import { useArcadeRouter } from '@/navigation';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { StaggerIn } from '@/components/fx';
import { useHubBackdrop } from '@/feel';
import { PlayerCard } from '@/components/run/PlayerCard';
import { RosterFilterBar } from '@/components/run/RosterFilterBar';
import { FavorIcon } from '@/components/run/PixelIcons';
import { useHomeRoster } from '@/context/HomeRosterContext';
import {
  clearScoutTarget,
  collectingRosterPlayers,
  ownedRosterPlayers,
  pinScoutTarget,
  playerKey,
  totalUpgrades,
} from '@/game/home-roster';
import { FAVOR_PER_COPY } from '@/game/favor';
import { tierForClass } from '@/game/player-gacha';
import { playerDraftClass } from '@/game/draft';
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

/** One browse row: a (memoized) expandable player card. Memoized so toggling one
 * card's stat spread, or scrolling, only re-renders the cards that actually changed.
 * `entering` gates the one-shot stagger to the list's first appearance, so rows
 * recycled back into the window on scroll snap in instead of re-strobing. */
const RosterRow = memo(function RosterRow({
  rp,
  collect,
  index,
  entering,
  expanded,
  onToggle,
  pinnable,
  pinned,
  favorLabel,
  onPin,
}: {
  rp: RosterPlayer;
  collect?: { copies: number; threshold: number };
  index: number;
  entering: boolean;
  expanded: boolean;
  onToggle: (rp: RosterPlayer) => void;
  /** In-progress rows only: this player can be pinned as their machine's scout target. */
  pinnable?: boolean;
  pinned?: boolean;
  /** Banked favor toward the next copy (e.g. "23/40 FAVOR"), when any. */
  favorLabel?: string | null;
  onPin?: (rp: RosterPlayer) => void;
}) {
  return (
    <StaggerIn index={index} enabled={entering} style={styles.row}>
      <PlayerCard
        rp={rp}
        collect={collect}
        showSpecialty
        expanded={expanded}
        onToggleExpand={() => onToggle(rp)}
      />
      {pinnable ? (
        <Pressable onPress={() => onPin?.(rp)} style={styles.pinRow} hitSlop={space(1)}>
          <FavorIcon size={10} color={pinned ? palette.gold : palette.inkDim} />
          {favorLabel ? <Text style={styles.pinFavor}>{favorLabel}</Text> : null}
          <Text style={[styles.pinText, pinned && styles.pinTextActive]}>
            {pinned ? 'SCOUT TARGET' : 'SET SCOUT TARGET'}
          </Text>
        </Pressable>
      ) : null}
    </StaggerIn>
  );
});

/** A browse row: an owned player, or an in-progress one carrying its copies meter. */
type BrowseItem = { rp: RosterPlayer; collect?: { copies: number; threshold: number } };

export default function RosterScreen() {
  const nav = useArcadeRouter();
  const { homeRoster, loaded, saveHomeRoster } = useHomeRoster();
  const { screenProps } = useHubBackdrop();
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
  // Toggle to browse IN-PROGRESS players (collected, not yet owned) instead of the roster.
  const [showCollecting, setShowCollecting] = useState(false);

  // Track the expanded player by object reference, not list slot, so an open stat
  // spread follows the player across re-sorts and filters (the collection can hold
  // duplicate name/position pairs, and ownedRosterPlayers returns stable instances).
  const [expanded, setExpanded] = useState<RosterPlayer | null>(null);
  // Pin (or unpin) an in-progress player as their machine's scout target, so every
  // pull of that machine feeds this exact chase (pin/clear are no-ops on invalid
  // keys). The ref keeps the callback identity-stable across saves, so a pin tap
  // only re-renders the rows whose pinned/favor props actually changed.
  const homeRosterRef = useRef(homeRoster);
  homeRosterRef.current = homeRoster;
  const onPin = useCallback(
    (rp: RosterPlayer) => {
      const home = homeRosterRef.current;
      if (!home) return;
      const tier = tierForClass(playerDraftClass(rp));
      if (!tier) return;
      const key = playerKey(rp);
      saveHomeRoster(
        home.scoutTargets?.[tier] === key
          ? clearScoutTarget(home, tier)
          : pinScoutTarget(home, tier, key)
      );
    },
    [saveHomeRoster]
  );

  // Stable toggle so memoized rows only re-render when their own expanded flag flips.
  const onToggle = useCallback(
    (rp: RosterPlayer) => setExpanded((prev) => (prev === rp ? null : rp)),
    []
  );

  const players = useMemo(
    () => (homeRoster ? ownedRosterPlayers(homeRoster) : []),
    [homeRoster]
  );
  const collectingRows = useMemo(
    () => (homeRoster ? collectingRosterPlayers(homeRoster) : []),
    [homeRoster]
  );
  // Map an in-progress player key to its meter, so the browse list can attach it.
  const collectByKey = useMemo(() => {
    const map = new Map<RosterPlayer, { copies: number; threshold: number }>();
    for (const r of collectingRows) map.set(r.player, { copies: r.copies, threshold: r.threshold });
    return map;
  }, [collectingRows]);

  // The player set the filter chips + list draw from (owned, or the in-progress ones).
  const sourcePlayers = useMemo(
    () => (showCollecting ? collectingRows.map((r) => r.player) : players),
    [showCollecting, collectingRows, players]
  );
  const enabledClasses = useMemo(() => availableClasses(sourcePlayers), [sourcePlayers]);
  const enabledPositions = useMemo(() => availablePositions(sourcePlayers), [sourcePlayers]);

  const shown = useMemo<BrowseItem[]>(() => {
    const q = query.trim().toLowerCase();
    const filtered = sourcePlayers.filter((rp) => {
      if (q && !rp.player.name.toLowerCase().includes(q)) return false;
      if (classes.size > 0 && (!rp.originalClass || !classes.has(rp.originalClass))) return false;
      if (positions.size > 0 && !positions.has(rp.position)) return false;
      return true;
    });
    // In-progress players keep their collection order (nearest additions first); no re-sort.
    const ordered =
      showCollecting || sort === 'recent'
        ? filtered
        : sort === 'power'
          ? filtered.slice().sort(
              compareByRatingDesc(homeRoster ? (rp) => totalUpgrades(homeRoster, rp) : undefined)
            )
          : filtered.slice().sort((a, b) => {
              if (sort === 'name') return a.player.name.localeCompare(b.player.name);
              const classIdx = (rp: RosterPlayer) =>
                rp.originalClass ? CLASS_ORDER.indexOf(rp.originalClass) : -1;
              return classIdx(b) - classIdx(a) || a.player.name.localeCompare(b.player.name);
            });
    return ordered.map((rp) => ({ rp, collect: collectByKey.get(rp) }));
  }, [sourcePlayers, showCollecting, query, classes, positions, sort, homeRoster, collectByKey]);

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
    <Screen style={styles.container} onBack={() => nav.back()} {...screenProps}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>ROSTER</Text>
        <View style={styles.headerRight}>
          {collectingRows.length > 0 ? (
            <Pressable
              onPress={() => setShowCollecting((v) => !v)}
              style={[styles.progressBtn, showCollecting && styles.progressBtnActive]}
            >
              <Text style={[styles.progressText, showCollecting && styles.progressTextActive]}>
                IN PROGRESS {collectingRows.length}
              </Text>
            </Pressable>
          ) : null}
          <Text style={styles.count}>
            {showCollecting ? `${collectingRows.length} IN PROGRESS` : `${players.length} OWNED`}
          </Text>
        </View>
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
        keyExtractor={(item, i) => `${item.rp.player.name}-${item.rp.position}-${i}`}
        renderItem={({ item, index }) => {
          // Pin/favor props exist only on the in-progress tab: the favor ledger holds
          // un-owned players only, so the owned tab would derive nulls per row.
          const tier = showCollecting ? tierForClass(playerDraftClass(item.rp)) : null;
          const key = tier ? playerKey(item.rp) : '';
          const favorPoints = tier ? (homeRoster.favor[key] ?? 0) : 0;
          const perCopy = tier ? (FAVOR_PER_COPY[playerDraftClass(item.rp)] ?? 0) : 0;
          return (
            <RosterRow
              rp={item.rp}
              collect={item.collect}
              index={index}
              entering={entering}
              expanded={expanded === item.rp}
              onToggle={onToggle}
              pinnable={tier != null}
              pinned={tier != null && homeRoster.scoutTargets?.[tier] === key}
              favorLabel={
                favorPoints > 0 && perCopy > 0 ? `${favorPoints}/${perCopy} FAVOR` : null
              }
              onPin={onPin}
            />
          );
        }}
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
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  progressBtn: {
    paddingHorizontal: space(2),
    paddingVertical: space(1),
    borderWidth: BORDER.thin,
    borderColor: palette.steelBlue + '88',
    borderRadius: RADIUS.chip,
  },
  progressBtnActive: { backgroundColor: palette.steelBlue + '33', borderColor: palette.steelBlue },
  progressText: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, color: palette.steelBlue },
  progressTextActive: { color: palette.steelBlue },
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
  pinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
    paddingVertical: space(1),
    paddingHorizontal: space(1),
  },
  pinFavor: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.steelBlue,
  },
  pinText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
  },
  pinTextActive: { color: palette.gold },
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
