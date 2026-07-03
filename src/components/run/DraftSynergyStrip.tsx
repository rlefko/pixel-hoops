import { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { TagChip } from '@/components/howtoplay/TagChip';
import { PositionPips } from '@/components/howtoplay/PositionPips';
import { SYNERGY_CHROME } from './rarity-ui';
import { computeSynergy, SYNERGY_DEFS, type SynergyDef } from '@/game/synergy';
import { palette, space } from '@/theme';
import type { RosterPlayer } from '@/types/roster';

/**
 * The draft board's live synergy readout: the four lineup-shape bonuses as a
 * FIXED row of chips, lit in the synergy chrome while the current five
 * completes the shape and dim otherwise. Fixed so nothing appears, disappears,
 * or shifts under the thumb as picks change; escalation is contrast, not
 * motion (no glow loops, nothing to pause). This is where "the right shapes
 * unlock bonuses" stops being handbook prose and becomes confirmable in-run.
 */

const CHIPS: { label: string; def: SynergyDef }[] = [
  { label: 'SPEED', def: SYNERGY_DEFS.backcourtSpeed },
  { label: 'TOWERS', def: SYNERGY_DEFS.twinTowers },
  { label: 'POSITIONLESS', def: SYNERGY_DEFS.positionless },
  { label: 'SPECIALISTS', def: SYNERGY_DEFS.specialists },
];

export function DraftSynergyStrip({ starters }: { starters: RosterPlayer[] }) {
  // Pure and O(5) per lineup change; never touched on the tap path itself.
  const active = useMemo(() => new Set(computeSynergy(starters).labels), [starters]);
  return (
    <View style={styles.row}>
      {CHIPS.map((chip) => {
        const lit = active.has(chip.def.label);
        const color = lit ? SYNERGY_CHROME : palette.inkDim;
        return (
          <View key={chip.label} style={[styles.cell, !lit && styles.cellDim]}>
            <PositionPips positions={[...chip.def.shape]} size={6} />
            <TagChip label={chip.label} color={color} size="micro" />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: space(2),
    marginTop: space(1.5),
  },
  cell: { alignItems: 'center', gap: space(1) },
  cellDim: { opacity: 0.55 },
});
