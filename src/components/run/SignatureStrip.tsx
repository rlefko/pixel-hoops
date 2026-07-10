import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/StyledText';
import { StaggerIn } from '@/components/fx';
import { StarIcon } from './PixelIcons';
import type { SignatureDelta } from '@/game/home-roster';
import type { SignatureAttempt } from '@/game/run-machine';
import { palette, FONT, FONT_SIZE, space } from '@/theme';

/**
 * A compact "SIGNATURE CARDS" strip for the run summary (win OR loss): the marks
 * this settle stamped on legends' cards. Completed cards are excluded here (they
 * get the full LEGEND SIGNED ceremony); this strip is the half-done card's honest
 * progress line, with the near-miss framing on a loss: the moment banked, the
 * title is still out there. Static rows, one-shot stagger, no loops.
 */

/** One chase legend's closest failed attempt this run (see RunModel.signatureAttempts). */
export type SignatureAttemptRow = SignatureAttempt & { legendName: string };

export function SignatureStrip({
  rows,
  attempts = [],
  champion,
}: {
  rows: SignatureDelta[];
  /** Failed-attempt near-miss lines: chases that qualified this run but never
   * fired (the read the settle used to discard). A legend with a stamped mark
   * row never also shows an attempt line (the caller filters). */
  attempts?: SignatureAttemptRow[];
  champion: boolean;
}) {
  const visible = rows.filter((r) => !r.signed);
  if (visible.length === 0 && attempts.length === 0) return null;
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
      {attempts.map((a, i) => (
        <StaggerIn key={a.legendName} index={visible.length + i} style={styles.row}>
          <StarIcon size={10} color={palette.inkDim} />
          <Text style={styles.name}>{a.legendName}</Text>
          <Text style={styles.attempt}>
            CLOSEST: {a.kind === 'atMost' ? `${a.best} ${a.unit} (MAX ${a.target})` : `${a.best}/${a.target} ${a.unit}`}{' '}
            ({a.games} {a.games === 1 ? 'SHOT' : 'SHOTS'})
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
  attempt: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
  },
  nearMiss: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
    marginTop: space(1),
  },
});
