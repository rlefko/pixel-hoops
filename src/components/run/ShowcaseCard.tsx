import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from '@/components/StyledText';
import { StarIcon } from '@/components/run/PixelIcons';
import { TeachCallout } from '@/components/teach/TeachCallout';
import {
  SHOWCASE_CALL_COPY,
  SHOWCASE_CALL_DETAIL,
  momentOddsLadder,
} from '@/game/showcase';
import { SIGNATURE_TIER_NAMES } from '@/game/signature';
import type { ShowcaseCandidate } from '@/game/run-machine';
import { haptics, sfx } from '@/feel';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * The pregame SHOWCASE card: the one player-authored game-plan call. Rendered
 * only when a chase legend is in the dressed five, in three states:
 *
 *  - OFFERED: a one-tap arm/disarm toggle. Arming flips the card gold, moves
 *    the qualitative odds word, and (via the rebuilt preview team) visibly
 *    shifts the MatchupHeadline above: the cost is priced before tip-off.
 *  - INELIGIBLE: muted and un-tappable, with the exact reason the moment cannot
 *    bank here (the qualification feedback that used to run silently post-sim).
 *  - Absent entirely when no chase legend starts (the parent guards).
 *
 * Static beats only (state changes, no loops); the toggle feedback is the
 * standard selection tap. Odds are the coach-odds law: words, never numbers.
 */
export function ShowcaseCard({
  candidates,
  onToggle,
}: {
  candidates: ShowcaseCandidate[];
  onToggle: (legendKey: string) => void;
}) {
  if (candidates.length === 0) return null;
  return (
    <View style={styles.wrap}>
      {candidates.map((c) => (
        <OneCall key={c.legendKey} candidate={c} onToggle={onToggle} />
      ))}
    </View>
  );
}

function OneCall({
  candidate,
  onToggle,
}: {
  candidate: ShowcaseCandidate;
  onToggle: (legendKey: string) => void;
}) {
  const { challenge, eligibility, armed, legendKey } = candidate;
  const odds = momentOddsLadder(challenge.templateId, challenge.tier);
  const oddsMoves = odds.showcased !== odds.base;
  if (!eligibility.ok) {
    return (
      <View style={[styles.card, styles.cardMuted]}>
        <View style={styles.headRow}>
          <StarIcon size={10} color={palette.inkDim} />
          <Text style={styles.headMuted}>SHOWCASE</Text>
          <Text style={styles.tierChip}>{SIGNATURE_TIER_NAMES[challenge.tier]}</Text>
        </View>
        <Text style={styles.conditionMuted}>
          {challenge.legendName}: {challenge.text}
        </Text>
        <Text style={styles.ineligible}>WON'T COUNT HERE: {eligibility.reason}</Text>
      </View>
    );
  }
  const toggle = () => {
    haptics.selection();
    sfx.tap('secondary');
    onToggle(legendKey);
  };
  return (
    <View style={[styles.card, armed && styles.cardArmed]}>
      <View style={styles.headRow}>
        <StarIcon size={10} color={armed ? palette.gold : palette.inkDim} />
        <Text style={[styles.head, armed && styles.headArmed]}>
          {armed ? 'SHOWCASE CALLED' : 'SHOWCASE'}
        </Text>
        <Text style={styles.tierChip}>{SIGNATURE_TIER_NAMES[challenge.tier]}</Text>
      </View>
      <Text style={styles.condition}>
        {challenge.legendName}: {challenge.text}
      </Text>
      <Text style={styles.odds}>
        {oddsMoves ? `${odds.base} → ${odds.showcased}` : `${odds.base} EITHER WAY`}
      </Text>
      <Pressable onPress={toggle} style={[styles.callBtn, armed && styles.callBtnArmed]}>
        <Text style={[styles.callText, armed && styles.callTextArmed]}>
          {armed ? `CALLED: ${SHOWCASE_CALL_COPY[challenge.templateId]}` : SHOWCASE_CALL_COPY[challenge.templateId]}
        </Text>
      </Pressable>
      <Text style={styles.detail}>
        {SHOWCASE_CALL_DETAIL[challenge.templateId]} Moments only bank in wins.
      </Text>
      <TeachCallout tip="showcaseCall" section="favor" style={styles.tip} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', gap: space(2), marginTop: space(2) },
  card: {
    alignSelf: 'stretch',
    borderWidth: BORDER.thin,
    borderColor: palette.inkDim,
    borderRadius: RADIUS.chip,
    padding: space(3),
    gap: space(1.5),
    backgroundColor: palette.bgPanel,
  },
  cardArmed: { borderColor: palette.gold },
  cardMuted: { opacity: 0.72 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  head: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
    flex: 1,
  },
  headArmed: { color: palette.gold },
  headMuted: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
    flex: 1,
  },
  tierChip: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.steelBlue,
  },
  condition: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.ink,
  },
  conditionMuted: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
  },
  odds: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.gold,
  },
  ineligible: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
  },
  callBtn: {
    alignSelf: 'stretch',
    borderWidth: BORDER.thin,
    borderColor: palette.inkDim,
    borderRadius: RADIUS.chip,
    paddingVertical: space(2),
    alignItems: 'center',
  },
  callBtnArmed: { borderColor: palette.gold },
  callText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.small,
    color: palette.ink,
  },
  callTextArmed: { color: palette.gold },
  detail: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
  },
  tip: { marginTop: space(1) },
});
