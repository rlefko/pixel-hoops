import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/StyledText';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import type { TeamIdentity } from '@/game/team-identity';
import { archetypeLabel, counterVerdict, deriveArchetype } from '@/game/team-archetype';
import type { Team } from '@/types/team';

/**
 * The scouting "intent" card: a team's stylistic identity at a glance. The `full`
 * variant (the opponent you are scouting) reads its archetype, a one-line blurb,
 * the star, projected tendencies, and where to attack; the `lite` variant (your
 * own five, which you already know) reads just the archetype and blurb, since its
 * hard numbers live in the lineup right below. The cross-team counter is the
 * headline ({@link MatchupHeadline}), so green and red appear only there and a
 * loss reads as a strategy miss. Pure presentation over a precomputed
 * {@link TeamIdentity}; 8-bit theme tokens only.
 */

interface TeamIdentityCardProps {
  identity: TeamIdentity;
  /** Team accent color for the left rule (the franchise primary). */
  accentHex: string;
  /** `full` scouts the opponent in detail; `lite` summarizes your own five. */
  variant?: 'full' | 'lite';
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

export function TeamIdentityCard({ identity, accentHex, variant = 'full' }: TeamIdentityCardProps) {
  const { blurb, weaknesses, tendencies } = identity;
  return (
    <View style={[styles.card, { borderLeftColor: accentHex }]}>
      <Text style={styles.archetype} numberOfLines={1}>
        {archetypeLabel(tendencies.archetype).toUpperCase()}
      </Text>
      <Text style={styles.blurb} numberOfLines={2}>
        {blurb}
      </Text>
      {variant === 'full' ? (
        <>
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
            <Text style={styles.attack} numberOfLines={1}>
              <Text style={styles.attackLabel}>ATTACK </Text>
              {weaknesses.join(', ')}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/**
 * The telegraphed matchup verdict, promoted to a headline banner above both
 * scout cards: the single cross-team takeaway (who counters whom), read off the
 * two archetypes. The verdict word carries the direction and the only green/red
 * on the screen, so a counter is unmistakable before tip-off (a strategy miss,
 * not RNG). The reason line names both archetypes.
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
  blurb: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
    marginTop: space(1),
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
  attack: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
    marginTop: space(1.5),
  },
  attackLabel: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
  },
});
