import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/StyledText';
import { Pop, Counter } from '@/components/fx';
import { CoinIcon } from '@/components/run/PixelIcons';
import { useHomeRoster } from '@/context/HomeRosterContext';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * The shared hub header: a screen title plus the animated coin pill. The Locker
 * Room and the Arcade used to share one tabbed shell; now they are separate
 * screens, so this keeps their header identical without duplicating it. The coin
 * pill pops whenever the balance changes.
 */
export function HubHeader({ title }: { title: string }) {
  const { homeRoster } = useHomeRoster();
  const coins = homeRoster?.coins ?? 0;
  return (
    <View style={styles.headerRow}>
      <Text style={styles.title}>{title}</Text>
      {/* The pill pops on a balance change while the number tweens up to it. */}
      <Pop trigger={coins} style={styles.coinPill}>
        <CoinIcon size={12} color={palette.gold} />
        <Counter value={coins} style={styles.coinText} />
      </Pop>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h3,
    color: palette.gold,
  },
  coinPill: {
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
  coinText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
    color: palette.gold,
  },
});
