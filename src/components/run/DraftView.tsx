import { useMemo, useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { PlayerCard } from '@/components/run/PlayerCard';
import { RosterFilterBar } from '@/components/run/RosterFilterBar';
import { DRAFT_COST_COLOR } from '@/components/run/class-ui';
import { suggestDraft } from '@/game/run-machine';
import {
  draftCostFor,
  evaluateDraft,
  canConfirmDraft,
  MAX_DRAFT_ROTATION,
} from '@/game/draft';
import { type Difficulty, type LadderClass, DIFFICULTY_LABELS } from '@/game/difficulty-mode';
import type { PlayerClass } from '@/game/ratings';
import type { RosterPlayer } from '@/types/roster';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * The pre-run DRAFT: pick a rotation (5-8) from the owned collection under the
 * difficulty's point budget, paying by each player's class relative to the run's
 * ladder. Cost badges are color-coded (free / at-class / premium), barred players
 * are dimmed, and a live points meter gates the start. Replaces the salary cap.
 */
interface DraftViewProps {
  available: RosterPlayer[];
  difficulty: Difficulty;
  ladderClass: LadderClass;
  onConfirm: (rotation: RosterPlayer[]) => void;
}

export function DraftView({ available, difficulty, ladderClass, onConfirm }: DraftViewProps) {
  const [picked, setPicked] = useState<RosterPlayer[]>(() =>
    suggestDraft(available, ladderClass, difficulty)
  );
  const [query, setQuery] = useState('');
  const [classes, setClasses] = useState<Set<PlayerClass>>(new Set());

  const pickedSet = useMemo(() => new Set(picked), [picked]);

  const toggle = (rp: RosterPlayer) => {
    setPicked((prev) => {
      if (prev.includes(rp)) return prev.filter((p) => p !== rp);
      if (prev.length >= MAX_DRAFT_ROTATION) return prev; // rotation full
      if (draftCostFor(rp, ladderClass) === null) return prev; // barred
      return [...prev, rp];
    });
  };

  const toggleClass = (cls: PlayerClass) =>
    setClasses((prev) => {
      const next = new Set(prev);
      if (next.has(cls)) next.delete(cls);
      else next.add(cls);
      return next;
    });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return available.filter((rp) => {
      if (q && !rp.player.name.toLowerCase().includes(q)) return false;
      if (classes.size > 0 && (!rp.originalClass || !classes.has(rp.originalClass))) return false;
      return true;
    });
  }, [available, query, classes]);

  const draft = evaluateDraft(picked, ladderClass, difficulty);
  const confirmable = canConfirmDraft(picked, ladderClass, difficulty);

  return (
    <Screen style={styles.container}>
      <Text style={styles.title}>DRAFT YOUR ROTATION</Text>
      <Text style={styles.subtitle}>
        {DIFFICULTY_LABELS[difficulty].name} · {ladderClass} LADDER
      </Text>
      <View style={styles.meters}>
        <Text style={[styles.meter, draft.over && styles.meterOver]}>
          POINTS {draft.spent} / {draft.budget}
        </Text>
        <Text style={styles.meter}>
          ROTATION {picked.length} / {MAX_DRAFT_ROTATION}
        </Text>
      </View>

      <RosterFilterBar query={query} onQuery={setQuery} classes={classes} onToggleClass={toggleClass} />

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {filtered.map((rp, i) => {
          const cost = draftCostFor(rp, ladderClass);
          const barred = cost === null;
          const selected = pickedSet.has(rp);
          return (
            <Pressable
              key={`${rp.player.name}-${rp.position}-${i}`}
              onPress={() => toggle(rp)}
              disabled={barred && !selected}
              style={[styles.row, selected && styles.rowSelected, barred && styles.rowBarred]}
            >
              <View style={styles.cardWrap}>
                <PlayerCard rp={rp} compact />
              </View>
              <CostBadge cost={cost} />
            </Pressable>
          );
        })}
        {filtered.length === 0 ? (
          <Text style={styles.empty}>No players match.</Text>
        ) : null}
      </ScrollView>

      <Pressable
        onPress={() => onConfirm(picked)}
        disabled={!confirmable.ok}
        style={[styles.confirm, !confirmable.ok && styles.confirmDisabled]}
      >
        <Text style={styles.confirmText}>
          {confirmable.ok ? 'START RUN' : (confirmable.reason ?? 'INVALID DRAFT')}
        </Text>
      </Pressable>
    </Screen>
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
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(1),
  },
  meters: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space(6),
    marginVertical: space(2),
  },
  meter: { fontFamily: FONT.display, fontSize: FONT_SIZE.small, color: palette.gold },
  meterOver: { color: palette.orange },
  list: { marginTop: space(2), alignSelf: 'stretch' },
  listContent: { gap: space(1), paddingBottom: space(2) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space(2),
    borderWidth: BORDER.chunk,
    borderColor: 'transparent',
    borderRadius: RADIUS.chip,
  },
  rowSelected: { borderColor: palette.gold, backgroundColor: palette.gold + '14' },
  rowBarred: { opacity: 0.35 },
  cardWrap: { flex: 1 },
  cost: {
    minWidth: 44,
    alignItems: 'center',
    paddingVertical: space(1),
    paddingHorizontal: space(1.5),
    borderWidth: BORDER.thin,
    borderRadius: RADIUS.chip,
    marginLeft: space(2),
  },
  costText: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro },
  empty: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(4),
  },
  confirm: {
    marginTop: space(3),
    paddingVertical: space(3),
    borderWidth: BORDER.chunk,
    borderColor: palette.gold,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.gold + '1A',
    alignItems: 'center',
  },
  confirmDisabled: { opacity: 0.4, borderColor: palette.inkDim },
  confirmText: { fontFamily: FONT.display, fontSize: FONT_SIZE.body, color: palette.gold },
});
