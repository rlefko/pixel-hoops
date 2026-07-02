import { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/StyledText';
import { Pop, ParticleBurst } from '@/components/fx';
import { haptics, sfx, useFeelSettings } from '@/feel';
import {
  DIFFICULTIES,
  LADDER_CLASSES,
  DIFFICULTY_LABELS,
  cellKey,
  isCellCleared,
  type Difficulty,
  type LadderClass,
} from '@/game/difficulty-mode';
import { crestMilestonesCrossed } from '@/game/home-roster';
import { victoryTier } from '@/game/victory-tier';
import { VictoryTierIcon, CrownIcon } from '@/components/run/PixelIcons';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * A compact 4x5 grid of the (difficulty x ladder class) prestige crests, one per
 * Championship Bounty cell, earned by clearing that exact cell (cross-difficulty jumps
 * leave the skipped cells open as goals to come back for; a pre-v16 veteran's past
 * clears are seeded on load). The insane:S+ apex renders as the gold Grandmaster crown.
 * Empty slots read as a completionist checklist (the Balatro-sticker hook): "20 crests
 * to collect."
 *
 * `newCells` (crests earned since the shelf was last viewed, from the hubSeen
 * ledger) play a one-shot pop-in ceremony on this mount: each new crest lands as
 * a scale pop + a tier-colored spark + a pitch-stepped tick while the header
 * count climbs, and a crossing of 5/10/15/20 hands the bigger beat to the parent
 * via `onMilestone`. One-shot is enforced by persisted state (the parent stamps
 * the ledger on view), so a revisit renders a fully settled, static shelf — and
 * after the last timer this component is inert.
 */

interface BountyCrestShelfProps {
  clearedCells: readonly string[];
  /** Cells earned since the last Hall of Fame visit, in earn order. Empty or
   * omitted = the settled static shelf (the default everywhere else). */
  newCells?: readonly string[];
  /** Fired once when the pop-in crosses a crest milestone (5/10/15/20). */
  onMilestone?: (milestone: number) => void;
}

/** Reveal beats: the first pop waits for the wipe to settle, then one pip per step. */
const REVEAL_START_MS = 400;
const REVEAL_STEP_MS = 140;
const MILESTONE_DELAY_MS = 300;
/** Each successive crest's tick steps up by this playback-rate notch. */
const TICK_STEP = 0.08;

export function BountyCrestShelf({
  clearedCells,
  newCells = [],
  onMilestone,
}: BountyCrestShelfProps) {
  const { reducedMotion } = useFeelSettings();
  const conquered = (d: Difficulty, cls: LadderClass) => isCellCleared(clearedCells, d, cls);
  const earned = DIFFICULTIES.reduce(
    (n, d) => n + LADDER_CLASSES.filter((cls) => conquered(d, cls)).length,
    0
  );

  // Reveal order for the new cells; everything settled when there are none (or
  // under reduced motion, where the grid renders settled and one sting lands).
  const newIndex = useMemo(
    () => new Map(newCells.map((c, i) => [c, i])),
    [newCells]
  );
  const [revealedCount, setRevealedCount] = useState(() =>
    reducedMotion ? newCells.length : 0
  );

  useEffect(() => {
    if (newCells.length === 0) return;
    const crossed = crestMilestonesCrossed(earned - newCells.length, earned);
    const biggest = crossed.at(-1);
    if (reducedMotion) {
      // Settled grid, one beat: the milestone burst when crossed (its channels
      // self-gate under reduced motion), else a single rare sting.
      const timer = setTimeout(() => {
        if (biggest != null) onMilestone?.(biggest);
        else sfx.reward('rare');
      }, REVEAL_START_MS);
      return () => clearTimeout(timer);
    }
    const timers = newCells.map((_, i) =>
      setTimeout(() => {
        setRevealedCount(i + 1);
        // Clamped: iOS caps playback rate at 2.0, and a long-hoarded ledger can
        // reveal a dozen-plus crests in one visit.
        sfx.tick(Math.min(2, 1 + i * TICK_STEP));
        if (i === 0) haptics.light();
      }, REVEAL_START_MS + i * REVEAL_STEP_MS)
    );
    if (biggest != null) {
      timers.push(
        setTimeout(
          () => onMilestone?.(biggest),
          REVEAL_START_MS + newCells.length * REVEAL_STEP_MS + MILESTONE_DELAY_MS
        )
      );
    }
    return () => timers.forEach(clearTimeout);
    // Mount-once by design: newCells is this visit's ceremony, captured by the
    // parent before it stamps the ledger, and never changes while mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayEarned = earned - (newCells.length - revealedCount);

  return (
    <View style={styles.shelf}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>BOUNTY CRESTS</Text>
        <Pop trigger={displayEarned}>
          <Text style={styles.count}>{displayEarned}/20</Text>
        </Pop>
      </View>
      <View style={styles.row}>
        <View style={styles.rowLabelSpacer} />
        {LADDER_CLASSES.map((cls) => (
          <Text key={cls} style={styles.colLabel}>
            {cls}
          </Text>
        ))}
      </View>
      {DIFFICULTIES.map((d) => (
        <View key={d} style={styles.row}>
          <Text style={styles.rowLabel}>{DIFFICULTY_LABELS[d].name}</Text>
          {LADDER_CLASSES.map((cls) => {
            const idx = newIndex.get(cellKey(d, cls));
            const pending = idx != null && idx >= revealedCount;
            if (!conquered(d, cls) || pending) {
              // An open slot, or a new crest still waiting for its reveal beat.
              return <View key={cls} style={[styles.cell, styles.cellEmpty]} />;
            }
            const tier = victoryTier(d, cls);
            const isApex = d === 'insane' && cls === 'S+';
            const icon = isApex ? (
              <CrownIcon size={16} color={palette.gold} />
            ) : (
              <VictoryTierIcon tier={tier.key} size={16} color={tier.color} />
            );
            if (idx == null) {
              return (
                <View key={cls} style={styles.cell}>
                  {icon}
                </View>
              );
            }
            // A newly earned crest lands: scale pop + a tier-colored spark.
            return (
              <View key={cls} style={styles.cell}>
                <Pop popOnMount>{icon}</Pop>
                <ParticleBurst
                  origin={{ x: CELL / 2, y: CELL / 2 }}
                  variant="spark"
                  count={5}
                  color={isApex ? palette.gold : tier.color}
                  trigger={1}
                />
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const CELL = 30;

const styles = StyleSheet.create({
  shelf: {
    borderWidth: BORDER.thin,
    borderColor: palette.gold + '44',
    borderRadius: RADIUS.chip,
    backgroundColor: palette.gold + '0A',
    padding: space(3),
    gap: space(1),
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space(1),
  },
  title: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.small,
    color: palette.gold,
  },
  count: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowLabel: {
    width: 52,
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
  },
  rowLabelSpacer: { width: 52 },
  colLabel: {
    width: CELL,
    textAlign: 'center',
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
  },
  cell: {
    width: CELL,
    height: CELL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellEmpty: {
    // A dim placeholder square: the slot still to be earned.
    borderWidth: BORDER.thin,
    borderColor: palette.inkDim + '33',
    borderRadius: RADIUS.chip,
    transform: [{ scale: 0.5 }],
  },
});
