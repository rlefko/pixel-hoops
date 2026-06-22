import { useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Text } from '@/components/StyledText';
import { POSITION_COLOR } from '@/components/game/LineupBoard';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import type { Roster, RosterPlayer } from '@/types/roster';

/** Build your starting five from the whole roster (starters + bench). Any five allowed. */

const LINEUP_SIZE = 5;

interface LineupBuilderViewProps {
  roster: Roster;
  onConfirm: (starters: RosterPlayer[], bench: RosterPlayer[]) => void;
  onCancel: () => void;
}

export function LineupBuilderView({
  roster,
  onConfirm,
  onCancel,
}: LineupBuilderViewProps) {
  const pool = [...roster.starters, ...roster.bench];
  // The current starters are the first five in the pool.
  const [selected, setSelected] = useState<number[]>(() =>
    pool.slice(0, LINEUP_SIZE).map((_, i) => i)
  );

  const toggle = (i: number) => {
    setSelected((sel) => {
      if (sel.includes(i)) return sel.filter((x) => x !== i);
      return sel.length < LINEUP_SIZE ? [...sel, i] : sel;
    });
  };

  const ready = selected.length === LINEUP_SIZE;
  const confirm = () => {
    if (!ready) return;
    const starters = selected.map((i) => pool[i]);
    const bench = pool.filter((_, i) => !selected.includes(i));
    onConfirm(starters, bench);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>SET YOUR FIVE</Text>
      <Text style={styles.subtitle}>
        {selected.length}/{LINEUP_SIZE} selected
      </Text>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
      >
        {pool.map((rp, i) => {
          const on = selected.includes(i);
          return (
            <Pressable
              key={i}
              onPress={() => toggle(i)}
              style={[styles.row, on && styles.rowOn]}
            >
              <View
                style={[
                  styles.posChip,
                  { borderColor: POSITION_COLOR[rp.position] },
                ]}
              >
                <Text
                  style={[styles.pos, { color: POSITION_COLOR[rp.position] }]}
                >
                  {rp.position}
                </Text>
              </View>
              <Text style={styles.name} numberOfLines={1}>
                {rp.player.name}
              </Text>
              <Text style={styles.stats}>
                SH{rp.player.stats.shooting} SP{rp.player.stats.speed} AT
                {rp.player.stats.athleticism}
              </Text>
              <Text style={[styles.check, on && styles.checkOn]}>
                {on ? '★' : '·'}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable
        disabled={!ready}
        onPress={confirm}
        style={[styles.confirm, !ready && styles.disabled]}
      >
        <Text style={styles.confirmText}>CONFIRM</Text>
      </Pressable>
      <Pressable onPress={onCancel}>
        <Text style={styles.cancel}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bgDeep,
    padding: space(5),
    paddingTop: space(10),
  },
  title: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h3,
    color: palette.gold,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(2),
  },
  list: { marginTop: space(4), alignSelf: 'stretch' },
  listContent: { gap: space(1) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space(2),
    borderWidth: BORDER.chunk,
    borderColor: 'transparent',
    borderRadius: RADIUS.chip,
  },
  rowOn: { borderColor: palette.gold, backgroundColor: palette.gold + '14' },
  posChip: {
    width: 34,
    paddingVertical: space(0.5),
    borderWidth: BORDER.chunk,
    borderRadius: RADIUS.chip,
    alignItems: 'center',
    marginRight: space(2),
  },
  pos: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro },
  name: {
    flex: 1,
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.ink,
  },
  stats: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
    marginRight: space(2),
  },
  check: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    width: 18,
    textAlign: 'center',
  },
  checkOn: { color: palette.gold },
  confirm: {
    marginTop: space(4),
    paddingVertical: space(3),
    borderWidth: BORDER.chunk,
    borderColor: palette.gold,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.gold + '1A',
    alignItems: 'center',
  },
  disabled: { opacity: 0.4 },
  confirmText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
    color: palette.gold,
  },
  cancel: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(3),
  },
});
