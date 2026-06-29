import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/StyledText';
import { PixelButton } from '@/components/PixelButton';
import { WhistleIcon } from '@/components/run/PixelIcons';
import { CLASS_COLOR } from '@/components/run/class-ui';
import type { CoachProfile } from '@/game/coaches';
import type { CoachRec } from '@/game/coach-reco';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * The equipped coach's optional, one-click lineup suggestion before a game. A quiet,
 * dismissible INLINE card (never a blocking modal): accepting it reorders the whole
 * roster (starters + bench) in the coach's playstyle in one tap; the player can also
 * ignore it or scroll past to tip off. It only renders when the coach found a
 * meaningful edge, so on easy it rarely appears and on hard it speaks up often. The
 * edge is qualitative (matching the game's telegraphed matchup verdict), never a raw
 * percentage.
 */

const EDGE_LABEL: Record<CoachRec['edge'], string> = {
  minor: 'MINOR EDGE',
  solid: 'SOLID EDGE',
  big: 'BIG EDGE',
};

interface CoachRecBannerProps {
  coach: CoachProfile;
  rec: CoachRec;
  onAccept: () => void;
  onDismiss: () => void;
}

export function CoachRecBanner({ coach, rec, onAccept, onDismiss }: CoachRecBannerProps) {
  const accent = CLASS_COLOR[coach.class];
  return (
    <View style={[styles.card, { borderColor: accent }]}>
      <View style={styles.header}>
        <WhistleIcon size={14} color={accent} />
        <Text style={[styles.coach, { color: accent }]} numberOfLines={1}>
          COACH {coach.name.toUpperCase()}
        </Text>
        <Text style={styles.edge}>{EDGE_LABEL[rec.edge]}</Text>
      </View>
      <Text style={styles.summary}>{rec.summary}</Text>
      {rec.changes > 1 ? (
        <Text style={styles.moves}>{rec.changes} lineup changes</Text>
      ) : null}
      <View style={styles.actions}>
        <PixelButton label="ACCEPT" variant="primary" onPress={onAccept} />
        <PixelButton label="IGNORE" variant="secondary" size="small" onPress={onDismiss} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    marginTop: space(4),
    paddingVertical: space(3),
    paddingHorizontal: space(3),
    borderWidth: BORDER.chunk,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.chrome + '12',
    gap: space(2),
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  coach: { flex: 1, fontFamily: FONT.display, fontSize: FONT_SIZE.micro },
  edge: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, color: palette.makeGreen },
  summary: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.ink,
    lineHeight: FONT_SIZE.body + 4,
  },
  moves: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(3),
    marginTop: space(1),
  },
});
