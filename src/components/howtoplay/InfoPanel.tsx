import { type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { Pop } from '@/components/fx';
import { DisplayText, MonoText } from '@/components/StyledText';
import { palette, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

interface InfoPanelProps {
  /** Leading PixelIcon (already colored) shown before the title. */
  icon?: ReactNode;
  title: string;
  /** Accent color for the title, border, and the faint fill tint. */
  accent: string;
  /** Body copy. Optional so a panel can be visual-only. */
  body?: string;
  /** Inline visual (chips, grids, scoreboard) rendered under the body. */
  children?: ReactNode;
}

/**
 * The shared teaching-panel shell for the How to Play page: a pixel-bordered card
 * tinted by its accent, with a leading icon, an accent DisplayText title, MonoText
 * body, and an optional inline-visual slot. Pops in on mount. Succeeds the old
 * plain RulesSection by adding the icon, accent color, and entrance juice.
 */
export function InfoPanel({ icon, title, accent, body, children }: InfoPanelProps) {
  return (
    <Pop popOnMount style={styles.outer}>
      <View style={[styles.panel, { borderColor: accent }]}>
        <View pointerEvents="none" style={[styles.tint, { backgroundColor: accent }]} />
        <View style={styles.header}>
          {icon}
          <DisplayText style={[styles.title, { color: accent }]}>{title}</DisplayText>
        </View>
        {body ? <MonoText style={styles.body}>{body}</MonoText> : null}
        {children ? <View style={styles.visual}>{children}</View> : null}
      </View>
    </Pop>
  );
}

const styles = StyleSheet.create({
  outer: { width: '100%', marginBottom: space(4) },
  panel: {
    borderWidth: BORDER.chunk,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.bgPanel,
    padding: space(4),
    overflow: 'hidden',
  },
  tint: { ...StyleSheet.absoluteFillObject, opacity: 0.06 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    marginBottom: space(2),
  },
  title: { fontSize: FONT_SIZE.label, letterSpacing: 1, flexShrink: 1 },
  body: {
    color: palette.ink,
    fontSize: 13,
    lineHeight: 20,
    opacity: 0.85,
  },
  visual: { marginTop: space(3) },
});
