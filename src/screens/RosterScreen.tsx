import { useMemo, useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { PlayerCard } from '@/components/run/PlayerCard';
import { RosterFilterBar } from '@/components/run/RosterFilterBar';
import { useHomeRoster } from '@/context/HomeRosterContext';
import { ownedRosterPlayers } from '@/game/home-roster';
import { ovr, CLASS_ORDER, type PlayerClass } from '@/game/ratings';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * The roster browser: search and filter the full owned collection (now hundreds of
 * players) by name and class, sortable by power / class / name. Reuses PlayerCard
 * and the shared RosterFilterBar so it reads the same as the draft.
 */

type Sort = 'recent' | 'power' | 'class' | 'name';
const SORTS: { id: Sort; label: string }[] = [
  { id: 'recent', label: 'RECENT' },
  { id: 'power', label: 'POWER' },
  { id: 'class', label: 'CLASS' },
  { id: 'name', label: 'NAME' },
];

export default function RosterScreen() {
  const router = useRouter();
  const { homeRoster, loaded } = useHomeRoster();
  const [query, setQuery] = useState('');
  const [classes, setClasses] = useState<Set<PlayerClass>>(new Set());
  const [sort, setSort] = useState<Sort>('recent');

  const players = useMemo(
    () => (homeRoster ? ownedRosterPlayers(homeRoster) : []),
    [homeRoster]
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = players.filter((rp) => {
      if (q && !rp.player.name.toLowerCase().includes(q)) return false;
      if (classes.size > 0 && (!rp.originalClass || !classes.has(rp.originalClass))) return false;
      return true;
    });
    const classIdx = (rp: (typeof players)[number]) =>
      rp.originalClass ? CLASS_ORDER.indexOf(rp.originalClass) : -1;
    if (sort === 'recent') return filtered; // the collection is already recency-ordered
    return filtered.sort((a, b) => {
      if (sort === 'name') return a.player.name.localeCompare(b.player.name);
      if (sort === 'class') return classIdx(b) - classIdx(a) || a.player.name.localeCompare(b.player.name);
      return ovr(b.player.stats, b.position) - ovr(a.player.stats, a.position);
    });
  }, [players, query, classes, sort]);

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

  return (
    <Screen style={styles.container} onBack={() => router.back()}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>ROSTER</Text>
        <Text style={styles.count}>{players.length} OWNED</Text>
      </View>
      <RosterFilterBar
        query={query}
        onQuery={setQuery}
        classes={classes}
        onToggleClass={toggleClass}
        right={
          <Pressable
            onPress={() => setSort((s) => SORTS[(SORTS.findIndex((x) => x.id === s) + 1) % SORTS.length].id)}
            style={styles.sortBtn}
          >
            <Text style={styles.sortText}>{SORTS.find((s) => s.id === sort)?.label}</Text>
          </Pressable>
        }
      />
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {shown.map((rp, i) => (
          <View key={`${rp.player.name}-${rp.position}-${i}`} style={styles.row}>
            <PlayerCard rp={rp} />
          </View>
        ))}
        {shown.length === 0 ? <Text style={styles.empty}>No players match.</Text> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space(4) },
  center: { flex: 1, backgroundColor: palette.bgDeep, alignItems: 'center', justifyContent: 'center' },
  loading: { fontFamily: FONT.display, fontSize: FONT_SIZE.body, color: palette.inkDim },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space(2) },
  title: { fontFamily: FONT.display, fontSize: FONT_SIZE.h3, color: palette.gold },
  count: { fontFamily: FONT.display, fontSize: FONT_SIZE.small, color: palette.inkDim },
  sortBtn: {
    paddingHorizontal: space(2),
    paddingVertical: space(1.5),
    borderWidth: BORDER.thin,
    borderColor: palette.gold + '88',
    borderRadius: RADIUS.chip,
  },
  sortText: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, color: palette.gold },
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
