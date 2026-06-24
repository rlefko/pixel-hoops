import { View, StyleSheet, Pressable, TextInput, ScrollView } from 'react-native';
import { Text } from '@/components/StyledText';
import { CLASS_ORDER, type PlayerClass } from '@/game/ratings';
import { CLASS_COLOR } from './class-ui';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * A reusable search bar + class filter chips, shared by the roster browser and the
 * pre-run draft so browsing a large owned collection feels good on a small screen.
 * Filtering is owned by the parent (controlled): this just renders the controls.
 */
interface RosterFilterBarProps {
  query: string;
  onQuery: (q: string) => void;
  /** Active class filters (empty = all classes). */
  classes: Set<PlayerClass>;
  onToggleClass: (cls: PlayerClass) => void;
  /** Optional right-aligned slot (e.g. a sort toggle). */
  right?: React.ReactNode;
}

export function RosterFilterBar({
  query,
  onQuery,
  classes,
  onToggleClass,
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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {CLASS_ORDER.map((cls) => {
          const active = classes.has(cls);
          const color = CLASS_COLOR[cls];
          return (
            <Pressable
              key={cls}
              onPress={() => onToggleClass(cls)}
              style={[
                styles.chip,
                { borderColor: color },
                active && { backgroundColor: color + '33' },
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
  chipText: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro },
});
