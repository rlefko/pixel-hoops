import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/StyledText';
import { CoinPill } from '@/components/CoinPill';
import { useHomeRoster } from '@/context/HomeRosterContext';
import { palette, FONT, FONT_SIZE } from '@/theme';

/**
 * The shared hub header: a screen title plus the animated coin pill. The Locker
 * Room and the Arcade used to share one tabbed shell; now they are separate
 * screens, so this keeps their header identical without duplicating it.
 */
export function HubHeader({ title }: { title: string }) {
  const { homeRoster } = useHomeRoster();
  const coins = homeRoster?.coins ?? 0;
  return (
    <View style={styles.headerRow}>
      <Text style={styles.title}>{title}</Text>
      <CoinPill coins={coins} />
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
});
