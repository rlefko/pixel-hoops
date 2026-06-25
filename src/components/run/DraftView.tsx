import { useMemo, useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { PlayerCard } from '@/components/run/PlayerCard';
import { RosterFilterBar } from '@/components/run/RosterFilterBar';
import { DRAFT_COST_COLOR, CLASS_COLOR } from '@/components/run/class-ui';
import {
  draftCostFor,
  draftSpend,
  draftPoints,
  canConfirmLoadout,
  playerDraftClass,
  MAX_DRAFT_ROTATION,
} from '@/game/draft';
import { type Difficulty, type LadderClass, DIFFICULTY_LABELS } from '@/game/difficulty-mode';
import { ovr, type PlayerClass } from '@/game/ratings';
import { applyTrainingDelta } from '@/game/effects';
import { POSITION_COLOR } from '@/components/game/positionColor';
import { POSITIONS } from '@/types/roster';
import type { RosterPlayer } from '@/types/roster';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * The pre-run loadout draft: fill 5 court slots (PG/SG/SF/PF/C) + up to 3 bench
 * from the owned collection under the difficulty's point budget (cost by class
 * relative to the ladder). Pre-populated with the previous lineup. Tap a slot to
 * select it, tap a collection player to assign (swapping the displaced player
 * back). All five starter slots are required to start.
 */
const STARTER_SLOTS = 5;
const BENCH_SLOTS = MAX_DRAFT_ROTATION - STARTER_SLOTS; // 3

interface DraftViewProps {
  available: RosterPlayer[];
  defaultStarters: RosterPlayer[];
  defaultBench: RosterPlayer[];
  difficulty: Difficulty;
  ladderClass: LadderClass;
  onConfirm: (starters: RosterPlayer[], bench: RosterPlayer[]) => void;
}

const keyOf = (rp: RosterPlayer): string => `${rp.player.name}|${rp.position}`;
const firstEmpty = (slots: (RosterPlayer | null)[]): number => {
  const i = slots.findIndex((s) => s === null);
  return i === -1 ? 0 : i;
};

export function DraftView({
  available,
  defaultStarters,
  defaultBench,
  difficulty,
  ladderClass,
  onConfirm,
}: DraftViewProps) {
  const [slots, setSlots] = useState<(RosterPlayer | null)[]>(() => {
    const s: (RosterPlayer | null)[] = Array(MAX_DRAFT_ROTATION).fill(null);
    defaultStarters.slice(0, STARTER_SLOTS).forEach((p, i) => (s[i] = p));
    defaultBench.slice(0, BENCH_SLOTS).forEach((p, i) => (s[STARTER_SLOTS + i] = p));
    return s;
  });
  const [selected, setSelected] = useState<number>(() => firstEmpty(slots));
  const [query, setQuery] = useState('');
  const [classes, setClasses] = useState<Set<PlayerClass>>(new Set());

  const inLoadout = useMemo(
    () => new Set(slots.filter((s): s is RosterPlayer => !!s).map(keyOf)),
    [slots]
  );

  const assign = (rp: RosterPlayer) => {
    if (draftCostFor(rp, ladderClass) === null) return; // barred
    if (slots.some((s) => s && keyOf(s) === keyOf(rp))) return; // already slotted
    const next = [...slots];
    next[selected] = rp; // any displaced player drops back to the collection
    setSlots(next);
    setSelected(firstEmpty(next)); // advance to the next empty slot for fast filling
  };

  const clearSlot = (i: number) => {
    setSlots((prev) => prev.map((s, j) => (j === i ? null : s)));
    setSelected(i);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return available.filter((rp) => {
      if (inLoadout.has(keyOf(rp))) return false;
      if (q && !rp.player.name.toLowerCase().includes(q)) return false;
      if (classes.size > 0 && (!rp.originalClass || !classes.has(rp.originalClass))) return false;
      return true;
    });
  }, [available, inLoadout, query, classes]);

  const starters = slots.slice(0, STARTER_SLOTS).filter((s): s is RosterPlayer => !!s);
  const bench = slots.slice(STARTER_SLOTS).filter((s): s is RosterPlayer => !!s);
  const picks = [...starters, ...bench];
  const spent = draftSpend(picks, ladderClass);
  const budget = draftPoints(difficulty);
  const confirmable = canConfirmLoadout(starters, bench, ladderClass, difficulty);

  const toggleClass = (cls: PlayerClass) =>
    setClasses((prev) => {
      const next = new Set(prev);
      if (next.has(cls)) next.delete(cls);
      else next.add(cls);
      return next;
    });

  return (
    <Screen style={styles.container}>
      <Text style={styles.title}>DRAFT YOUR LINEUP</Text>
      <Text style={styles.subtitle}>
        {DIFFICULTY_LABELS[difficulty].name} · {ladderClass} · POINTS {spent}/{budget}
      </Text>

      <View style={styles.board}>
        {slots.map((rp, i) => {
          const isStarter = i < STARTER_SLOTS;
          const label = isStarter ? POSITIONS[i] : 'B';
          return (
            <Slot
              key={i}
              label={label}
              rp={rp}
              ladderClass={ladderClass}
              selected={selected === i}
              onSelect={() => setSelected(i)}
              onClear={() => clearSlot(i)}
            />
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>
        {slots[selected] ? 'TAP A PLAYER TO REPLACE THE SELECTED SLOT' : 'TAP A PLAYER FOR THE SELECTED SLOT'}
      </Text>
      <RosterFilterBar query={query} onQuery={setQuery} classes={classes} onToggleClass={toggleClass} />

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {filtered.map((rp, i) => {
          const cost = draftCostFor(rp, ladderClass);
          const barred = cost === null;
          return (
            <Pressable
              key={`${keyOf(rp)}-${i}`}
              onPress={() => assign(rp)}
              disabled={barred}
              style={[styles.row, barred && styles.rowBarred]}
            >
              <View style={styles.cardWrap}>
                <PlayerCard rp={rp} compact />
              </View>
              <CostBadge cost={cost} />
            </Pressable>
          );
        })}
        {filtered.length === 0 ? <Text style={styles.empty}>No players match.</Text> : null}
      </ScrollView>

      <Pressable
        onPress={() => onConfirm(starters, bench)}
        disabled={!confirmable.ok}
        style={[styles.confirm, !confirmable.ok && styles.confirmDisabled]}
      >
        <Text style={styles.confirmText}>{confirmable.ok ? 'START RUN' : (confirmable.reason ?? 'INVALID')}</Text>
      </Pressable>
    </Screen>
  );
}

function Slot({
  label,
  rp,
  ladderClass,
  selected,
  onSelect,
  onClear,
}: {
  label: string;
  rp: RosterPlayer | null;
  ladderClass: LadderClass;
  selected: boolean;
  onSelect: () => void;
  onClear: () => void;
}) {
  // Show the player's intrinsic class (originalClass), matching the draft-cost
  // badge beside it, so an S+ legend reads S+ instead of being recomputed down to
  // B from its position-weighted OVR.
  const cls = rp ? playerDraftClass(rp) : null;
  const cost = rp ? draftCostFor(rp, ladderClass) : null;
  // The selected player's natural position and effective OVR, computed exactly as
  // PlayerCard does (training folded in) so the slot reads the same strength the
  // player sees when scouting the card below. Position is the player's intrinsic
  // floor position, which can differ from this slot's label when slotted out of
  // spot or onto the bench, so a draftee's fit is legible at a glance.
  const overall = rp ? ovr(applyTrainingDelta(rp.player.stats, rp.trainingDelta), rp.position) : null;
  return (
    <Pressable onPress={onSelect} style={[styles.slot, selected && styles.slotSelected]}>
      <View style={styles.slotMain}>
        <Text style={styles.slotLabel}>{label}</Text>
        {rp ? (
          <>
            <Text style={styles.slotName} numberOfLines={1}>
              {rp.player.name}
            </Text>
            <Pressable onPress={onClear} hitSlop={space(2)} style={styles.slotClear}>
              <Text style={styles.slotClearText}>x</Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.slotEmpty}>empty</Text>
        )}
      </View>
      {rp ? (
        <View style={styles.slotMeta}>
          <View style={[styles.slotPos, { borderColor: POSITION_COLOR[rp.position] }]}>
            <Text style={[styles.slotPosText, { color: POSITION_COLOR[rp.position] }]}>
              {rp.position}
            </Text>
          </View>
          <Text style={styles.slotOvr}>{overall}</Text>
          {cls ? <Text style={[styles.slotClass, { color: CLASS_COLOR[cls] }]}>{cls}</Text> : null}
          <Text style={[styles.slotCost, { color: cost != null ? DRAFT_COST_COLOR[cost] : palette.inkDim }]}>
            {cost === 0 ? 'FREE' : `${cost}p`}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function CostBadge({ cost }: { cost: number | null }) {
  if (cost === null) {
    return (
      <View style={[styles.cost, { borderColor: palette.inkDim }]}>
        <Text style={[styles.costText, { color: palette.inkDim }]}>—</Text>
      </View>
    );
  }
  const color = DRAFT_COST_COLOR[cost] ?? palette.inkDim;
  return (
    <View style={[styles.cost, { borderColor: color }]}>
      <Text style={[styles.costText, { color }]}>{cost === 0 ? 'FREE' : `${cost}p`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space(4) },
  title: { fontFamily: FONT.display, fontSize: FONT_SIZE.h3, color: palette.gold, textAlign: 'center' },
  subtitle: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(1),
    marginBottom: space(2),
  },
  board: { flexDirection: 'row', flexWrap: 'wrap', gap: space(1) },
  slot: {
    flexDirection: 'column',
    gap: space(0.5),
    width: '48.5%',
    paddingVertical: space(1),
    paddingHorizontal: space(2),
    borderWidth: BORDER.chunk,
    borderColor: palette.bgPanel,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.bgPanel,
  },
  slotSelected: { borderColor: palette.gold },
  slotMain: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
  // The position chip + OVR + class + cost share a meta row, indented under the
  // name (past the fixed-width slot label) so the strength read lines up cleanly.
  slotMeta: { flexDirection: 'row', alignItems: 'center', gap: space(1.5), marginLeft: 22 + space(1) },
  slotLabel: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, color: palette.inkDim, width: 22 },
  slotName: { flex: 1, fontFamily: FONT.body, fontSize: FONT_SIZE.small, color: palette.ink },
  slotPos: {
    paddingHorizontal: space(1),
    borderWidth: BORDER.thin,
    borderRadius: RADIUS.chip,
    alignItems: 'center',
  },
  slotPosText: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro },
  slotOvr: { fontFamily: FONT.display, fontSize: FONT_SIZE.small, color: palette.ink },
  slotClass: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro },
  slotCost: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro },
  slotEmpty: { flex: 1, fontFamily: FONT.body, fontSize: FONT_SIZE.small, color: palette.inkDim, fontStyle: 'italic' },
  slotClear: { paddingHorizontal: space(0.5) },
  slotClearText: { fontFamily: FONT.display, fontSize: FONT_SIZE.small, color: palette.inkDim },
  sectionLabel: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.gold,
    marginTop: space(3),
    marginBottom: space(1),
  },
  list: { marginTop: space(2), alignSelf: 'stretch' },
  listContent: { gap: space(0.5), paddingBottom: space(2) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space(0.5),
    paddingHorizontal: space(1),
    borderRadius: RADIUS.chip,
  },
  rowBarred: { opacity: 0.35 },
  cardWrap: { flex: 1 },
  cost: {
    minWidth: 40,
    alignItems: 'center',
    paddingVertical: space(0.5),
    paddingHorizontal: space(1),
    borderWidth: BORDER.thin,
    borderRadius: RADIUS.chip,
    marginLeft: space(1),
  },
  costText: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro },
  empty: { fontFamily: FONT.body, fontSize: FONT_SIZE.body, color: palette.inkDim, textAlign: 'center', marginTop: space(4) },
  confirm: {
    marginTop: space(2),
    paddingVertical: space(2.5),
    borderWidth: BORDER.chunk,
    borderColor: palette.gold,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.gold + '1A',
    alignItems: 'center',
  },
  confirmDisabled: { opacity: 0.4, borderColor: palette.inkDim },
  confirmText: { fontFamily: FONT.display, fontSize: FONT_SIZE.body, color: palette.gold },
});
