import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/StyledText';
import { StaggerIn } from '@/components/fx';
import { StarIcon } from './PixelIcons';
import type { SignatureDelta } from '@/game/home-roster';
import { palette, FONT, FONT_SIZE, space } from '@/theme';

/**
 * A compact "SIGNATURE CARDS" strip for the run summary (win OR loss): the marks
 * this settle stamped on legends' cards. Completed cards are excluded here (they
 * get the full LEGEND SIGNED ceremony); this strip is the half-done card's honest
 * progress line, with the near-miss framing on a loss: the moment banked, the
 * title is still out there. Static rows, one-shot stagger, no loops.
 */

export function SignatureStrip({ rows, champion }: { rows: SignatureDelta[]; champion: boolean }) {
  const visible = rows.filter((r) => !r.signed);
  if (visible.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>SIGNATURE CARDS</Text>
      {visible.map((r, i) => (
        <StaggerIn key={r.challenge.legendKey} index={i} style={styles.row}>
          <StarIcon size={10} color={palette.gold} />
          <Text style={styles.name}>{r.player.player.name}</Text>
          <Text style={styles.mark}>
            {r.momentStamped ? 'SIGNATURE MOMENT PROVEN' : 'CHAMPIONSHIP TOGETHER'}
          </Text>
        </StaggerIn>
      ))}
      {!champion && visible.some((r) => r.momentStamped) ? (
        <Text style={styles.nearMiss}>
          The moment was real. Win it all together and the card completes.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', marginTop: space(3), gap: space(1) },
  label: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  name: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.ink,
  },
  mark: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.gold,
  },
  nearMiss: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
    marginTop: space(1),
  },
});
