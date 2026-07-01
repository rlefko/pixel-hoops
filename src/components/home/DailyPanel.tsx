import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/StyledText';
import { MenuButton } from '@/components/MenuButton';
import { Pop } from '@/components/fx';
import { ClockIcon } from '@/components/run/PixelIcons';
import { CLASS_COLOR } from '@/components/run/class-ui';
import { DIFFICULTY_LABELS } from '@/game/difficulty-mode';
import { WEEKLY_TIERS, type DailyCell } from '@/game/daily';
import { palette, FONT, FONT_SIZE, space } from '@/theme';

/**
 * The hub's Daily Layer card: today's Spotlight cell (one tap sets the selection
 * and starts a run there) and the weekly win goal meter. Clock-free by design:
 * the screen owns the day/week keys and passes plain props, so nothing here can
 * re-render on time. Honest-engagement rules: no countdowns, no streaks, and the
 * claimed state reads as completion, never as a missed chance.
 */
interface DailyPanelProps {
  cell: DailyCell;
  bountyCoins: number;
  claimedToday: boolean;
  weeklyWins: number;
  claimedTiers: readonly number[];
  /** Attract-pulse gate (the hub's idle pause), mirroring the other menu buttons. */
  attract: boolean;
  onPlaySpotlight: () => void;
}

export function DailyPanel({
  cell,
  bountyCoins,
  claimedToday,
  weeklyWins,
  claimedTiers,
  attract,
  onPlaySpotlight,
}: DailyPanelProps) {
  const cellLabel = `${DIFFICULTY_LABELS[cell.difficulty].name} • ${cell.ladderClass}`;
  const nextTierIdx = WEEKLY_TIERS.findIndex((_, i) => !claimedTiers.includes(i));
  const nextTier = nextTierIdx >= 0 ? WEEKLY_TIERS[nextTierIdx] : null;

  return (
    <View style={styles.panel}>
      <Text style={styles.label}>DAILY</Text>
      <MenuButton
        variant="wide"
        label={claimedToday ? 'SPOTLIGHT WON TODAY' : "TODAY'S SPOTLIGHT"}
        sublabel={claimedToday ? `${cellLabel} • PLAY AGAIN` : `${cellLabel} • +${bountyCoins} BOUNTY`}
        color={claimedToday ? palette.inkDim : CLASS_COLOR[cell.ladderClass]}
        icon={
          <ClockIcon
            size={22}
            color={claimedToday ? palette.inkDim : CLASS_COLOR[cell.ladderClass]}
          />
        }
        attract={attract && !claimedToday}
        attractDelayMs={100}
        onPress={onPlaySpotlight}
      />
      <Pop trigger={weeklyWins}>
        <Text style={styles.weekly}>
          {nextTier
            ? `WEEKLY: ${weeklyWins}/${nextTier.wins} WINS • +${nextTier.coins}${nextTier.abilityRarity ? ' & ABILITY' : ''}`
            : `WEEKLY GOALS COMPLETE • ${weeklyWins} WINS`}
        </Text>
      </Pop>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { alignItems: 'center', alignSelf: 'stretch', marginTop: space(2) },
  label: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
    marginBottom: space(1),
  },
  weekly: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.gold,
    marginTop: space(2),
    textAlign: 'center',
  },
});
