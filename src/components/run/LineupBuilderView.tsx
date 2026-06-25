import { useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { PlayerCard } from '@/components/run/PlayerCard';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import { POSITIONS, type Position, type Roster, type RosterPlayer } from '@/types/roster';

/**
 * Set your starting five and assign each player to a court slot (PG/SG/SF/PF/C).
 * The slot is where they line up; the player keeps their real position (its badge
 * is unchanged), so a Center can run the point. Tap two players to swap their
 * spots; the five starters end up in slot order (index 0 = PG slot ... 4 = C).
 * The drafted rotation already bounds team strength, so there is no salary gate.
 */

const LINEUP_SIZE = 5;

interface LineupBuilderViewProps {
  roster: Roster;
  /** Item count in the run bag, shown on the Bag button. */
  bagCount: number;
  onConfirm: (starters: RosterPlayer[], bench: RosterPlayer[]) => void;
  onCancel: () => void;
  /** Commit the current order and open the item bag to manage gear. */
  onOpenBag: (starters: RosterPlayer[], bench: RosterPlayer[]) => void;
  /** Heading + subheading overrides (the pre-run pick reads differently). */
  title?: string;
  subtitle?: string;
  /** Hide the bag button (no items exist before the run starts). */
  hideBag?: boolean;
  /** Hide the cancel link (you cannot back out of starting a run). */
  hideCancel?: boolean;
}

type Cell = { zone: 'slot' | 'bench'; index: number };

const sameCell = (a: Cell | null, b: Cell) =>
  a != null && a.zone === b.zone && a.index === b.index;

export function LineupBuilderView({
  roster,
  bagCount,
  onConfirm,
  onCancel,
  onOpenBag,
  title,
  subtitle,
  hideBag,
  hideCancel,
}: LineupBuilderViewProps) {
  // Seed the five slots from the whole pool so there are always five starters,
  // even if the incoming roster split is uneven.
  const pool = [...roster.starters, ...roster.bench];
  const [starters, setStarters] = useState<RosterPlayer[]>(() =>
    pool.slice(0, LINEUP_SIZE)
  );
  const [bench, setBench] = useState<RosterPlayer[]>(() => pool.slice(LINEUP_SIZE));
  const [picked, setPicked] = useState<Cell | null>(null);
  // Which row's full-ratings panel is open, keyed by its stable cell id so it
  // tracks the cell, not the player, as swaps reorder the pool.
  const [expanded, setExpanded] = useState<string | null>(null);

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

  const canConfirm = starters.length === LINEUP_SIZE;

  return (
    <Screen style={styles.container}>
      <Text style={styles.title}>{title ?? 'SET YOUR FIVE'}</Text>
      <Text style={styles.subtitle}>{subtitle ?? 'Tap two players to swap their spots'}</Text>
      {hideBag ? null : (
        <Pressable style={styles.bagButton} onPress={() => onOpenBag(starters, bench)}>
          <Text style={styles.bagText}>OPEN BAG ({bagCount})</Text>
        </Pressable>
      )}

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        <Text style={styles.sectionLabel}>STARTERS</Text>
        {starters.map((rp, i) => {
          const key = `slot-${i}`;
          return (
            <PlayerRow
              key={key}
              slot={POSITIONS[i]}
              rp={rp}
              picked={sameCell(picked, { zone: 'slot', index: i })}
              expanded={expanded === key}
              onPress={() => tap({ zone: 'slot', index: i })}
              onToggleExpand={() => setExpanded(expanded === key ? null : key)}
            />
          );
        })}
        {bench.length > 0 ? (
          <Text style={styles.sectionLabel}>BENCH</Text>
        ) : null}
        {bench.map((rp, i) => {
          const key = `bench-${i}`;
          return (
            <PlayerRow
              key={key}
              rp={rp}
              picked={sameCell(picked, { zone: 'bench', index: i })}
              expanded={expanded === key}
              onPress={() => tap({ zone: 'bench', index: i })}
              onToggleExpand={() => setExpanded(expanded === key ? null : key)}
            />
          );
        })}
      </ScrollView>

      <Pressable
        onPress={() => onConfirm(starters, bench)}
        disabled={!canConfirm}
        style={[styles.confirm, !canConfirm && styles.confirmDisabled]}
      >
        <Text style={styles.confirmText}>{canConfirm ? 'CONFIRM' : 'NEED FIVE'}</Text>
      </Pressable>
      {hideCancel ? null : (
        <Pressable onPress={onCancel}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      )}
    </Screen>
  );
}

function PlayerRow({
  slot,
  rp,
  picked,
  expanded,
  onPress,
  onToggleExpand,
}: {
  /** The court slot label, for a starter row; omitted for bench rows. */
  slot?: Position;
  rp: RosterPlayer;
  picked: boolean;
  expanded: boolean;
  /** Tapping the row body selects it (for the swap), not the chevron. */
  onPress: () => void;
  onToggleExpand: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.row, picked && styles.rowPicked]}>
      <View style={styles.slotChip}>
        {slot ? <Text style={styles.slot}>{slot}</Text> : null}
      </View>
      <View style={styles.cardWrap}>
        <PlayerCard
          rp={rp}
          condition
          showSpecialty
          expanded={expanded}
          onToggleExpand={onToggleExpand}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: space(5),
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
    alignItems: 'flex-start',
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
    alignSelf: 'flex-start',
    marginTop: space(2),
  },
  slot: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.ink,
  },
  cardWrap: { flex: 1 },
  confirm: {
    marginTop: space(4),
    paddingVertical: space(3),
    borderWidth: BORDER.chunk,
    borderColor: palette.gold,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.gold + '1A',
    alignItems: 'center',
  },
  confirmDisabled: { opacity: 0.4, borderColor: palette.inkDim },
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
  bagButton: {
    alignSelf: 'center',
    marginTop: space(2),
    paddingVertical: space(1.5),
    paddingHorizontal: space(4),
    borderWidth: BORDER.thin,
    borderColor: palette.gold + '88',
    borderRadius: RADIUS.chip,
  },
  bagText: { fontFamily: FONT.display, fontSize: FONT_SIZE.small, color: palette.gold },
});
