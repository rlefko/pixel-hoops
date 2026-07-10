import { useMemo, useState } from 'react';
import { View, StyleSheet, Pressable, FlatList } from 'react-native';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { LiveChip, Counter } from '@/components/fx';
import { PlayerCard } from '@/components/run/PlayerCard';
import { StatNumber } from '@/components/run/StatNumber';
import { RosterFilterBar } from '@/components/run/RosterFilterBar';
import { DraftSynergyStrip } from '@/components/run/DraftSynergyStrip';
import { TeachCallout } from '@/components/teach/TeachCallout';
import { useTipArmed } from '@/components/teach/useTipArmed';
import { lossNudgeLine } from '@/game/loss-nudge';
import { DRAFT_COST_COLOR, CLASS_COLOR } from '@/components/run/class-ui';
import {
  draftCostFor,
  draftSpend,
  draftPoints,
  canConfirmLoadout,
  isDraftable,
  isCappedLegend,
  playerDraftClass,
  MAX_DRAFT_ROTATION,
  MAX_DRAFT_LEGENDS,
} from '@/game/draft';
import { scaleLegendsForLadder } from '@/game/apply-effects';
import {
  type Difficulty,
  type LadderClass,
  DIFFICULTY_LABELS,
} from '@/game/difficulty-mode';
import { type PlayerClass } from '@/game/ratings';
import {
  availableClasses,
  availablePositions,
  compareByRatingDesc,
  effectiveOvr,
} from '@/game/roster-filter';
import { totalUpgrades } from '@/game/home-roster';
import { signatureByKey } from '@/game/signature';
import { useHomeRoster } from '@/context/HomeRosterContext';
import { POSITION_COLOR } from '@/components/game/positionColor';
import { nameKey, POSITIONS, type Position } from '@/types/roster';
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
  /** True when a suspended run exists: confirming this draft will replace it (the
   * forfeit commit point). Surfaces an inline heads-up; cancelling keeps the old run. */
  replacesSavedRun?: boolean;
  onConfirm: (starters: RosterPlayer[], bench: RosterPlayer[]) => void;
  /** Back out of the draft without starting (returns home). Leaves any saved run intact,
   * since the draft is never auto-saved. */
  onCancel: () => void;
}

const keyOf = (rp: RosterPlayer): string => `${rp.player.name}|${rp.position}`;
const firstEmpty = (slots: (RosterPlayer | null)[]): number => {
  const i = slots.findIndex((s) => s === null);
  return i === -1 ? 0 : i;
};

/** A player's ladder-fielded view for the draft display: a legend dropped to its
 * ladder-scaled line, so its shown OVR/strength matches what it plays on this rung.
 * Every non-legend is returned by reference (no allocation, memo-friendly). */
const fieldedView = (rp: RosterPlayer, ladderClass: LadderClass): RosterPlayer =>
  rp.legendary ? scaleLegendsForLadder([rp], ladderClass)[0] : rp;

/** Legends slotted OUTSIDE the selected slot (which a tap displaces) that count against
 * the one-legend cap on this ladder. Native legends on the S+ ladder do not count. */
const cappedLegendsElsewhere = (
  slots: (RosterPlayer | null)[],
  selected: number,
  ladderClass: LadderClass
): number =>
  slots.filter((s, i) => i !== selected && s != null && isCappedLegend(s, ladderClass)).length;

export function DraftView({
  available,
  defaultStarters,
  defaultBench,
  difficulty,
  ladderClass,
  replacesSavedRun,
  onConfirm,
  onCancel,
}: DraftViewProps) {
  const [slots, setSlots] = useState<(RosterPlayer | null)[]>(() => {
    const s: (RosterPlayer | null)[] = Array(MAX_DRAFT_ROTATION).fill(null);
    defaultStarters.slice(0, STARTER_SLOTS).forEach((p, i) => (s[i] = p));
    defaultBench
      .slice(0, BENCH_SLOTS)
      .forEach((p, i) => (s[STARTER_SLOTS + i] = p));
    return s;
  });
  const [selected, setSelected] = useState<number>(() => firstEmpty(slots));
  const [query, setQuery] = useState('');
  const [classes, setClasses] = useState<Set<PlayerClass>>(new Set());
  const [positions, setPositions] = useState<Set<Position>>(new Set());
  const { homeRoster } = useHomeRoster();

  const inLoadout = useMemo(
    () => new Set(slots.filter((s): s is RosterPlayer => !!s).map(keyOf)),
    [slots]
  );

  // Only players that can actually be drafted count toward an enabled chip, so a
  // class/position with no draftable players (none owned, or all barred by the
  // ladder) greys out. A draftable legendary keeps its class enabled.
  const { enabledClasses, enabledPositions } = useMemo(() => {
    const selectable = (rp: RosterPlayer) => isDraftable(rp, ladderClass);
    return {
      enabledClasses: availableClasses(available, selectable),
      enabledPositions: availablePositions(available, selectable),
    };
  }, [available, ladderClass]);

  const assign = (rp: RosterPlayer) => {
    if (draftCostFor(rp, ladderClass) === null) return; // barred
    if (slots.some((s) => s && keyOf(s) === keyOf(rp))) return; // already slotted
    // One legend per rotation: block another reach-up legend at the cap, unless it
    // replaces the legend already in the selected slot (which this tap displaces).
    if (
      isCappedLegend(rp, ladderClass) &&
      cappedLegendsElsewhere(slots, selected, ladderClass) >= MAX_DRAFT_LEGENDS
    )
      return;
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
    const list = available.filter((rp) => {
      if (inLoadout.has(keyOf(rp))) return false;
      // Hide players too strong for this ladder outright (a barred pick is undraftable),
      // so the list holds only legal picks instead of greyed high-OVR rows crowding the top.
      if (!isDraftable(rp, ladderClass)) return false;
      if (q && !rp.player.name.toLowerCase().includes(q)) return false;
      if (
        classes.size > 0 &&
        (!rp.originalClass || !classes.has(rp.originalClass))
      )
        return false;
      if (positions.size > 0 && !positions.has(rp.position)) return false;
      return true;
    });
    const upgradesOf = homeRoster
      ? (rp: RosterPlayer) => totalUpgrades(homeRoster, rp)
      : undefined;
    // Sort by the ladder-FIELDED overall (a legend by its scaled strength), computed once
    // per player here rather than on every comparison, so list order matches the shown OVR.
    const fieldedOvr = new Map<RosterPlayer, number>();
    for (const rp of list) fieldedOvr.set(rp, effectiveOvr(fieldedView(rp, ladderClass)));
    return list.sort(
      compareByRatingDesc(upgradesOf, (rp) => fieldedOvr.get(rp) ?? effectiveOvr(rp))
    );
  }, [available, inLoadout, query, classes, positions, homeRoster, ladderClass]);

  const starters = slots
    .slice(0, STARTER_SLOTS)
    .filter((s): s is RosterPlayer => !!s);
  const bench = slots
    .slice(STARTER_SLOTS)
    .filter((s): s is RosterPlayer => !!s);
  const picks = [...starters, ...bench];
  const spent = draftSpend(picks, ladderClass);
  const budget = draftPoints(difficulty);
  // What assigning into the selected slot gives back (its current occupant's
  // cost); feeds each row's affordability read. Loadout changes flow through
  // `filtered` and slot changes through extraData, so rows stay current.
  const selectedOccupant = slots[selected];
  const selectedRefund = selectedOccupant
    ? (draftCostFor(selectedOccupant, ladderClass) ?? 0)
    : 0;
  // One legend per rotation: at the cap, extra reach-up legends read disabled + a "1 MAX"
  // note in the list (the assign/confirm guards enforce it).
  const legendCapReached =
    cappedLegendsElsewhere(slots, selected, ladderClass) >= MAX_DRAFT_LEGENDS;
  // The draft scales an owned legend down toward this ladder (full power only once you
  // climb to the S / S+ ladders), so a hint explains the reduced OVR, shown exactly when an
  // owned legend actually fields weaker than its natural OVR here.
  const showLegendHint = available.some(
    (rp) => rp.legendary && effectiveOvr(fieldedView(rp, ladderClass)) < effectiveOvr(rp)
  );
  // After three straight losses at this exact cell, ONE coach strategy line
  // keyed on the remembered (losing) rotation's shape. Captured once at mount
  // (a memo would pop it in mid-view when the budget beat stamps itself seen),
  // and suppressed while that beat is armed: one voice per screen.
  const budgetTipArmed = useTipArmed('draftBudget');
  const [nudge] = useState(() =>
    homeRoster && !budgetTipArmed
      ? lossNudgeLine(homeRoster.teach, homeRoster.rosterMemory, difficulty, ladderClass)
      : null
  );
  const confirmable = canConfirmLoadout(
    starters,
    bench,
    ladderClass,
    difficulty
  );

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
    <Screen style={styles.container} onBack={onCancel} backLabel="CANCEL">
      <Text style={styles.title}>DRAFT YOUR LINEUP</Text>
      <Text style={styles.subtitle}>
        {DIFFICULTY_LABELS[difficulty].name} · {ladderClass} · POINTS{' '}
        {/* Over budget reads red immediately; confirm-time reasons stay the
            enforcement (an over-budget pick is still a legal tap, since
            assigning refunds the displaced player). */}
        <Counter value={spent} style={spent > budget ? styles.pointsOver : undefined} />/
        {budget}
      </Text>
      {replacesSavedRun ? (
        <Text style={styles.replaceNote}>
          Starting this five replaces your saved run.
        </Text>
      ) : null}
      {/* One-shot, anchored to the POINTS counter it explains. */}
      <TeachCallout
        tip="draftBudget"
        copyArgs={{ budget }}
        section="draft"
        style={styles.teach}
      />
      {nudge ? <Text style={styles.nudge}>COACH: {nudge}</Text> : null}

      <View style={styles.board}>
        {slots.map((rp, i) => {
          const isStarter = i < STARTER_SLOTS;
          const label = isStarter ? POSITIONS[i] : 'B';
          return (
            <LiveChip
              key={i}
              active={selected === i}
              color={palette.gold}
              style={styles.slotWrap}
            >
              <Slot
                label={label}
                rp={rp}
                ladderClass={ladderClass}
                selected={selected === i}
                onSelect={() => setSelected(i)}
                onClear={() => clearSlot(i)}
              />
            </LiveChip>
          );
        })}
      </View>
      <DraftSynergyStrip starters={starters} />

      <Text style={styles.sectionLabel}>
        {slots[selected]
          ? 'TAP A PLAYER TO REPLACE THE SELECTED SLOT'
          : 'TAP A PLAYER FOR THE SELECTED SLOT'}
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
      {showLegendHint ? (
        <Text style={styles.legendHint}>
          ★ Legends scale to this ladder. Full power up top.
        </Text>
      ) : null}

      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={filtered}
        keyExtractor={(rp, i) => `${keyOf(rp)}-${i}`}
        // Re-render the rows when the selected slot changes so each row's tap assigns
        // to the current slot; slot/loadout changes flow through `filtered` (the data).
        extraData={selected}
        windowSize={5}
        initialNumToRender={10}
        removeClippedSubviews
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={styles.empty}>No players match.</Text>}
        renderItem={({ item: rp }) => {
          const cost = draftCostFor(rp, ladderClass);
          // A FREE (below-ladder) pick never raises spend, so it is always affordable.
          // A priced pick fits when it clears the remaining budget after the selected
          // slot's refund (assigning REFUNDS the displaced occupant, so a cost above the
          // raw remainder is still a legal tap; the badge only warns, confirm enforces).
          // Barred picks are filtered out of the list, so cost is never null here.
          const affordable =
            cost == null || cost === 0 || cost <= budget - spent + selectedRefund;
          // One legend per rotation: extra legends read disabled + "1 MAX" (assign/confirm enforce).
          const legendBlocked = isCappedLegend(rp, ladderClass) && legendCapReached;
          const fielded = fieldedView(rp, ladderClass);
          // Keep the legend's true S+ badge and hide the class arrow ONLY when it is actually
          // scaled DOWN here, so the reduced OVR never reads as a downgrade. A full-power legend
          // (S / S+ ladders) keeps the normal badge, including a legit S++ arrow if trained.
          const scaledDown = (rp.legendary ?? false) && effectiveOvr(fielded) < effectiveOvr(rp);
          return (
            <Pressable
              onPress={() => assign(rp)}
              disabled={legendBlocked}
              style={[styles.row, legendBlocked && styles.rowDisabled]}
            >
              <View style={styles.cardWrap}>
                {/* Show the legend at its ladder-FIELDED strength (scaled OVR), keeping its
                    S+ identity badge; every other player renders at their real line. */}
                <PlayerCard
                  rp={fielded}
                  compact
                  showSpecialty
                  overrideClass={scaledDown ? playerDraftClass(rp) : undefined}
                />
                {/* An on-loan legend is a live SIGNATURE chase: name the condition
                    right where the drafting decision happens. */}
                <ChaseLine rp={rp} />
              </View>
              <CostBadge cost={cost} affordable={affordable} capped={legendBlocked} />
            </Pressable>
          );
        }}
      />

      <Pressable
        onPress={() => onConfirm(starters, bench)}
        disabled={!confirmable.ok}
        style={[styles.confirm, !confirmable.ok && styles.confirmDisabled]}
      >
        <Text style={styles.confirmText}>
          {confirmable.ok ? 'START RUN' : (confirmable.reason ?? 'INVALID')}
        </Text>
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
  // The slot's effective OVR (training folded in) reads the same strength the row card
  // shows: a legend uses its ladder-FIELDED (scaled) line, so its number matches what it
  // plays, while the class badge stays its intrinsic S+ (via `cls`). Position is the
  // player's intrinsic floor position, which can differ from this slot's label when
  // slotted out of spot or onto the bench, so a draftee's fit is legible at a glance.
  return (
    <Pressable
      onPress={onSelect}
      style={[styles.slot, selected && styles.slotSelected]}
    >
      <View style={styles.slotMain}>
        <Text style={styles.slotLabel}>{label}</Text>
        {rp ? (
          <>
            <Text style={styles.slotName} numberOfLines={1}>
              {rp.player.name}
            </Text>
            <Pressable
              onPress={onClear}
              hitSlop={space(2)}
              style={styles.slotClear}
            >
              <Text style={styles.slotClearText}>x</Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.slotEmpty}>empty</Text>
        )}
      </View>
      {rp ? (
        <View style={styles.slotMeta}>
          <View
            style={[
              styles.slotPos,
              { borderColor: POSITION_COLOR[rp.position] },
            ]}
          >
            <Text
              style={[
                styles.slotPosText,
                { color: POSITION_COLOR[rp.position] },
              ]}
            >
              {rp.position}
            </Text>
          </View>
          <StatNumber
            value={effectiveOvr(fieldedView(rp, ladderClass))}
            style={styles.slotOvr}
            animate={false}
          />
          {cls ? (
            <Text style={[styles.slotClass, { color: CLASS_COLOR[cls] }]}>
              {cls}
            </Text>
          ) : null}
          <Text
            style={[
              styles.slotCost,
              { color: cost != null ? DRAFT_COST_COLOR[cost] : palette.inkDim },
            ]}
          >
            {cost == null ? 'LOCKED' : costLabel(cost)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** The on-loan legend's live chase, right under their draft card: the moment
 * condition while it is open, the title once the moment is proven (a pinned
 * legend can arrive with the moment already stamped), so this line and the
 * pregame Showcase card never disagree about what the chase is. */
function ChaseLine({ rp }: { rp: RosterPlayer }) {
  const { homeRoster } = useHomeRoster();
  if (!rp.onLoan) return null;
  const key = nameKey(rp.player.name, rp.position);
  const challenge = signatureByKey(key);
  if (!challenge) return null;
  const momentProven = !!homeRoster?.signatures?.[key]?.moment;
  return (
    <Text style={styles.chaseLine} numberOfLines={1}>
      SIGNATURE CHASE: {momentProven ? 'moment proven, win a title together' : challenge.text}
    </Text>
  );
}

/** One cost voice across the whole board: the slot chips and the roster badges
 * both read "FREE" / "1 PT" / "2 PTS" (the handbook's cost chips pluralize the
 * same way), so one number never wears two formats on one screen. */
function costLabel(cost: number): string {
  return cost === 0 ? 'FREE' : `${cost} ${cost === 1 ? 'PT' : 'PTS'}`;
}

function CostBadge({
  cost,
  affordable = true,
  capped = false,
}: {
  cost: number | null;
  affordable?: boolean;
  /** The one-legend cap is already met, so this legend can't be added: read "1 MAX". */
  capped?: boolean;
}) {
  // A null cost means the class is barred for this ladder: say so instead of a
  // bare dash, since "why is this row grey" was a real new-player wall. (Barred rows
  // are filtered out of the draft list, so this is now only a defensive fallback.)
  if (cost === null) {
    return (
      <View style={[styles.cost, { borderColor: palette.inkDim }]}>
        <Text style={[styles.costText, { color: palette.inkDim }]}>LOCKED</Text>
      </View>
    );
  }
  const color = capped
    ? palette.inkDim
    : affordable
      ? (DRAFT_COST_COLOR[cost] ?? palette.inkDim)
      : palette.missRed;
  return (
    <View style={[styles.cost, { borderColor: color }]}>
      <Text style={[styles.costText, { color }]}>{costLabel(cost)}</Text>
      {capped ? (
        <Text style={styles.costCap}>{MAX_DRAFT_LEGENDS} MAX</Text>
      ) : !affordable ? (
        <Text style={styles.costOver}>OVER</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space(4) },
  title: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h3,
    color: palette.gold,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(1),
    marginBottom: space(2),
  },
  replaceNote: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.orange,
    textAlign: 'center',
    marginBottom: space(2),
  },
  teach: { alignSelf: 'stretch', marginBottom: space(2) },
  nudge: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.steelBlue,
    textAlign: 'center',
    marginBottom: space(2),
  },
  board: { flexDirection: 'row', flexWrap: 'wrap', gap: space(1) },
  slotWrap: { width: '48.5%' },
  slot: {
    flexDirection: 'column',
    gap: space(0.5),
    width: '100%',
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
  slotMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
    marginLeft: 22 + space(1),
  },
  slotLabel: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
    width: 22,
  },
  slotName: {
    flex: 1,
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.ink,
  },
  slotPos: {
    paddingHorizontal: space(1),
    borderWidth: BORDER.thin,
    borderRadius: RADIUS.chip,
    alignItems: 'center',
  },
  slotPosText: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro },
  slotOvr: { fontFamily: FONT.display, fontSize: FONT_SIZE.small },
  slotClass: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro },
  slotCost: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro },
  slotEmpty: {
    flex: 1,
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
    fontStyle: 'italic',
  },
  slotClear: { paddingHorizontal: space(0.5) },
  slotClearText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
  },
  sectionLabel: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.gold,
    marginTop: space(3),
    marginBottom: space(1),
  },
  legendHint: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.gold,
    marginTop: space(1),
  },
  list: { flex: 1, marginTop: space(2), alignSelf: 'stretch' },
  listContent: { gap: space(0.5), paddingBottom: space(2) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space(0.5),
    paddingHorizontal: space(1),
    borderRadius: RADIUS.chip,
  },
  rowDisabled: { opacity: 0.35 },
  cardWrap: { flex: 1 },
  chaseLine: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.gold,
    marginTop: space(0.5),
  },
  cost: {
    minWidth: 52,
    alignItems: 'center',
    paddingVertical: space(0.5),
    paddingHorizontal: space(1),
    borderWidth: BORDER.thin,
    borderRadius: RADIUS.chip,
    marginLeft: space(1),
  },
  costText: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro },
  costOver: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, color: palette.missRed },
  costCap: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, color: palette.inkDim },
  pointsOver: { color: palette.missRed },
  empty: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(4),
  },
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
  confirmText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
    color: palette.gold,
  },
});
