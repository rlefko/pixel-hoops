import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/StyledText';
import { Pop, StaggerIn, TickCounter } from '@/components/fx';
import { FavorIcon } from './PixelIcons';
import { FAVOR_PER_COPY, favorConvertible } from '@/game/favor';
import { playerDraftClass } from '@/game/draft';
import type { FavorDelta } from '@/game/home-roster';
import { palette, FONT, FONT_SIZE, space } from '@/theme';

/**
 * A compact "FAVOR EARNED" strip for the run summary (win OR loss): the un-owned
 * players this run's wins earned favor with. The loudest rows show (copy conversions
 * first, then the biggest gains, then chase-complete refunds); the rest fold into one
 * "+N more" line so a deep run never wallpapers the summary. Favor-driven UNLOCKS are
 * excluded here; they get the full player-scouted reveal (or the "stays in touch"
 * line on a loss). Static rows, one-shot stagger, no loops (battery-safe).
 */

/** Detail rows shown before folding into the "+N more" line. */
const MAX_ROWS = 3;

function rowRank(r: FavorDelta): number {
  if (r.copiesGranted > 0) return 2;
  if (r.residualCoins > 0) return 0; // informative, but never above a live chase
  return 1;
}

export function FavorStrip({ rows }: { rows: FavorDelta[] }) {
  const visible = rows.filter((r) => !r.unlockedNow);
  if (visible.length === 0) return null;
  const sorted = [...visible].sort(
    (a, b) => rowRank(b) - rowRank(a) || b.earned - a.earned || b.after - a.after
  );
  const shown = sorted.slice(0, MAX_ROWS);
  const folded = sorted.length - shown.length;
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>FAVOR EARNED</Text>
      {shown.map((r, i) => {
        const cls = playerDraftClass(r.player);
        const converted = r.copiesGranted > 0;
        return (
          <StaggerIn key={`${r.player.player.name}-${r.player.position}`} index={i} style={styles.row}>
            <FavorIcon size={12} color={converted ? palette.gold : palette.steelBlue} />
            <Text style={styles.name} numberOfLines={1}>
              {r.player.player.name.toUpperCase()}
            </Text>
            {r.earned > 0 ? (
              <TickCounter value={r.earned} from={0} prefix="+" tier="small" style={styles.earned} />
            ) : null}
            {converted ? (
              <Pop popOnMount>
                <Text style={styles.copy}>
                  +{r.copiesGranted} {r.copiesGranted === 1 ? 'COPY' : 'COPIES'}
                </Text>
              </Pop>
            ) : r.residualCoins > 0 ? (
              <Text style={styles.coins}>SIGNED · +{r.residualCoins} COINS</Text>
            ) : favorConvertible(cls) ? (
              <Text style={styles.meter}>
                {r.after}/{FAVOR_PER_COPY[cls]}
              </Text>
            ) : (
              <Text style={styles.meter}>{r.after} BANKED</Text>
            )}
          </StaggerIn>
        );
      })}
      {folded > 0 ? (
        <Text style={styles.more}>
          +{folded} more earned favor
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', width: '100%', maxWidth: 360, marginTop: space(3), gap: space(1) },
  label: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.steelBlue,
    marginBottom: space(1),
  },
  row: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
  },
  name: {
    flex: 1,
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.ink,
  },
  earned: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.small,
    color: palette.steelBlue,
  },
  copy: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.small,
    color: palette.gold,
  },
  coins: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.gold,
  },
  meter: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
  },
  more: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
  },
});
