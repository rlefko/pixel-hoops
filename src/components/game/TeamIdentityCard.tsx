import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/StyledText';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import type { TeamIdentity } from '@/game/team-identity';

/**
 * The scouting "intent" card: a team's stylistic identity at a glance. Character
 * tags, a one-line read, projected steals/blocks/rebounds, and headline
 * strengths/weaknesses, so the player can plan a counter before tip-off. Pure
 * presentation over a precomputed {@link TeamIdentity}; 8-bit theme tokens only.
 */

interface TeamIdentityCardProps {
  identity: TeamIdentity;
  /** Team accent color for the left rule (the franchise primary). */
  accentHex: string;
}

const THREE_LEAN_LABEL: Record<TeamIdentity['tendencies']['threeLean'], string> = {
  heavy: 'HEAVY',
  balanced: 'EVEN',
  inside: 'LOW',
};

/** A small bordered label/value chip, matching the PlayerCard composite chips. */
function Chip({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={styles.chipValue}>{String(value)}</Text>
    </View>
  );
}

export function TeamIdentityCard({ identity, accentHex }: TeamIdentityCardProps) {
  const { tags, blurb, strengths, weaknesses, tendencies } = identity;
  return (
    <View style={[styles.card, { borderLeftColor: accentHex }]}>
      <View style={styles.tagRow}>
        {tags.map((tag) => (
          <Text key={tag} style={styles.tag}>
            {tag.toUpperCase()}
          </Text>
        ))}
      </View>
      <Text style={styles.blurb} numberOfLines={2}>
        {blurb}
      </Text>
      <View style={styles.chipRow}>
        <Chip label="PACE" value={tendencies.pace.toUpperCase()} />
        <Chip label="3PA" value={THREE_LEAN_LABEL[tendencies.threeLean]} />
        <Chip label="STL" value={`~${tendencies.projSteals}`} />
        <Chip label="BLK" value={`~${tendencies.projBlocks}`} />
        <Chip label="REB" value={`~${tendencies.projRebounds}`} />
      </View>
      <Text style={styles.star} numberOfLines={1}>
        <Text style={styles.starLabel}>STAR </Text>
        {tendencies.topScorer.name} · {tendencies.topScorer.position}
      </Text>
      {strengths.length > 0 ? (
        <Text style={styles.strength} numberOfLines={1}>
          {'▲'} {strengths.join(', ')}
        </Text>
      ) : null}
      {weaknesses.length > 0 ? (
        <Text style={styles.weakness} numberOfLines={1}>
          {'▼'} {weaknesses.join(', ')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    paddingVertical: space(1.5),
    paddingLeft: space(2),
    paddingRight: space(1),
    marginBottom: space(1),
    borderLeftWidth: BORDER.chunkier,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tag: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.gold,
    marginRight: space(2),
    marginBottom: space(0.5),
  },
  blurb: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
    marginTop: space(0.5),
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space(1),
    marginTop: space(1.5),
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(0.5),
    borderWidth: BORDER.thin,
    borderColor: palette.inkDim,
    borderRadius: RADIUS.chip,
    paddingHorizontal: space(1),
    paddingVertical: space(0.25),
  },
  chipLabel: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
  },
  chipValue: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.steelBlue,
  },
  star: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.ink,
    marginTop: space(1.5),
  },
  starLabel: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
  },
  strength: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.makeGreen,
    marginTop: space(1),
  },
  weakness: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.missRed,
    marginTop: space(0.5),
  },
});
