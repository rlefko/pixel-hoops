import { View, StyleSheet, Pressable, TextInput, ScrollView } from 'react-native';
import { Text } from '@/components/StyledText';
import { CLASS_ORDER, type PlayerClass } from '@/game/ratings';
import { POSITIONS, type Position } from '@/types/roster';
import { POSITION_COLOR } from '@/components/game/positionColor';
import { CLASS_COLOR } from './class-ui';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * A reusable search bar + position/class filter chips, shared by the roster
 * browser and the pre-run draft so browsing a large owned collection feels good on
 * a small screen. Filtering is owned by the parent (controlled): this just renders
 * the controls. Chips outside the optional `enabled*` sets are greyed out and not
 * tappable (a class/position the player owns none of, or one barred by the draft).
 */
interface RosterFilterBarProps {
  query: string;
  onQuery: (q: string) => void;
  /** Active position filters (empty = all positions). */
  positions: Set<Position>;
  onTogglePosition: (pos: Position) => void;
  /** Active class filters (empty = all classes). */
  classes: Set<PlayerClass>;
  onToggleClass: (cls: PlayerClass) => void;
  /** Positions to keep enabled; chips outside it are greyed + disabled. Omit = all enabled. */
  enabledPositions?: Set<Position>;
  /** Classes to keep enabled; chips outside it are greyed + disabled. Omit = all enabled. */
  enabledClasses?: Set<PlayerClass>;
  /** Optional right-aligned slot (e.g. a sort toggle). */
  right?: React.ReactNode;
}

export function RosterFilterBar({
  query,
  onQuery,
  positions,
  onTogglePosition,
  classes,
  onToggleClass,
  enabledPositions,
  enabledClasses,
  right,
}: RosterFilterBarProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={onQuery}
          placeholder="Search players..."
          placeholderTextColor={palette.inkDim}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {query.length > 0 ? (
          <Pressable onPress={() => onQuery('')} hitSlop={space(2)} style={styles.clear}>
            <Text style={styles.clearText}>x</Text>
          </Pressable>
        ) : null}
        {right}
      </View>
      {/* Position chips (top row): PG/SG/SF/PF/C, colored by POSITION_COLOR. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {POSITIONS.map((pos) => {
          const active = positions.has(pos);
          const disabled = enabledPositions ? !enabledPositions.has(pos) : false;
          const color = POSITION_COLOR[pos];
          return (
            <Pressable
              key={pos}
              onPress={() => onTogglePosition(pos)}
              disabled={disabled}
              style={[
                styles.chip,
                { borderColor: color },
                active && { backgroundColor: color + '33' },
                disabled && styles.chipDisabled,
              ]}
            >
              <Text style={[styles.chipText, { color }]}>{pos}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {/* Class/tier chips (bottom row): D..S++, colored by CLASS_COLOR. The "C"
          here is the C class, distinct from the "C" (Center) chip in the row above. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {CLASS_ORDER.map((cls) => {
          const active = classes.has(cls);
          const disabled = enabledClasses ? !enabledClasses.has(cls) : false;
          const color = CLASS_COLOR[cls];
          return (
            <Pressable
              key={cls}
              onPress={() => onToggleClass(cls)}
              disabled={disabled}
              style={[
                styles.chip,
                { borderColor: color },
                active && { backgroundColor: color + '33' },
                disabled && styles.chipDisabled,
              ]}
            >
              <Text style={[styles.chipText, { color }]}>{cls}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', gap: space(2) },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  search: {
    flex: 1,
    height: 40,
    paddingHorizontal: space(3),
    borderWidth: BORDER.thin,
    borderColor: palette.inkDim,
    borderRadius: RADIUS.chip,
    color: palette.ink,
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
  },
  clear: { paddingHorizontal: space(1) },
  clearText: { fontFamily: FONT.display, fontSize: FONT_SIZE.body, color: palette.inkDim },
  chips: { gap: space(2), paddingVertical: space(0.5) },
  chip: {
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
    borderWidth: BORDER.chunk,
    borderRadius: RADIUS.chip,
  },
  chipDisabled: { opacity: 0.35 },
  chipText: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro },
});
