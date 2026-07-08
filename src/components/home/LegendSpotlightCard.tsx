import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/StyledText';
import { MenuButton } from '@/components/MenuButton';
import { Pop } from '@/components/fx';
import { CLASS_COLOR } from '@/components/run/class-ui';
import { SIGNATURE_TIER_NAMES } from '@/game/signature';
import { palette, FONT, FONT_SIZE, space } from '@/theme';
import type { LegendSpotlightResult } from '@/game/legend-spotlight';

interface LegendSpotlightCardProps {
  result: LegendSpotlightResult;
  claimed: boolean;
  onPlay: () => void;
  onClaim: () => void;
  attract: boolean;
}

export function LegendSpotlightCard({
  result,
  claimed,
  onPlay,
  onClaim,
  attract,
}: LegendSpotlightCardProps) {
  const { legend, challenge, marks, tier, conditionText } = result;
  const tierName =
    SIGNATURE_TIER_NAMES[tier as keyof typeof SIGNATURE_TIER_NAMES] || 'GREAT';
  const hasMoment = !!marks.moment;
  const hasTitle = !!marks.title;

  return (
    <View style={styles.panel}>
      <MenuButton
        variant="wide"
        label={claimed ? 'SPOTLIGHT CLAIMED' : "TODAY'S SPOTLIGHT"}
        sublabel={
          claimed
            ? `${tierName} +${50} COINS`
            : `${tierName} ${legend.name}`
        }
        color={
          claimed
            ? palette.inkDim
            : (CLASS_COLOR[challenge.floor as keyof typeof CLASS_COLOR] ??
              palette.gold)
        }
        icon={
          <Text style={styles.tierChip}>
            {tierName}
          </Text>
        }
        attract={attract && !claimed}
        onPress={claimed ? onClaim : onPlay}
      />
      <Pop trigger={conditionText}>
        <Text style={styles.condition}>
          {conditionText}
        </Text>
      </Pop>
      <View style={styles.marksRow}>
        <Text style={[styles.mark, hasMoment && styles.markComplete]}>
          MOMENT {hasMoment ? '✓' : '○'}
        </Text>
        <Text style={[styles.mark, hasTitle && styles.markComplete]}>
          TITLE {hasTitle ? '✓' : '○'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: space(0.5),
  },
  tierChip: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.small,
    color: palette.gold,
    fontWeight: 'bold',
  },
  condition: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
    marginTop: space(0.5),
    textAlign: 'center',
    maxWidth: 280,
  },
  marksRow: {
    flexDirection: 'row',
    marginTop: space(0.5),
    gap: space(1),
  },
  mark: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
  },
  markComplete: {
    color: palette.gold,
  },
});
