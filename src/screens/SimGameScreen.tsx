import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/StyledText';
import { useSimGame } from '@/hooks/useSimGame';
import { LineupBoard } from '@/components/game/LineupBoard';
import { GamePlanPicker } from '@/components/game/GamePlanPicker';
import { PlayByPlayFeed } from '@/components/game/PlayByPlayFeed';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * The playable auto-sim 5-on-5 slice. Pregame: set the game plan. Replaying:
 * watch the juicy sim. Final/RunOver: take the result and advance the short
 * escalating run. The legacy card game stays reachable on its own route.
 */
export default function SimGameScreen() {
  const router = useRouter();
  const { state, actions } = useSimGame();

  if (state.phase === 'replaying' && state.result) {
    return (
      <View style={styles.container}>
        <PlayByPlayFeed
          timeline={state.result.events}
          homeName={state.homeTeam.name}
          awayName={state.awayTeam.name}
          round={state.round}
          totalRounds={state.totalRounds}
          onComplete={actions.finishReplay}
        />
      </View>
    );
  }

  if (state.phase === 'final' && state.result) {
    const won = state.result.winner === 'home';
    const moreGames = won && state.round < state.totalRounds;
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <Text
            style={[
              styles.bigResult,
              { color: won ? palette.makeGreen : palette.missRed },
            ]}
          >
            {won ? 'WIN!' : 'LOSS'}
          </Text>
          <Text style={styles.finalScore}>
            {state.result.finalHome} - {state.result.finalAway}
          </Text>
          <Text style={styles.subtle}>vs {state.opponentName}</Text>
          <Button
            label={
              moreGames ? 'NEXT GAME' : won ? 'CLAIM THE TITLE' : 'SEE RESULTS'
            }
            onPress={actions.nextOrEnd}
            primary
          />
        </View>
      </View>
    );
  }

  if (state.phase === 'runover') {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <Text
            style={[
              styles.bigResult,
              { color: state.champion ? palette.gold : palette.ink },
            ]}
          >
            {state.champion ? 'CHAMPIONS!' : 'RUN OVER'}
          </Text>
          <Text style={styles.subtle}>
            {state.wins} {state.wins === 1 ? 'win' : 'wins'} this run
          </Text>
          <Button label="NEW RUN" onPress={actions.newRun} primary />
          <Pressable onPress={() => router.replace('/')}>
            <Text style={styles.menuLink}>Menu</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Pregame
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.pregame}>
        <Text style={styles.round}>
          ROUND {state.round} / {state.totalRounds}
        </Text>
        <Text style={styles.matchup}>
          YOUR SQUAD <Text style={styles.vs}>vs</Text> {state.opponentName}
        </Text>

        <Text style={styles.sectionTitle}>YOUR FIVE</Text>
        <LineupBoard team={state.homeTeam} />

        <Text style={styles.sectionTitle}>GAME PLAN</Text>
        <GamePlanPicker plan={state.gamePlan} onChange={actions.setGamePlan} />

        <Button label="TIP OFF" onPress={actions.startGame} primary />
        <Pressable onPress={() => router.replace('/')}>
          <Text style={styles.menuLink}>Quit to Menu</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Button({
  label,
  onPress,
  primary,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.button, primary && styles.buttonPrimary]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bgDeep,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space(6),
  },
  pregame: {
    padding: space(5),
    paddingTop: space(8),
  },
  round: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
    textAlign: 'center',
  },
  matchup: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.label,
    color: palette.ink,
    textAlign: 'center',
    marginTop: space(2),
  },
  vs: {
    color: palette.inkDim,
  },
  sectionTitle: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.gold,
    marginTop: space(6),
    marginBottom: space(2),
  },
  button: {
    marginTop: space(7),
    paddingVertical: space(4),
    paddingHorizontal: space(6),
    borderRadius: RADIUS.chip,
    borderWidth: BORDER.chunk,
    borderColor: palette.gold,
    alignSelf: 'center',
  },
  buttonPrimary: {
    backgroundColor: palette.gold + '1A',
  },
  buttonText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.label,
    color: palette.gold,
    textAlign: 'center',
  },
  bigResult: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h1,
    textAlign: 'center',
  },
  finalScore: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h2,
    color: palette.ink,
    marginTop: space(4),
  },
  subtle: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.label,
    color: palette.inkDim,
    marginTop: space(3),
  },
  menuLink: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(5),
  },
});
