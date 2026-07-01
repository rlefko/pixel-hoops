import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/StyledText';
import { Pop, TickCounter } from '@/components/fx';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import { ClockIcon, CoinIcon, DumbbellIcon, StarIcon } from './PixelIcons';
import { StreakFlame } from './StreakFlame';
import type { RunRewards } from '@/types/run-map';

/**
 * The run HUD: title, map progress, and clearly labeled resources. The COINS pill
 * shows the player's WALLET total (coins bank as they are earned, so they are already
 * yours and survive any exit), spent in the Locker Room. Training points are spent at
 * Training nodes and reputation is the run score. Values pop when they change.
 */

interface ResourceHeaderProps {
  rewards: RunRewards;
  /** The player's wallet total. Shown on the COINS pill: coins bank as-earned, so the
   * HUD reflects banked coins, not a separate run tally. */
  walletCoins: number;
  /** 1-based index of the map being climbed. */
  mapNumber: number;
  /** Total maps in the run. */
  totalMaps: number;
  /** Equipped passive-boost count (shown as n/5). Omitted hides the pill. */
  boostCount?: number;
  /** Forgiven losses ("timeouts") left in the run. Omitted hides the pill; 0 shows
   * a dimmed/danger pill so the no-safety-net tiers read their stakes at a glance. */
  timeouts?: number;
  /** Short run label, e.g. "HARD · A". */
  modeLabel?: string;
  /** The run's win streak: shows the run-heat flame chip from 2 wins up. */
  wins?: number;
  /** Screen idle flag, quieting the flame's glow loop. */
  paused?: boolean;
}

function Pill({
  icon,
  value,
  label,
  tick = false,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  /** Count value changes up audibly (the wallet receiving a payout). */
  tick?: boolean;
}) {
  return (
    <Pop trigger={value} style={styles.pill}>
      {icon}
      {tick ? (
        <TickCounter value={value} style={styles.pillValue} />
      ) : (
        <Text style={styles.pillValue}>{value}</Text>
      )}
      <Text style={styles.pillLabel}>{label}</Text>
    </Pop>
  );
}

export function ResourceHeader({
  rewards,
  walletCoins,
  mapNumber,
  totalMaps,
  boostCount,
  timeouts,
  modeLabel,
  wins,
  paused = false,
}: ResourceHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.left}>
        <Text style={styles.title}>THE RUN</Text>
        <Text style={styles.round}>
          MAP {mapNumber}/{totalMaps}
        </Text>
        {modeLabel ? <Text style={styles.tier}>{modeLabel}</Text> : null}
      </View>
      <View style={styles.right}>
        {typeof wins === 'number' ? <StreakFlame streak={wins} paused={paused} /> : null}
        <Pill icon={<CoinIcon size={12} color={palette.gold} />} value={walletCoins} label="COINS" tick />
        <Pill icon={<DumbbellIcon size={12} color={palette.makeGreen} />} value={rewards.trainingPoints} label="TRAIN" />
        <Pill icon={<StarIcon size={12} color={palette.gold} />} value={rewards.reputation} label="REP" />
        {typeof boostCount === 'number' ? (
          <Pop trigger={boostCount} style={styles.pill}>
            <Text style={styles.boostGlyph}>✦</Text>
            <Text style={styles.pillValue}>{boostCount}/5</Text>
            <Text style={styles.pillLabel}>BOOSTS</Text>
          </Pop>
        ) : null}
        {typeof timeouts === 'number' ? (
          <Pop trigger={timeouts} style={[styles.pill, timeouts === 0 ? styles.pillDanger : null]}>
            <ClockIcon size={12} color={timeouts === 0 ? palette.missRed : palette.makeGreen} />
            <Text style={styles.pillValue}>{timeouts}</Text>
            <Text style={styles.pillLabel}>TIMEOUTS</Text>
          </Pop>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space(4),
    paddingTop: space(2),
    paddingBottom: space(2),
  },
  left: {
    gap: space(1),
  },
  title: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.label,
    color: palette.gold,
  },
  round: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
  },
  tier: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.orange,
  },
  right: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    flexShrink: 1,
    gap: space(2),
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1),
    paddingHorizontal: space(2),
    paddingVertical: space(1),
    backgroundColor: palette.bgPanel,
    borderWidth: BORDER.thin,
    borderColor: palette.gold + '55',
    borderRadius: RADIUS.chip,
  },
  pillValue: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.small,
    color: palette.ink,
  },
  boostGlyph: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.gold,
  },
  pillDanger: {
    borderColor: palette.missRed + '77',
  },
  pillLabel: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
  },
});
