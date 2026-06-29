import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/StyledText';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import type { TeamIdentity } from '@/game/team-identity';
import { archetypeLabel, counterVerdict, deriveArchetype } from '@/game/team-archetype';
import type { Team } from '@/types/team';

/**
 * The scouting "intent" card: a team's stylistic identity at a glance. Both your
 * five and the opponent get the same detailed read, the archetype, its character
 * tags, a one-line blurb, the star, projected tendencies, and the soft spots, so
 * you can plan a counter before tip-off. The cross-team counter is the headline
 * ({@link MatchupHeadline}, rendered between the two cards), so green and red
 * appear only there and a loss reads as a strategy miss. Pure presentation over a
 * precomputed {@link TeamIdentity}; 8-bit theme tokens only.
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
  const { tags, blurb, weaknesses, tendencies } = identity;
  return (
    <View style={[styles.card, { borderLeftColor: accentHex }]}>
      <Text style={styles.archetype} numberOfLines={1}>
        {archetypeLabel(tendencies.archetype).toUpperCase()}
      </Text>
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
      <Text style={styles.star} numberOfLines={1}>
        <Text style={styles.starLabel}>STAR </Text>
        {tendencies.topScorer.name} · {tendencies.topScorer.position}
      </Text>
      <View style={styles.chipRow}>
        <Chip label="PACE" value={tendencies.pace.toUpperCase()} />
        <Chip label="3PA" value={THREE_LEAN_LABEL[tendencies.threeLean]} />
        <Chip label="STL" value={`~${tendencies.projSteals}`} />
        <Chip label="BLK" value={`~${tendencies.projBlocks}`} />
        <Chip label="REB" value={`~${tendencies.projRebounds}`} />
      </View>
      {weaknesses.length > 0 ? (
        <Text style={styles.weak} numberOfLines={1}>
          <Text style={styles.weakLabel}>WEAK </Text>
          {weaknesses.join(', ')}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The telegraphed matchup verdict, a banner shown between the two scout cards:
 * the single cross-team takeaway (who counters whom), read off the two
 * archetypes. The verdict word carries the direction and the only green/red on
 * the screen, so a counter is unmistakable before tip-off (a strategy miss, not
 * RNG). The reason line names both archetypes.
 */
export function MatchupHeadline({ home, away }: { home: Team; away: Team }) {
  const mine = deriveArchetype(home);
  const theirs = deriveArchetype(away);
  const verdict = counterVerdict(mine, theirs);

  const color = verdict.tier === 'even'
    ? palette.inkDim
    : verdict.favorable
      ? palette.makeGreen
      : palette.missRed;
  const word = verdict.tier === 'even'
    ? 'EVEN MATCHUP'
    : verdict.favorable
      ? verdict.tier === 'strong' ? '▲ STRONG EDGE' : '▲ YOUR EDGE'
      : verdict.tier === 'strong' ? '▼ STRONG MISMATCH' : '▼ MISMATCH';

  return (
    <View style={[styles.banner, { borderColor: color + '66', backgroundColor: color + '14' }]}>
      <Text style={[styles.bannerWord, { color }]} numberOfLines={1}>
        {word}
      </Text>
      <Text style={styles.bannerReason} numberOfLines={2}>
        your {archetypeLabel(mine)} vs their {archetypeLabel(theirs)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignSelf: 'stretch',
    alignItems: 'center',
    borderWidth: BORDER.thin,
    borderRadius: RADIUS.chip,
    paddingVertical: space(1.5),
    paddingHorizontal: space(2),
    marginTop: space(2),
    marginBottom: space(1),
  },
  bannerWord: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.label,
    textAlign: 'center',
  },
  bannerReason: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(0.5),
  },
  card: {
    alignSelf: 'stretch',
    paddingVertical: space(1.5),
    paddingLeft: space(2),
    paddingRight: space(1),
    marginBottom: space(1),
    borderLeftWidth: BORDER.chunkier,
  },
  archetype: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.small,
    color: palette.ink,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: space(0.5),
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
    color: palette.ink,
  },
  weak: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
    marginTop: space(1.5),
  },
  weakLabel: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
  },
});
