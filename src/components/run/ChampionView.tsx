import { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView, Dimensions } from 'react-native';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { Counter, FlashOverlay, ParticleBurst, Pop, ShakeView, TickCounter } from '@/components/fx';
import { LineupBoard } from '@/components/game/LineupBoard';
import { haptics, sfx, useIdle, HUB_IDLE_MS } from '@/feel';
import { useRewardBurst } from './useRewardBurst';
import { LegendaryHalo } from './reward-fx';
import { CollectionProgressStrip } from './CollectionProgressStrip';
import { DailyRewardStrip } from './DailyRewardStrip';
import { FavorStrip } from './FavorStrip';
import { CoinIcon, CrownIcon, VictoryTierIcon } from './PixelIcons';
import { buildHallOfFameEntry, type ChampionGame } from '@/game/hall-of-fame';
import { shareVictory } from '@/game/share';
import { victoryTier } from '@/game/victory-tier';
import { DIFFICULTY_LABELS, type Difficulty, type LadderClass } from '@/game/difficulty-mode';
import type { PlayerClass } from '@/game/ratings';
import type { DailyGrants, FavorDelta, ProgressedCopy } from '@/game/home-roster';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * The championship celebration: the payoff beat for winning a ladder. It lands a
 * rarity-scaled burst (confetti + shake + flash + haptic, all via useRewardBurst,
 * all louder for harder wins), counts the final score up, and shows the five who
 * closed it out with their synergies. Beats stay sub-second and every channel
 * no-ops under reduced motion. Share the run or head Home; a quick New Run is one
 * tap away for "one more run." Shown by RunScreen only on a champion summary.
 */

interface ChampionViewProps {
  game: ChampionGame;
  difficulty: Difficulty;
  ladderClass: LadderClass;
  wins: number;
  /** The newly unlocked ladder class (shown as a reward when present). */
  unlockedClass?: PlayerClass;
  /** Players this run advanced a copy toward but did not unlock (compact progress strip). */
  progressed?: ProgressedCopy[];
  /** The favor this run's wins banked (the directed-chase strip). */
  favorRows?: FavorDelta[];
  /** Coins the run banked (including the clear bonus): the haul tally beat. */
  coinsBanked?: number;
  /** The victory step-up: run it back one difficulty up, pitched at the confidence
   * peak. Absent on insane (nothing above it). */
  stepUp?: { label: string; perks: string; onPress: () => void };
  /** Daily Layer grants this settle paid (ledger lines, never a reveal screen). */
  dailyGrants?: DailyGrants | null;
  onNewRun: () => void;
  onHome: () => void;
}

const CENTER_X = Dimensions.get('window').width / 2;
// The celebration cascade: burst on mount, then each beat lands on its own.
const SCORE_DELAY_MS = 260; // a short anticipation hold before the score climbs
const LEGEND_BURST_DELAY_MS = 420; // the second confetti pop on a legend win
const HAUL_DELAY_MS = 700; // the coin haul counts in after the score settles
const UNLOCK_DELAY_MS = 1200; // a new ladder lands last, as its own beat

export function ChampionView({
  game,
  difficulty,
  ladderClass,
  wins,
  unlockedClass,
  progressed = [],
  favorRows = [],
  coinsBanked,
  stepUp,
  dailyGrants = null,
  onNewRun,
  onHome,
}: ChampionViewProps) {
  const tier = useMemo(() => victoryTier(difficulty, ladderClass), [difficulty, ladderClass]);
  // The entry the Share button reuses; ts is unused by the share text, so 0 is fine
  // here (the persisted copy carries the real timestamp). entry.starters are cleaned,
  // so PlayerCard renders the final-game power without double-applying training.
  const entry = useMemo(
    () => buildHallOfFameEntry(game, difficulty, ladderClass, wins, 0),
    [game, difficulty, ladderClass, wins]
  );

  const { shakeRef, flashRef, fire } = useRewardBurst();
  // Pause the legend win's gold halo once the player settles here; a touch wakes it.
  const { idle, bump } = useIdle(HUB_IDLE_MS);
  const [burst, setBurst] = useState(0);
  const [scoreShown, setScoreShown] = useState(0);
  const [haulShown, setHaulShown] = useState(false);
  const [unlockShown, setUnlockShown] = useState(false);

  // Mount celebration: the tier-scaled burst now, the score climb after a beat, a
  // second confetti pop for legends so the rarest win lands twice, then the coin
  // haul counts in, and a newly unlocked ladder lands last as its own rite-of-passage
  // beat (whoosh + orange flash + pop) instead of a buried text line.
  useEffect(() => {
    // Map the victory celebration tier onto the shared rarity-scaled burst (a
    // championship always lands at least rare-level juice). Silence the burst's own
    // reward sting and play the grand championship fanfare instead.
    fire(tier.burst === 'big' ? 'legendary' : tier.burst === 'medium' ? 'epic' : 'rare', {
      silent: true,
    });
    sfx.champion();
    setBurst((n) => n + 1);
    const scoreTimer = setTimeout(() => setScoreShown(game.result.finalHome), SCORE_DELAY_MS);
    const legendTimer = tier.legend
      ? setTimeout(() => setBurst((n) => n + 1), LEGEND_BURST_DELAY_MS)
      : undefined;
    const haulTimer = setTimeout(() => setHaulShown(true), HAUL_DELAY_MS);
    const unlockTimer = setTimeout(() => {
      setUnlockShown(true);
      if (!unlockedClass) return;
      sfx.whoosh('forward');
      flashRef.current?.flash(palette.orange, { peak: 0.2 });
      haptics.success();
    }, UNLOCK_DELAY_MS);
    return () => {
      clearTimeout(scoreTimer);
      clearTimeout(legendTimer);
      clearTimeout(haulTimer);
      clearTimeout(unlockTimer);
    };
  }, [fire, flashRef, tier.burst, tier.legend, game.result.finalHome, unlockedClass]);

  return (
    <Screen style={styles.container} topGap={space(4)} onTouchStart={bump}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <ShakeView ref={shakeRef} style={styles.hero}>
          <CrownIcon size={48} color={palette.gold} />
          <Text style={styles.title}>CHAMPIONS!</Text>
          <View style={styles.stampWrap}>
            <LegendaryHalo visible={tier.legend} paused={idle} />
            <View style={[styles.stamp, { borderColor: tier.color }]}>
              <VictoryTierIcon tier={tier.key} size={12} color={tier.color} />
              <Text style={[styles.stampText, { color: tier.color }]}>{tier.label}</Text>
            </View>
          </View>
          <Text style={styles.meta}>
            {DIFFICULTY_LABELS[difficulty].name} · {ladderClass} LADDER · {wins}{' '}
            {wins === 1 ? 'win' : 'wins'}
          </Text>
          <View style={styles.scoreRow}>
            <Counter value={scoreShown} style={styles.score} />
            <Text style={styles.score}> - {game.result.finalAway}</Text>
          </View>
          <Text style={styles.matchup} numberOfLines={1}>
            {game.home.name} def. {game.opponentName}
          </Text>
          {coinsBanked != null && coinsBanked > 0 ? (
            <View style={styles.haulRow}>
              {haulShown ? (
                <>
                  <CoinIcon size={12} color={palette.gold} />
                  <TickCounter
                    value={coinsBanked}
                    from={0}
                    prefix="+"
                    tier="large"
                    style={styles.haulValue}
                  />
                  <Text style={styles.haulLabel}>COINS BANKED</Text>
                </>
              ) : null}
            </View>
          ) : null}
          {unlockedClass ? (
            <View style={styles.unlockSlot}>
              {unlockShown ? (
                <Pop popOnMount>
                  <Text style={styles.unlock}>{unlockedClass} LADDER UNLOCKED</Text>
                </Pop>
              ) : null}
            </View>
          ) : null}
          <ParticleBurst
            origin={{ x: CENTER_X, y: 70 }}
            variant="confetti"
            color={tier.color}
            count={tier.confetti}
            trigger={burst}
          />
        </ShakeView>

        <Text style={styles.section}>YOUR CHAMPIONS</Text>
        <LineupBoard team={game.home} players={entry.starters} compact />

        <CollectionProgressStrip progressed={progressed} />
        <FavorStrip rows={favorRows} />
        <DailyRewardStrip grants={dailyGrants} />

        {stepUp ? (
          <Pressable style={[styles.button, styles.stepUp]} onPress={stepUp.onPress}>
            <Text style={styles.stepUpText}>{stepUp.label}</Text>
            <Text style={styles.stepUpPerks}>{stepUp.perks}</Text>
          </Pressable>
        ) : null}
        <Pressable style={[styles.button, styles.primary]} onPress={() => void shareVictory(entry)}>
          <Text style={styles.primaryText}>SHARE</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={onHome}>
          <Text style={styles.homeText}>HOME</Text>
        </Pressable>
        <Pressable onPress={onNewRun} hitSlop={space(2)}>
          <Text style={styles.newRun}>New Run</Text>
        </Pressable>
      </ScrollView>

      <FlashOverlay ref={flashRef} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space(5) },
  scroll: { alignSelf: 'stretch' },
  scrollContent: { alignItems: 'center', paddingBottom: space(6) },
  hero: { alignSelf: 'stretch', alignItems: 'center' },
  title: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h1,
    color: palette.gold,
    textAlign: 'center',
    marginTop: space(1),
  },
  stampWrap: { position: 'relative', marginTop: space(3) }, // anchors the legend win's gold halo
  stamp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1),
    paddingVertical: space(1),
    paddingHorizontal: space(3),
    borderWidth: BORDER.chunk,
    borderRadius: RADIUS.chip,
  },
  stampText: { fontFamily: FONT.display, fontSize: FONT_SIZE.small },
  meta: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.label,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(3),
  },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: space(4) },
  score: { fontFamily: FONT.display, fontSize: FONT_SIZE.h2, color: palette.ink },
  matchup: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(2),
  },
  // Fixed heights whether or not their beat has landed, so the staged reveals
  // never shift the layout under the player's thumb.
  haulRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    marginTop: space(3),
    height: space(5),
  },
  haulValue: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
    color: palette.gold,
  },
  haulLabel: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
  },
  unlockSlot: {
    marginTop: space(3),
    height: space(6),
    justifyContent: 'center',
  },
  unlock: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
    color: palette.orange,
    textAlign: 'center',
  },
  section: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.gold,
    alignSelf: 'flex-start',
    marginTop: space(6),
    marginBottom: space(1),
  },
  button: {
    marginTop: space(4),
    paddingVertical: space(3),
    paddingHorizontal: space(8),
    borderWidth: BORDER.chunk,
    borderColor: palette.gold,
    borderRadius: RADIUS.chip,
  },
  primary: { backgroundColor: palette.gold + '1A', marginTop: space(6) },
  stepUp: {
    marginTop: space(6),
    borderColor: palette.orange,
    backgroundColor: palette.orange + '1A',
    alignItems: 'center',
    gap: space(1),
  },
  stepUpText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.label,
    color: palette.orange,
    textAlign: 'center',
  },
  stepUpPerks: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
    textAlign: 'center',
  },
  primaryText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.label,
    color: palette.gold,
    textAlign: 'center',
  },
  homeText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
    color: palette.ink,
    textAlign: 'center',
  },
  newRun: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(4),
  },
});
