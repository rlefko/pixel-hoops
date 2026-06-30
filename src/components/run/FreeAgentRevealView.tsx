import { StyleSheet, Pressable, ScrollView } from 'react-native';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { StaggerIn } from '@/components/fx';
import { PlayerCard } from './PlayerCard';
import { compareByRatingDesc } from '@/game/roster-filter';
import type { RosterPlayer } from '@/types/roster';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * The first-run welcome: the player's starting free agents have signed on to
 * launch their franchise. A simple, celebratory reveal of the full starting
 * roster with a single button to begin. Shown once (gated on
 * HomeRoster.seenWelcome), then never again.
 */
interface FreeAgentRevealViewProps {
  players: RosterPlayer[];
  onContinue: () => void;
}

export function FreeAgentRevealView({
  players,
  onContinue,
}: FreeAgentRevealViewProps) {
  // Reveal the strongest signings first (these starters carry no upgrades yet).
  const ordered = [...players].sort(compareByRatingDesc());
  return (
    <Screen style={styles.container} topGap={space(4)}>
      <Text style={styles.kicker}>WELCOME TO THE LEAGUE</Text>
      <Text style={styles.subtitle}>
        {players.length} free agents have signed with your franchise. Set your
        lineup, run the bracket, and build a dynasty.
      </Text>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {ordered.map((rp, i) => (
          <StaggerIn
            key={`${rp.player.name}-${i}`}
            index={i}
            style={styles.cardWrap}
          >
            <PlayerCard rp={rp} />
          </StaggerIn>
        ))}
      </ScrollView>

      <Pressable style={styles.button} onPress={onContinue}>
        <Text style={styles.buttonText}>LET'S GO</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingHorizontal: space(5) },
  kicker: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h3,
    color: palette.gold,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(3),
    lineHeight: 18,
  },
  list: { alignSelf: 'stretch', marginTop: space(5) },
  listContent: { gap: space(2), paddingBottom: space(2) },
  cardWrap: {
    borderWidth: BORDER.chunk,
    borderColor: palette.bgPanel,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.bgPanel,
    paddingHorizontal: space(3),
    paddingVertical: space(1),
  },
  button: {
    marginTop: space(5),
    paddingVertical: space(3),
    paddingHorizontal: space(8),
    borderRadius: RADIUS.chip,
    borderWidth: BORDER.chunk,
    borderColor: palette.gold,
    backgroundColor: palette.gold + '1A',
  },
  buttonText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
    color: palette.gold,
  },
});
