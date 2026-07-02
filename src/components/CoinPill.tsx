import { StyleSheet } from 'react-native';
import { Pop, Counter } from '@/components/fx';
import { CoinIcon } from '@/components/run/PixelIcons';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * The compact coin-balance pill shared by the hub headers and the home screen.
 * Pops on a balance change while the number tweens up to the new value.
 */
export function CoinPill({ coins }: { coins: number }) {
  return (
    <Pop trigger={coins} style={styles.pill}>
      <CoinIcon size={12} color={palette.gold} />
      <Counter value={coins} style={styles.text} />
    </Pop>
  );
}

const styles = StyleSheet.create({
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
  text: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
    color: palette.gold,
  },
});
