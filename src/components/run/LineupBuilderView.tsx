import { useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Text } from '@/components/StyledText';
import { POSITION_COLOR } from '@/components/game/LineupBoard';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import { ovr, off, def } from '@/game/ratings';
import { POSITIONS, type Position, type Roster, type RosterPlayer } from '@/types/roster';

/**
 * Set your starting five and assign each player to a court slot (PG/SG/SF/PF/C).
 * The slot is where they line up; the player keeps their real position (its badge
 * is unchanged), so a Center can run the point. Tap two players to swap their
 * spots; the five starters end up in slot order (index 0 = PG slot ... 4 = C).
 */

const LINEUP_SIZE = 5;

interface LineupBuilderViewProps {
  roster: Roster;
  onConfirm: (starters: RosterPlayer[], bench: RosterPlayer[]) => void;
  onCancel: () => void;
}

type Cell = { zone: 'slot' | 'bench'; index: number };

const sameCell = (a: Cell | null, b: Cell) =>
  a != null && a.zone === b.zone && a.index === b.index;

export function LineupBuilderView({
  roster,
  onConfirm,
  onCancel,
}: LineupBuilderViewProps) {
  // Seed the five slots from the whole pool so there are always five starters,
  // even if the incoming roster split is uneven.
  const pool = [...roster.starters, ...roster.bench];
  const [starters, setStarters] = useState<RosterPlayer[]>(() =>
    pool.slice(0, LINEUP_SIZE)
  );
  const [bench, setBench] = useState<RosterPlayer[]>(() => pool.slice(LINEUP_SIZE));
  const [picked, setPicked] = useState<Cell | null>(null);

  const playerAt = (c: Cell) => (c.zone === 'slot' ? starters : bench)[c.index];

  const tap = (cell: Cell) => {
    if (!picked) {
      setPicked(cell);
      return;
    }
    if (sameCell(picked, cell)) {
      setPicked(null);
      return;
    }
    // Swap the two cells (slot<->slot reorders, slot<->bench substitutes).
    const a = picked;
    const pa = playerAt(a);
    const pb = playerAt(cell);
    const nextStarters = [...starters];
    const nextBench = [...bench];
    const put = (c: Cell, p: RosterPlayer) => {
      if (c.zone === 'slot') nextStarters[c.index] = p;
      else nextBench[c.index] = p;
    };
    put(a, pb);
    put(cell, pa);
    setStarters(nextStarters);
    setBench(nextBench);
    setPicked(null);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>SET YOUR FIVE</Text>
      <Text style={styles.subtitle}>Tap two players to swap their spots</Text>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        <Text style={styles.sectionLabel}>STARTERS</Text>
        {starters.map((rp, i) => (
          <PlayerRow
            key={`slot-${i}`}
            slot={POSITIONS[i]}
            rp={rp}
            picked={sameCell(picked, { zone: 'slot', index: i })}
            onPress={() => tap({ zone: 'slot', index: i })}
          />
        ))}
        {bench.length > 0 ? (
          <Text style={styles.sectionLabel}>BENCH</Text>
        ) : null}
        {bench.map((rp, i) => (
          <PlayerRow
            key={`bench-${i}`}
            rp={rp}
            picked={sameCell(picked, { zone: 'bench', index: i })}
            onPress={() => tap({ zone: 'bench', index: i })}
          />
        ))}
      </ScrollView>

      <Pressable onPress={() => onConfirm(starters, bench)} style={styles.confirm}>
        <Text style={styles.confirmText}>CONFIRM</Text>
      </Pressable>
      <Pressable onPress={onCancel}>
        <Text style={styles.cancel}>Cancel</Text>
      </Pressable>
    </View>
  );
}

function PlayerRow({
  slot,
  rp,
  picked,
  onPress,
}: {
  /** The court slot label, for a starter row; omitted for bench rows. */
  slot?: Position;
  rp: RosterPlayer;
  picked: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.row, picked && styles.rowPicked]}>
      <View style={styles.slotChip}>
        {slot ? <Text style={styles.slot}>{slot}</Text> : null}
      </View>
      <View style={[styles.posChip, { borderColor: POSITION_COLOR[rp.position] }]}>
        <Text style={[styles.pos, { color: POSITION_COLOR[rp.position] }]}>
          {rp.position}
        </Text>
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {rp.player.name}
      </Text>
      <Text style={styles.stats}>
        OVR{ovr(rp.player.stats, rp.position)} O{off(rp.player.stats)} D
        {def(rp.player.stats)}
      </Text>
    </Pressable>
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
  sectionLabel: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
    marginTop: space(2),
    marginBottom: space(1),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space(2),
    borderWidth: BORDER.chunk,
    borderColor: 'transparent',
    borderRadius: RADIUS.chip,
  },
  rowPicked: { borderColor: palette.gold, backgroundColor: palette.gold + '14' },
  slotChip: {
    width: 30,
    alignItems: 'center',
    marginRight: space(1),
  },
  slot: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.ink,
  },
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
  },
  confirm: {
    marginTop: space(4),
    paddingVertical: space(3),
    borderWidth: BORDER.chunk,
    borderColor: palette.gold,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.gold + '1A',
    alignItems: 'center',
  },
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
