import { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { useRun } from '@/hooks/useRun';
import { buildHomeTeam, buildOpponentTeam, type RunModel } from '@/game/run-machine';
import { LineupBoard } from '@/components/game/LineupBoard';
import { GamePlanPicker } from '@/components/game/GamePlanPicker';
import { PlayByPlayFeed } from '@/components/game/PlayByPlayFeed';
import { RunMapView } from '@/components/run/RunMapView';
import { RecruitView } from '@/components/run/RecruitView';
import { LineupBuilderView } from '@/components/run/LineupBuilderView';
import { TrainingView } from '@/components/run/TrainingView';
import { RestView } from '@/components/run/RestView';
import { BoostDraftView } from '@/components/run/BoostDraftView';
import { BoostNodeView } from '@/components/run/BoostNodeView';
import { ItemDropView } from '@/components/run/ItemDropView';
import { LegendRevealView } from '@/components/run/LegendRevealView';
import { RunSummaryView } from '@/components/run/RunSummaryView';
import { BoxScoreView } from '@/components/run/BoxScoreView';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

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
          boosts={model.boosts}
          onChoose={actions.chooseNode}
          onQuit={actions.endRun}
          onOpenLineup={actions.openLineupBuilder}
        />
      );
    case 'boostDraft':
      return (
        <BoostDraftView
          round={model.phase.round}
          offers={model.phase.offers}
          pendingFull={model.phase.pendingFull}
          forced={model.phase.forced}
          owned={model.boosts}
          onDraft={actions.draftBoost}
          onDrop={actions.dropBoostForNew}
          onSkip={actions.skipBoostDraft}
        />
      );
    case 'boost':
      return (
        <BoostNodeView
          stock={model.phase.stock}
          roster={model.core.roster}
          onTake={actions.takeBoostItem}
          onLeave={actions.leaveBoost}
        />
      );
    case 'itemDrop':
      return (
        <ItemDropView
          drop={model.phase.drop}
          roster={model.core.roster}
          onTake={actions.takeDrop}
          onSkip={actions.skipDrop}
        />
      );
    case 'legendReveal':
      return (
        <LegendRevealView
          offer={model.phase.offer}
          onScout={actions.scoutLegend}
          onDecline={actions.declineLegend}
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
          trainingPoints={model.core.rewards.trainingPoints}
          onTrain={actions.trainPlayer}
          onDone={actions.backToMap}
        />
      );
    case 'rest':
      return (
        <RestView
          roster={model.core.roster}
          onRebuild={actions.openLineupBuilder}
          onContinue={actions.rest}
        />
      );
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
  // The home board previews the five that will actually dress (healthy-first,
  // items + auras + boosts baked in); the away board scouts the opponent the run
  // will field. Both come from the same builders the sim uses, so the preview
  // never lies about the matchup.
  const home = buildHomeTeam(model);
  const away = buildOpponentTeam(model.core, nodeId);
  return (
    <Screen scroll contentContainerStyle={styles.pregame}>
      <Text style={styles.depth}>DEPTH {round}</Text>
      <Text style={styles.section}>SCOUTING REPORT</Text>
      <View style={styles.scoutHeader}>
        <View style={[styles.swatch, { backgroundColor: away.colorHex }]} />
        <Text style={styles.oppName} numberOfLines={1}>
          {away.name}
        </Text>
      </View>
      <LineupBoard team={away} />
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
    </Screen>
  );
}

function Postgame({
  model,
  onContinue,
}: {
  model: RunModel;
  onContinue: () => void;
}) {
  // Default collapsed so the win/loss headline reads instantly and the retry
  // stays one tap away; the box score is opt-in detail.
  const [showBox, setShowBox] = useState(false);
  if (model.phase.kind !== 'postgame' || !model.game) return null;
  const won = model.phase.won;
  const { result, home, away } = model.game;
  return (
    <Screen style={styles.postgame} bottomGap={space(6)}>
      <View style={styles.postgameHeadline}>
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
      </View>

      <Pressable onPress={() => setShowBox((v) => !v)}>
        <Text style={styles.link}>
          {showBox ? 'Hide Box Score' : 'Show Box Score'}
        </Text>
      </Pressable>

      {showBox ? (
        <View style={styles.postgameBox}>
          <BoxScoreView home={home} away={away} box={result.box} />
        </View>
      ) : (
        <View style={styles.postgameBox} />
      )}

      <Pressable style={[styles.button, styles.primary]} onPress={onContinue}>
        <Text style={styles.buttonText}>{won ? 'CONTINUE' : 'END RUN'}</Text>
      </Pressable>
    </Screen>
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
  pregame: { paddingHorizontal: space(5) },
  postgame: {
    alignItems: 'center',
    paddingHorizontal: space(5),
  },
  postgameHeadline: { alignItems: 'center' },
  postgameBox: {
    flex: 1,
    alignSelf: 'stretch',
    marginTop: space(3),
  },
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
  scoutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space(1),
  },
  swatch: {
    width: space(3),
    height: space(3),
    borderRadius: RADIUS.chip,
    marginRight: space(2),
  },
  oppName: {
    flex: 1,
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.small,
    color: palette.ink,
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
