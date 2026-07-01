import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/StyledText';
import { StaggerIn } from '@/components/fx';
import { PlayerCard } from './PlayerCard';
import type { ProgressedCopy } from '@/game/home-roster';
import { palette, FONT, FONT_SIZE, space } from '@/theme';

/**
 * A compact "COLLECTION PROGRESS" strip for the win screen: the players this run advanced a
 * copy toward (but did not yet unlock). Each shows its copies meter at the new count, so a
 * run that only progressed shards still reads as forward motion, without the full "player
 * scouted" reveal (that plays only on a real unlock). Static pips + a one-shot stagger; no
 * loops (battery-safe). Renders nothing when there is no progress.
 */
export function CollectionProgressStrip({ progressed }: { progressed: ProgressedCopy[] }) {
  if (progressed.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>COLLECTION PROGRESS</Text>
      {progressed.map((p, i) => (
        <StaggerIn
          key={`${p.player.player.name}-${p.player.position}-${i}`}
          index={i}
          style={styles.row}
        >
          <PlayerCard
            rp={p.player}
            compact
            collect={{
              copies: p.after,
              threshold: p.threshold,
              justGained: p.after - p.before,
            }}
          />
        </StaggerIn>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', width: '100%', maxWidth: 360, marginTop: space(4), gap: space(1) },
  label: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.steelBlue,
    marginBottom: space(1),
  },
  row: { alignSelf: 'stretch' },
});
