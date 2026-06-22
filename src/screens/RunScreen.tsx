import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/StyledText';
import { useRun } from '@/hooks/useRun';
import { buildTeam } from '@/game/lineup';
import { LineupBoard } from '@/components/game/LineupBoard';
import { GamePlanPicker } from '@/components/game/GamePlanPicker';
import { PlayByPlayFeed } from '@/components/game/PlayByPlayFeed';
import { RunMapView } from '@/components/run/RunMapView';
import { RecruitView } from '@/components/run/RecruitView';
import { LineupBuilderView } from '@/components/run/LineupBuilderView';
import { TrainingView } from '@/components/run/TrainingView';
import { RestView } from '@/components/run/RestView';
import { ShopView } from '@/components/run/ShopView';
import { RunSummaryView } from '@/components/run/RunSummaryView';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import type { RunModel } from '@/game/run-machine';

/**
 * The roguelike run, one screen, one route. Renders a sub-view per RunPhase and
 * dispatches actions from useRun. The run state survives across steps because it
 * lives in the hook, not in navigation.
 */

type RunActions = ReturnType<typeof useRun>['actions'];

export default function RunScreen() {
  const router = useRouter();
  const { model, loaded, actions } = useRun();
  const goMenu = () => router.replace('/');

  if (!loaded || !model) {
    return (
      <View style={styles.center}>
        <Text style={styles.loading}>LOADING...</Text>
      </View>
    );
  }

  switch (model.phase.kind) {
    case 'map':
      return (
        <RunMapView
          core={model.core}
          onChoose={actions.chooseNode}
          onQuit={actions.endRun}
          onOpenLineup={actions.openLineupBuilder}
        />
      );
    case 'pregame':
      return <Pregame model={model} actions={actions} />;
    case 'game':
      return model.game ? (
        <PlayByPlayFeed
          timeline={model.game.result.events}
          homeTeam={model.game.home}
          awayTeam={model.game.away}
          round={depthOf(model, model.phase.nodeId)}
          totalRounds={model.core.map.layers.length}
          onComplete={actions.finishReplay}
        />
      ) : null;
    case 'postgame':
      return <Postgame model={model} onContinue={actions.resolveGameResult} />;
    case 'recruit':
      return (
        <RecruitView
          offers={model.phase.offers}
          benchCount={model.core.roster.bench.length}
          onRecruit={actions.recruit}
          onSkip={actions.skipNode}
        />
      );
    case 'training':
      return (
        <TrainingView
          roster={model.core.roster}
          onTrain={actions.trainPlayer}
          onSkip={actions.skipNode}
        />
      );
    case 'rest':
      return (
        <RestView
          onRebuild={actions.openLineupBuilder}
          onContinue={actions.rest}
        />
      );
    case 'shop':
      return <ShopView onContinue={actions.skipNode} />;
    case 'lineup':
      return (
        <LineupBuilderView
          roster={model.core.roster}
          onConfirm={actions.setLineup}
          onCancel={actions.cancelLineup}
        />
      );
    case 'summary':
      return (
        <RunSummaryView
          champion={model.phase.champion}
          wins={model.wins}
          onNewRun={actions.newRun}
          onMenu={goMenu}
        />
      );
  }
}

function depthOf(model: RunModel, nodeId: string): number {
  const node = model.core.map.nodes[nodeId];
  return node.round ?? node.layer + 1;
}

function Pregame({ model, actions }: { model: RunModel; actions: RunActions }) {
  const nodeId = model.phase.kind === 'pregame' ? model.phase.nodeId : '';
  const round = depthOf(model, nodeId);
  const home = buildTeam(
    'Your Squad',
    model.core.roster.starters,
    model.gamePlan,
    palette.homeTeam,
    palette.homeTeamAccent
  );
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.pregame}>
        <Text style={styles.depth}>DEPTH {round}</Text>
        <Text style={styles.section}>YOUR FIVE</Text>
        <LineupBoard team={home} />
        <Pressable onPress={actions.openLineupBuilder}>
          <Text style={styles.link}>Change Lineup</Text>
        </Pressable>
        <Text style={styles.section}>GAME PLAN</Text>
        <GamePlanPicker plan={model.gamePlan} onChange={actions.setGamePlan} />
        <Pressable
          style={[styles.button, styles.primary]}
          onPress={actions.enterGame}
        >
          <Text style={styles.buttonText}>TIP OFF</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Postgame({
  model,
  onContinue,
}: {
  model: RunModel;
  onContinue: () => void;
}) {
  if (model.phase.kind !== 'postgame' || !model.game) return null;
  const won = model.phase.won;
  const result = model.game.result;
  return (
    <View style={styles.center}>
      <Text
        style={[
          styles.result,
          { color: won ? palette.makeGreen : palette.missRed },
        ]}
      >
        {won ? 'WIN!' : 'LOSS'}
      </Text>
      <Text style={styles.score}>
        {result.finalHome} - {result.finalAway}
      </Text>
      <Text style={styles.vs}>vs {model.game.opponentName}</Text>
      <Pressable style={[styles.button, styles.primary]} onPress={onContinue}>
        <Text style={styles.buttonText}>{won ? 'CONTINUE' : 'END RUN'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bgDeep },
  center: {
    flex: 1,
    backgroundColor: palette.bgDeep,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space(6),
  },
  loading: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
  },
  pregame: { padding: space(5), paddingTop: space(8) },
  depth: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
    textAlign: 'center',
  },
  section: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.gold,
    marginTop: space(6),
    marginBottom: space(2),
  },
  link: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.steelBlue,
    marginTop: space(2),
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
  primary: { backgroundColor: palette.gold + '1A' },
  buttonText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.label,
    color: palette.gold,
    textAlign: 'center',
  },
  result: { fontFamily: FONT.display, fontSize: FONT_SIZE.h1 },
  score: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h2,
    color: palette.ink,
    marginTop: space(4),
  },
  vs: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.label,
    color: palette.inkDim,
    marginTop: space(3),
  },
});
