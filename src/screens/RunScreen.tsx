import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useArcadeRouter } from '@/navigation';
import { useFeelSettings, sfx, playMusicContext, setGameEnergy, type WipeConfig } from '@/feel';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { CoinFly, Pop, Counter, TickCounter } from '@/components/fx';
import { useRun } from '@/hooks/useRun';
import { useActiveRun } from '@/context/ActiveRunContext';
import { TeachCallout } from '@/components/teach/TeachCallout';
import { TeachSlot } from '@/components/teach/TeachSlot';
import {
  buildHomeTeam,
  buildOpponentTeam,
  coachReorderRoster,
  pendingWinRewards,
  steppingInSubs,
  MAX_BANISHES,
  TOTAL_MAPS,
  type RunModel,
} from '@/game/run-machine';
import {
  classAboveLadder,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  difficultyPerks,
} from '@/game/difficulty-mode';
import { arenaTierFor } from '@/game/arena-tier';
import { getCoach } from '@/game/coaches';
import { coachForTeamName } from '@/game/opponent-coach';
import { CoachRecBanner } from '@/components/run/CoachRecBanner';
import { LineupBoard } from '@/components/game/LineupBoard';
import {
  TeamIdentityCard,
  MatchupHeadline,
} from '@/components/game/TeamIdentityCard';
import { deriveTeamIdentity } from '@/game/team-identity';
import { PlayByPlayFeed } from '@/components/game/PlayByPlayFeed';
import { RunMapView } from '@/components/run/RunMapView';
import { RecruitView } from '@/components/run/RecruitView';
import { PlayerScoutedView } from '@/components/run/PlayerScoutedView';
import { DraftView } from '@/components/run/DraftView';
import { DropForRecruitView } from '@/components/run/DropForRecruitView';
import { LineupBuilderView } from '@/components/run/LineupBuilderView';
import { TrainingView } from '@/components/run/TrainingView';
import { RestView } from '@/components/run/RestView';
import { BoostDraftView } from '@/components/run/BoostDraftView';
import { BoostNodeView } from '@/components/run/BoostNodeView';
import { ItemDropView } from '@/components/run/ItemDropView';
import { BagView } from '@/components/run/BagView';
import { LegendRevealView } from '@/components/run/LegendRevealView';
import { RunSummaryView } from '@/components/run/RunSummaryView';
import { ChampionView } from '@/components/run/ChampionView';
import { CoachUnlockView } from '@/components/run/CoachUnlockView';
import { BountyRewardView } from '@/components/run/BountyRewardView';
import type { SimResult } from '@/types/sim';
import { BoxScoreView } from '@/components/run/BoxScoreView';
import { ClockIcon, CoinIcon } from '@/components/run/PixelIcons';
import { StreakFlame } from '@/components/run/StreakFlame';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * The roguelike run, one screen, one route. Renders a sub-view per RunPhase and
 * dispatches actions from useRun. The run state survives across steps because it
 * lives in the hook, not in navigation.
 */

type RunActions = ReturnType<typeof useRun>['actions'];

export default function RunScreen() {
  const nav = useArcadeRouter();
  const {
    model,
    loaded,
    actions,
    wonCoachIds,
    wonPlayers,
    bountyGrant,
    dailyGrants,
    favorRows,
    collectProgress,
    equippedCoachId,
  } = useRun();
  const { autoSkipGames } = useFeelSettings();
  const { savedRun } = useActiveRun();
  // Leaving the run is a suspend, not a quit: the run is auto-saved continuously, so
  // we just return home and let the saved snapshot persist (no banking, no end).
  const goMenu = () => nav.replace('/', 'menu');

  // The coach-unlock reveal plays after the champion celebration. Reset whenever the
  // run leaves the summary phase so it never leaks into the next run's summary.
  const [showCoachReveal, setShowCoachReveal] = useState(false);
  const [showPlayerReveal, setShowPlayerReveal] = useState(false);
  const [showBountyReveal, setShowBountyReveal] = useState(false);
  const phaseKind = model?.phase.kind;
  useEffect(() => {
    if (phaseKind !== 'summary') {
      setShowCoachReveal(false);
      setShowPlayerReveal(false);
      setShowBountyReveal(false);
    }
  }, [phaseKind]);

  // Music: the calm run theme plays across the WHOLE run (every phase). The live game
  // (and the pregame buildup before TIP OFF) fades in the energy layer on top for a lift,
  // without changing the calm bed. Driven by phase, not the play-by-play feed, so an
  // auto-skipped game behaves the same as a watched one.
  useEffect(() => {
    if (!phaseKind) return;
    playMusicContext('run');
    setGameEnergy(phaseKind === 'pregame' || phaseKind === 'game');
  }, [phaseKind]);

  // Leaving the run entirely (including an abrupt exit mid-game) returns to the hub theme
  // and drops the energy layer.
  useEffect(() => {
    return () => {
      playMusicContext('menu');
      setGameEnergy(false);
    };
  }, []);

  // The ceremony's "destination settled" signal for an auto-skipped stakes game: the
  // tip-off wipe covers enterGame, but with skip on the real destination (summary on a
  // win, the full postgame on a loss) lands one AutoAdvance commit later. Waiters
  // registered at the tip-off resolve when the phase leaves 'game', so the cover holds
  // to the commit the player will actually see instead of the FINAL... placeholder.
  // Flush-on-unmount keeps an abandoned run from ever stranding the cover (the
  // provider's cap is the last-resort backstop, not the design).
  const settleWaitersRef = useRef<Array<() => void>>([]);
  useEffect(() => {
    if (!phaseKind || phaseKind === 'game') return;
    const waiters = settleWaitersRef.current;
    settleWaitersRef.current = [];
    for (const resolve of waiters) resolve();
  }, [phaseKind]);
  useEffect(
    () => () => {
      for (const resolve of settleWaitersRef.current) resolve();
      settleWaitersRef.current = [];
    },
    []
  );
  const waitForGameSettled = useCallback(
    () => new Promise<void>((resolve) => settleWaitersRef.current.push(resolve)),
    []
  );
  // The latest ceremony's full run (cover -> settle -> reveal), so the champion
  // celebration can anchor its beats to the reveal actually completing. Resolved (or
  // absent) for every non-ceremony path, where the summary arrives from a plain tap.
  const ceremonyRevealedRef = useRef<Promise<void> | null>(null);
  const runCeremony = useCallback(
    (config: WipeConfig, action: () => void | Promise<void>) => {
      ceremonyRevealedRef.current = nav.ceremony(config, action);
    },
    [nav]
  );
  const waitForCeremonyReveal = useCallback(
    () => ceremonyRevealedRef.current ?? Promise.resolve(),
    []
  );

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
          difficulty={model.difficulty}
          ladderClass={model.ladderClass}
          timeouts={model.secondChancesRemaining}
          wins={model.wins}
          bagCount={model.bag.length}
          onChoose={actions.chooseNode}
          onLeave={goMenu}
          onOpenLineup={actions.openLineupBuilder}
          onOpenBag={actions.openBag}
        />
      );
    case 'draft':
      return (
        <DraftView
          available={model.phase.available}
          defaultStarters={model.phase.defaultStarters}
          defaultBench={model.phase.defaultBench}
          difficulty={model.difficulty}
          ladderClass={model.ladderClass}
          replacesSavedRun={savedRun !== null}
          onConfirm={actions.confirmDraft}
          onCancel={goMenu}
        />
      );
    case 'dropForRecruit':
      return (
        <DropForRecruitView
          incoming={model.phase.incoming}
          roster={model.core.roster}
          collectProgress={collectProgress}
          onDrop={actions.dropForRecruit}
          onSkip={actions.backToMap}
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
          five={model.core.roster.starters}
          banishesLeft={MAX_BANISHES - model.banishedBoosts.length}
          onDraft={actions.draftBoost}
          onDrop={actions.dropBoostForNew}
          onSkip={actions.skipBoostDraft}
          onBanish={actions.banishBoost}
        />
      );
    case 'boost':
      return (
        <BoostNodeView
          stock={model.phase.stock}
          roster={model.core.roster}
          onTake={actions.takeBoostItem}
          onKeepInBag={actions.addToBag}
          onLeave={actions.leaveBoost}
        />
      );
    case 'itemDrop': {
      const drop = model.phase.drop;
      return (
        <ItemDropView
          drop={drop}
          roster={model.core.roster}
          onTake={actions.takeDrop}
          onAddToBag={() => actions.addToBag(drop.id)}
          onSkip={actions.skipDrop}
        />
      );
    }
    case 'legendReveal':
      return (
        <LegendRevealView
          offer={model.phase.offer}
          onScout={actions.scoutLegend}
          onDecline={actions.declineLegend}
        />
      );
    case 'legendSign':
      // Boss Legend Signing: the beaten franchise's headliner wants in. Same jackpot
      // reveal as the recruit-node legend, with the signing's own copy.
      return (
        <LegendRevealView
          offer={model.phase.offer}
          onScout={actions.acceptLegendSign}
          onDecline={actions.declineLegendSign}
          kicker="THE BEATEN LEGEND WANTS IN"
          loanNote="Impressed by the win. On loan: keep them by clearing the run."
          signLabel="SIGN THE LEGEND"
        />
      );
    case 'pregame':
      return (
        <Pregame
          model={model}
          actions={actions}
          onCeremony={runCeremony}
          awaitSkipSettled={autoSkipGames ? waitForGameSettled : undefined}
        />
      );
    case 'game':
      if (!model.game) return null;
      // Auto-skip jumps past the watched play-by-play straight to the result:
      // skipToResult composes finishReplay + resolveGameResult in ONE dispatch, so a
      // skipped win costs one commit (game -> map/summary) instead of parading a
      // second AutoAdvance through postgame. A loss stops at postgame below.
      return autoSkipGames ? (
        <AutoAdvance key="advance-from-game" onAdvance={actions.skipToResult} />
      ) : (
        <PlayByPlayFeed
          timeline={model.game.result.events}
          homeTeam={model.game.home}
          awayTeam={model.game.away}
          arenaTier={arenaTierFor(
            model.core.map.nodes[model.phase.nodeId],
            model.core.currentMapIndex,
            TOTAL_MAPS
          )}
          onComplete={actions.finishReplay}
        />
      );
    case 'postgame':
      // A won postgame is unreachable with auto-skip on (skipToResult never lands on
      // one, the auto-save skips game/postgame so no resume enters them, and settings
      // cannot change mid-run), so this phase always shows the full result: on a
      // loss/timeout the "RUN IT BACK" decision is kept, skip or no skip.
      return <Postgame model={model} onContinue={actions.resolveGameResult} />;
    case 'recruit':
      return (
        <RecruitView
          offers={model.phase.offers}
          rerolled={model.phase.rerolled}
          benchCount={model.core.roster.bench.length}
          collectProgress={collectProgress}
          copiesMul={model.mods.copiesMul}
          onRecruit={actions.recruit}
          onReroll={actions.rerollRecruit}
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
          bagCount={model.bag.length}
          coachName={getCoach(model.coachId).name}
          onCoachSet={(roster) => coachReorderRoster(model, roster)}
          onConfirm={actions.setLineup}
          onCancel={actions.cancelLineup}
          onOpenBag={(starters, bench) => {
            // Commit the current order first, then open the bag (lossless).
            actions.setLineup(starters, bench);
            actions.openBag();
          }}
        />
      );
    case 'bag':
      return (
        <BagView
          bag={model.bag}
          roster={model.core.roster}
          onEquip={actions.equipFromBag}
          onUnequip={actions.unequipToBag}
          onDone={actions.leaveBag}
        />
      );
    case 'summary': {
      const champion = model.phase.champion;
      const unlockedClass =
        champion && model.atFrontier && model.ladderClass !== 'S+'
          ? classAboveLadder(model.ladderClass)
          : undefined;
      const wonCoaches = champion ? wonCoachIds.map(getCoach) : [];
      const unlockedPlayers = champion ? wonPlayers.unlocked : [];
      // On a loss these carry the milestone bank (empty on an ordinary loss): a banked
      // copy that only progressed rides the strip; one that OWNED outright (C/B own at
      // one copy) shows as the "stays in touch" recruit.
      const progressed = wonPlayers.progressed;
      const bankedRecruit = !champion ? wonPlayers.unlocked[0] : undefined;
      const bounty = champion ? bountyGrant : null;
      // Reveal order after the celebration: the headline BOUNTY first (the "harder difficulty
      // paid off" moment), then scouted (unlocked) players, then the climactic coach unlock,
      // then out. Each reveal's exits carry into the next applicable one.
      const toPlayerReveal = () => setShowPlayerReveal(true);
      const toCoachReveal = () => setShowCoachReveal(true);
      const afterPlayers = (exit: () => void) => (wonCoaches.length > 0 ? toCoachReveal : exit);
      const afterBounty = (exit: () => void) =>
        unlockedPlayers.length > 0 ? toPlayerReveal : wonCoaches.length > 0 ? toCoachReveal : exit;

      if (showBountyReveal && !showPlayerReveal && !showCoachReveal && bounty) {
        return (
          <BountyRewardView
            grant={bounty}
            onNewRun={afterBounty(actions.newRun)}
            onHome={afterBounty(goMenu)}
          />
        );
      }
      if (showPlayerReveal && !showCoachReveal && unlockedPlayers.length > 0) {
        return (
          <PlayerScoutedView
            players={unlockedPlayers}
            onNewRun={afterPlayers(actions.newRun)}
            onHome={afterPlayers(goMenu)}
          />
        );
      }
      if (showCoachReveal && wonCoaches.length > 0) {
        return (
          <CoachUnlockView
            coaches={wonCoaches}
            equippedId={equippedCoachId ?? ''}
            onEquip={actions.equipCoach}
            onNewRun={actions.newRun}
            onHome={goMenu}
          />
        );
      }
      // From the celebration, exits lead INTO the first applicable reveal (bounty,
      // players, coaches). Routed at TAP time from the settled outputs: the champion
      // settle is deferred off the celebration's commit frame, so a render-baked
      // closure could be looking at pre-settle (empty) grants; ensureSettled() lands
      // it synchronously if the deferred task has not run yet and returns what it
      // banked. By the reveal screens themselves the context has caught up, so their
      // chained exits keep reading render props as before.
      const exitVia = (leave: () => void) => () => {
        const settled = actions.ensureSettled();
        const grants = settled
          ? {
              bounty: champion ? settled.bounty : null,
              unlocked: champion ? settled.acquisitions.unlocked : [],
              coachCount: champion ? settled.wonCoachIds.length : 0,
            }
          : { bounty, unlocked: unlockedPlayers, coachCount: wonCoaches.length };
        if (grants.bounty) setShowBountyReveal(true);
        else if (grants.unlocked.length > 0) toPlayerReveal();
        else if (grants.coachCount > 0) toCoachReveal();
        else leave();
      };
      const exitHome = exitVia(goMenu);
      const exitNewRun = exitVia(actions.newRun);
      // A won ladder gets the full champion celebration (it needs the final game's
      // score and five). Losses, and the defensive champion-without-game case, fall
      // back to the flat summary.
      if (champion && model.game) {
        // The victory step-up: pitch the next difficulty at the confidence peak, with
        // its concrete perk delta. Reveals still run first on Home/New Run exits; the
        // step-up is a direct "one more run, one rung up".
        const nextDifficulty = DIFFICULTIES[DIFFICULTIES.indexOf(model.difficulty) + 1];
        const stepUp = nextDifficulty
          ? {
              label: `RUN IT BACK ON ${DIFFICULTY_LABELS[nextDifficulty].name}`,
              perks: difficultyPerks(nextDifficulty, model.ladderClass).slice(0, 3).join(' · '),
              onPress: () => actions.stepUpRun(nextDifficulty),
            }
          : undefined;
        return (
          <ChampionView
            game={model.game}
            difficulty={model.difficulty}
            ladderClass={model.ladderClass}
            wins={model.wins}
            unlockedClass={unlockedClass}
            progressed={progressed}
            favorRows={favorRows}
            coinsBanked={model.core.rewards.coins}
            stepUp={stepUp}
            dailyGrants={dailyGrants}
            waitForReveal={waitForCeremonyReveal}
            onNewRun={exitNewRun}
            onHome={exitHome}
          />
        );
      }
      // A close loss reads as "so close" (drives the retry); a loss AT the frontier shows
      // exactly what one clear would have unlocked. Both are pure framing, no reward attached.
      const lossMargin =
        !champion && model.game
          ? model.game.result.finalAway - model.game.result.finalHome
          : undefined;
      const lossClock = !champion && model.game ? lastEventClock(model.game.result) : undefined;
      const nextUnlockLabel =
        !champion && model.atFrontier && model.ladderClass !== 'S+'
          ? classAboveLadder(model.ladderClass)
          : undefined;
      return (
        <RunSummaryView
          champion={champion}
          wins={model.wins}
          difficulty={model.difficulty}
          ladderClass={model.ladderClass}
          mapsCleared={model.core.currentMapIndex}
          totalMaps={TOTAL_MAPS}
          coinsBanked={model.core.rewards.coins}
          unlockedClass={unlockedClass}
          progressed={progressed}
          favorRows={favorRows}
          lossMargin={lossMargin}
          lossClock={lossClock}
          nextUnlockLabel={nextUnlockLabel}
          bankedRecruit={bankedRecruit}
          dailyGrants={dailyGrants}
          onNewRun={exitNewRun}
          onMenu={exitHome}
        />
      );
    }
  }
}

/** The trimmed game clock of the last sim event (e.g. "0:48" from "Q4 0:48"), for the
 * near-miss "lost with M:SS left" framing. Empty when the game emitted no events. */
function lastEventClock(result: SimResult): string {
  const last = result.events[result.events.length - 1];
  if (!last) return '';
  const parts = last.clock.split(' ');
  return parts[parts.length - 1];
}

function Pregame({
  model,
  actions,
  onCeremony,
  awaitSkipSettled,
}: {
  model: RunModel;
  actions: RunActions;
  /** Runs the stake-themed tip-off wipe (RunScreen tracks its reveal for the
   * champion celebration's anchoring). */
  onCeremony: (config: WipeConfig, action: () => void | Promise<void>) => void;
  /** With auto-skip on: the "phase left 'game'" settlement promise, so the ceremony
   * cover holds through the skip cascade to the commit the player will actually see. */
  awaitSkipSettled?: () => Promise<void>;
}) {
  const [recDismissed, setRecDismissed] = useState(false);
  const nodeId = model.phase.kind === 'pregame' ? model.phase.nodeId : '';
  const timeoutUsed = model.phase.kind === 'pregame' && model.phase.timeoutUsed;
  const coachRec =
    model.phase.kind === 'pregame' ? model.phase.coachRec : undefined;
  // The away board scouts the opponent the run will field. The home board shows the
  // player's chosen five in their own slots, with an injured starter marked OUT in
  // place rather than silently swapped; the healthy sub who dresses for them in the
  // sim is named under the five. Synergy comes from `home` (the five that actually
  // dress), so the preview still never lies about the matchup. All memoized on what
  // the builders actually read, so local state (banner dismissal) and phase-only
  // dispatches (the coach scout landing) never rebuild two full teams mid-render.
  const home = useMemo(
    () => buildHomeTeam(model),
    // buildHomeTeam reads the roster (core), the coach, boosts, and the win counters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model.core, model.coachId, model.boosts, model.wins, model.forgivenLosses]
  );
  const away = useMemo(
    () => buildOpponentTeam(model.core, nodeId, model.mods),
    [model.core, nodeId, model.mods]
  );
  const chosen = model.core.roster.starters;
  const steppingIn = useMemo(() => steppingInSubs(model.core.roster), [model.core.roster]);
  const awayIdentity = useMemo(() => deriveTeamIdentity(away), [away]);
  const homeIdentity = useMemo(() => deriveTeamIdentity(home), [home]);
  // Peak games tip off through a stake-themed ceremony wipe; routine games keep
  // the instant cut. The contrast IS the escalation (3-4 wipes per run at most).
  // The tier is the same derivation the watch uses for its apron crowd.
  const node = model.core.map.nodes[nodeId];
  const tier = arenaTierFor(node, model.core.currentMapIndex, TOTAL_MAPS);
  const stakes =
    tier === 'championship'
      ? { color: palette.gold, label: 'CHAMPIONSHIP' }
      : tier === 'boss'
        ? { color: away.colorHex, label: 'BOSS GAME' }
        : tier === 'elite'
          ? { color: palette.flame, label: 'ELITE GAME' }
          : null;
  const tipOff = () => {
    sfx.tipoff();
    if (stakes) {
      onCeremony(
        { variant: 'run', color: stakes.color, label: stakes.label, direction: 'forward' },
        () => {
          actions.enterGame();
          // With auto-skip on, enterGame is only the first commit of a cascade;
          // returning the settlement promise holds the cover to the real destination.
          return awaitSkipSettled?.();
        }
      );
    } else {
      actions.enterGame();
    }
  };
  return (
    <Screen scroll contentContainerStyle={styles.pregame}>
      {timeoutUsed ? (
        <View style={styles.timeoutBanner}>
          <View style={styles.timeoutBannerTitleRow}>
            <ClockIcon size={12} color={palette.gold} />
            <Text style={styles.timeoutBannerTitle}>TIMEOUT</Text>
          </View>
          <Text style={styles.timeoutBannerBody}>
            That one's forgiven. Reset your five and run it back.{' '}
            {model.secondChancesRemaining} left.
          </Text>
        </View>
      ) : null}
      <Text style={styles.section}>SCOUTING REPORT</Text>
      <View style={styles.scoutHeader}>
        <View style={[styles.swatch, { backgroundColor: away.colorHex }]} />
        <Text style={styles.oppName} numberOfLines={1}>
          {away.name}
        </Text>
      </View>
      <TeamIdentityCard
        identity={awayIdentity}
        accentHex={away.colorHex}
        coachName={coachForTeamName(away.name).name}
      />
      <LineupBoard team={away} dense />
      <MatchupHeadline home={home} away={away} />
      <Text style={styles.section}>YOUR FIVE</Text>
      <TeamIdentityCard
        identity={homeIdentity}
        accentHex={home.colorHex}
        coachName={getCoach(model.coachId).name}
      />
      <LineupBoard
        team={home}
        players={chosen}
        condition
        steppingIn={steppingIn}
        dense
      />
      {coachRec && !recDismissed ? (
        // The scout computes off the tap and lands a beat after the screen appears
        // (see useRun), so the banner pops on arrival: the coach speaking up.
        <Pop popOnMount>
          <CoachRecBanner
            coach={getCoach(model.coachId)}
            rec={coachRec}
            onAccept={actions.acceptCoachRec}
            onDismiss={() => setRecDismissed(true)}
          />
        </Pop>
      ) : null}
      <Pressable onPress={actions.openLineupBuilder}>
        <Text style={styles.link}>Change Lineup</Text>
      </Pressable>
      {model.wins >= 2 ? (
        <View style={styles.streakRow}>
          {/* Static here by design (no idle hook on pregame); it breathes on the map. */}
          <StreakFlame streak={model.wins} paused />
          <Text style={styles.streakNote}>Protect the streak</Text>
        </View>
      ) : null}
      {/* One-shot: the auto-sim surprise ("am I supposed to tap?") is defused
          right above the button that starts the watch. */}
      <TeachCallout tip="watchDontTap" section="watch" style={styles.teachPregame} />
      <Pressable style={[styles.button, styles.primary]} onPress={tipOff}>
        <Text style={styles.buttonText}>TIP OFF</Text>
      </Pressable>
    </Screen>
  );
}

function AutoAdvance({ onAdvance }: { onAdvance: () => void }) {
  // Fire the phase transition once on mount and show only a brief "FINAL..." beat, so
  // auto-skip never paints the watched game or the full postgame (the box score would
  // otherwise flash for a frame). The reducer's phase guard and the once-ref keep a
  // stray re-render from double-firing. If this ever grows a second call site again,
  // the sites MUST pass distinct `key`s: React would otherwise reuse one instance
  // across the phase change (same type, same position), `firedRef` would stay true,
  // and the run would freeze on "FINAL..." (learned the hard way with the old
  // game -> postgame pair, now composed into one skipToResult dispatch).
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    onAdvance();
  }, [onAdvance]);
  return (
    <View style={styles.center}>
      <Text style={styles.loading}>FINAL...</Text>
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
  // Default open so the box score is right there after a game; still collapsible
  // to put the win/loss headline and the retry one tap away.
  const [showBox, setShowBox] = useState(true);
  // Count the final score up from zero once on mount (Counter only tweens on a change).
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    setSettled(true);
  }, []);
  // The win's payout lands as its own beat AFTER the score settles: the coin
  // tally pops in and counts up with ticks, so every win visibly pays.
  const [showEarned, setShowEarned] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShowEarned(true), 700);
    return () => clearTimeout(timer);
  }, []);
  // Economy juice: the earned coins arc from the final score into the tally.
  // Decoration only: launched 120ms in so the last coin lands exactly at the
  // 700ms tally reveal (see CoinFly's timing contract; the showEarned timer
  // above stays the single source of truth). Endpoints measure off the
  // headline's own layout, so the flight tracks any layout change.
  const [flyFrom, setFlyFrom] = useState<{ x: number; y: number } | null>(null);
  const [flyTo, setFlyTo] = useState<{ x: number; y: number } | null>(null);
  const [flyTrigger, setFlyTrigger] = useState(0);
  const postgameWon = model.phase.kind === 'postgame' && model.phase.won;
  useEffect(() => {
    if (!postgameWon) return;
    const timer = setTimeout(() => setFlyTrigger(1), 120);
    return () => clearTimeout(timer);
  }, [postgameWon]);

  // Result sting once on mount (Postgame remounts per postgame phase, so the ref resets
  // between games; the guard only blocks a dev strict-mode double-invoke). A forgivable
  // timeout invites a replay, so it gets no defeat tone.
  const stingRef = useRef(false);
  const phase = model.phase;
  const chances = model.secondChancesRemaining;
  useEffect(() => {
    if (stingRef.current || phase.kind !== 'postgame') return;
    stingRef.current = true;
    if (phase.won) sfx.win();
    else if (chances <= 0) sfx.loss();
  }, [phase, chances]);
  if (model.phase.kind !== 'postgame' || !model.game) return null;
  const won = model.phase.won;
  const earned = pendingWinRewards(model);
  // Celebration scales with the haul: a boss payout lands the full beat (coin
  // settle + pop + success haptic), an elite the medium one, a routine win ticks.
  const earnedTier =
    earned?.nodeType === 'boss' ? 'large' : earned?.nodeType === 'elite' ? 'medium' : 'small';
  // A loss with timeouts left isn't the end: the headline + CTA invite a replay,
  // and onContinue (resolveGameResult) spends the timeout and returns to pregame.
  const canForgive = !won && model.secondChancesRemaining > 0;
  const headline = won ? 'WIN!' : canForgive ? 'TIMEOUT' : 'LOSS';
  const headlineColor = won
    ? palette.makeGreen
    : canForgive
      ? palette.gold
      : palette.missRed;
  const cta = won ? 'CONTINUE' : canForgive ? 'RUN IT BACK' : 'END RUN';
  const { result, home, away } = model.game;
  return (
    <Screen style={styles.postgame} bottomGap={space(6)}>
      <View style={styles.postgameHeadline}>
        <Pop popOnMount>
          <Text style={[styles.result, { color: headlineColor }]}>
            {headline}
          </Text>
        </Pop>
        <View
          onLayout={(e) => {
            const l = e.nativeEvent.layout;
            setFlyFrom({ x: l.x + l.width / 2, y: l.y + l.height / 2 });
          }}
        >
          <Text style={styles.score}>
            <Counter value={settled ? result.finalHome : 0} /> -{' '}
            <Counter value={settled ? result.finalAway : 0} />
          </Text>
        </View>
        <Text style={styles.vs}>@ {model.game.opponentName}</Text>
        {earned ? (
          <View
            style={styles.earnedRow}
            onLayout={(e) => {
              const l = e.nativeEvent.layout;
              setFlyTo({ x: l.x + l.width / 2, y: l.y + l.height / 2 });
            }}
          >
            {showEarned ? (
              <>
                <CoinIcon size={12} color={palette.gold} />
                <TickCounter
                  value={earned.coins}
                  from={0}
                  prefix="+"
                  tier={earnedTier}
                  style={styles.earnedCoins}
                />
                <Text style={styles.earnedExtra}>
                  +{earned.trainingPoints} TP · +{earned.reputation} REP
                </Text>
              </>
            ) : null}
          </View>
        ) : null}
        {canForgive ? (
          <Text style={styles.forgiveNote}>
            Dropped it, but you've got a timeout. Replay this game.{' '}
            {model.secondChancesRemaining} left.
          </Text>
        ) : null}
        {earned && earned.coins > 0 ? (
          // The first-coins beat waits behind the reward beats (win pop at
          // mount, coin fly, tally tick at 700ms): reward first, teach second.
          <TeachSlot tip="coinsEarned" section="bank" delayMs={1600} />
        ) : null}
        {won && earned && earned.coins > 0 && flyFrom && flyTo ? (
          <CoinFly from={flyFrom} to={flyTo} coins={earned.coins} trigger={flyTrigger} />
        ) : null}
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
        <Text style={styles.buttonText}>{cta}</Text>
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
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(2),
    marginTop: space(4),
  },
  streakNote: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
  },
  timeoutBanner: {
    marginTop: space(3),
    paddingVertical: space(2),
    paddingHorizontal: space(3),
    backgroundColor: palette.gold + '14',
    borderWidth: BORDER.thin,
    borderColor: palette.gold + '66',
    borderRadius: RADIUS.chip,
  },
  timeoutBannerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(1),
  },
  timeoutBannerTitle: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.small,
    color: palette.gold,
    textAlign: 'center',
  },
  timeoutBannerBody: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(1),
  },
  forgiveNote: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.gold,
    textAlign: 'center',
    marginTop: space(3),
    paddingHorizontal: space(4),
  },
  postgame: {
    alignItems: 'center',
    paddingHorizontal: space(5),
  },
  postgameHeadline: { alignItems: 'center', alignSelf: 'stretch' },
  teachPregame: { alignSelf: 'stretch', marginTop: space(4) },
  postgameBox: {
    flex: 1,
    alignSelf: 'stretch',
    marginTop: space(3),
  },
  section: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.gold,
    marginTop: space(4),
    marginBottom: space(1),
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
    marginTop: space(4),
    paddingVertical: space(3),
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
  // Fixed height whether or not the tally has popped in yet, so the payout beat
  // never shifts the layout under the player's thumb.
  earnedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    marginTop: space(3),
    height: space(5),
  },
  earnedCoins: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
    color: palette.gold,
  },
  earnedExtra: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
  },
});
