import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/StyledText';
import { Pop, StaggerIn } from '@/components/fx';
import { PlayerCard } from './PlayerCard';
import type { DailyGrants } from '@/game/home-roster';
import { palette, FONT, FONT_SIZE, space } from '@/theme';

/**
 * The Daily Layer's summary ledger: compact one-line beats for the Spotlight
 * bounty, the first-win purse (with its free scout pull when one landed), and any
 * weekly tiers crossed. Deliberately LINES, not screens: the full reveal chain is
 * reserved for one-time material unlocks, while these are every-day grants that
 * must never slow the win screen down. One-shot pops only (battery-safe). Renders
 * nothing when the settle paid nothing.
 */
export function DailyRewardStrip({ grants }: { grants: DailyGrants | null }) {
  if (!grants) return null;
  const { spotlight, firstWin, weeklyTiers } = grants;
  if (!spotlight && !firstWin && weeklyTiers.length === 0) return null;

  const lines: { key: string; text: string; color: string }[] = [];
  if (spotlight) {
    lines.push({
      key: 'spotlight',
      text: `SPOTLIGHT BOUNTY +${spotlight.coins}`,
      color: palette.gold,
    });
  }
  if (firstWin) {
    lines.push({
      key: 'first-win',
      text:
        firstWin.overflowCoins > 0
          ? `FIRST WIN TODAY +${firstWin.coins} & +${firstWin.overflowCoins} SCOUT OVERFLOW`
          : `FIRST WIN TODAY +${firstWin.coins} & A FREE SCOUT`,
      color: palette.makeGreenLt,
    });
  }
  for (const t of weeklyTiers) {
    lines.push({
      key: `tier-${t.tier}`,
      text: `WEEKLY GOAL: ${t.wins} WINS +${t.coins}${t.abilityId ? ' & A RARE ABILITY' : ''}`,
      color: palette.orange,
    });
  }
  // The pulled player is worth a card only when it actually moved the collection
  // (a new face or a fresh copy); pure overflow already read out as coins above.
  const pulled = firstWin && firstWin.overflowCoins === 0 ? firstWin.player : null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>DAILY</Text>
      {lines.map((line, i) => (
        <StaggerIn key={line.key} index={i} style={styles.row}>
          <Pop popOnMount>
            <Text style={[styles.line, { color: line.color }]}>{line.text}</Text>
          </Pop>
        </StaggerIn>
      ))}
      {pulled ? (
        <StaggerIn index={lines.length} style={styles.row}>
          <PlayerCard rp={pulled} compact />
        </StaggerIn>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', width: '100%', maxWidth: 360, marginTop: space(4), gap: space(1) },
  label: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
    marginBottom: space(1),
  },
  row: { alignSelf: 'stretch' },
  line: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.small,
    textAlign: 'center',
  },
});
