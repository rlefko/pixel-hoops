import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/StyledText';
import { Pop } from '@/components/fx';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import { CoinIcon, DumbbellIcon, StarIcon } from './PixelIcons';
import type { RunRewards } from '@/types/run-map';

/**
 * The run HUD: title, map progress, and clearly labeled resources. Coins are
 * spent in the Locker Room, training points at Training nodes, and reputation is
 * the run score. Values pop when they change after a win.
 */

interface ResourceHeaderProps {
  rewards: RunRewards;
  /** 1-based index of the map being climbed. */
  mapNumber: number;
  /** Total maps in the run. */
  totalMaps: number;
  /** Equipped passive-boost count (shown as n/5). Omitted hides the pill. */
  boostCount?: number;
  /** Short run label, e.g. "HARD · A". */
  modeLabel?: string;
}

function Pill({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <Pop trigger={value} style={styles.pill}>
      {icon}
      <Text style={styles.pillValue}>{value}</Text>
      <Text style={styles.pillLabel}>{label}</Text>
    </Pop>
  );
}

export function ResourceHeader({
  rewards,
  mapNumber,
  totalMaps,
  boostCount,
  modeLabel,
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
        <Pill icon={<CoinIcon size={12} color={palette.gold} />} value={rewards.coins} label="COINS" />
        <Pill icon={<DumbbellIcon size={12} color={palette.makeGreen} />} value={rewards.trainingPoints} label="TRAIN" />
        <Pill icon={<StarIcon size={12} color={palette.gold} />} value={rewards.reputation} label="REP" />
        {typeof boostCount === 'number' ? (
          <Pop trigger={boostCount} style={styles.pill}>
            <Text style={styles.boostGlyph}>✦</Text>
            <Text style={styles.pillValue}>{boostCount}/5</Text>
            <Text style={styles.pillLabel}>BOOSTS</Text>
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
  pillLabel: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
  },
});
