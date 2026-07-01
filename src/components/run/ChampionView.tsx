import { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView, Dimensions } from 'react-native';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { Counter, FlashOverlay, ParticleBurst, ShakeView } from '@/components/fx';
import { LineupBoard } from '@/components/game/LineupBoard';
import { sfx } from '@/feel';
import { useRewardBurst } from './useRewardBurst';
import { LegendaryHalo } from './reward-fx';
import { CollectionProgressStrip } from './CollectionProgressStrip';
import { CrownIcon, VictoryTierIcon } from './PixelIcons';
import { buildHallOfFameEntry, type ChampionGame } from '@/game/hall-of-fame';
import { shareVictory } from '@/game/share';
import { victoryTier } from '@/game/victory-tier';
import { DIFFICULTY_LABELS, type Difficulty, type LadderClass } from '@/game/difficulty-mode';
import type { PlayerClass } from '@/game/ratings';
import type { ProgressedCopy } from '@/game/home-roster';
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
  onNewRun: () => void;
  onHome: () => void;
}

const CENTER_X = Dimensions.get('window').width / 2;
const SCORE_DELAY_MS = 260; // a short anticipation hold before the score climbs

export function ChampionView({
  game,
  difficulty,
  ladderClass,
  wins,
  unlockedClass,
  progressed = [],
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
  const [burst, setBurst] = useState(0);
  const [scoreShown, setScoreShown] = useState(0);

  // Mount celebration: the tier-scaled burst now, the score climb after a beat, and
  // a second confetti pop for legends so the rarest win lands twice.
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
      ? setTimeout(() => setBurst((n) => n + 1), 420)
      : undefined;
    return () => {
      clearTimeout(scoreTimer);
      clearTimeout(legendTimer);
    };
  }, [fire, tier.burst, tier.legend, game.result.finalHome]);

  return (
    <Screen style={styles.container} topGap={space(4)}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <ShakeView ref={shakeRef} style={styles.hero}>
          <CrownIcon size={48} color={palette.gold} />
          <Text style={styles.title}>CHAMPIONS!</Text>
          <View style={styles.stampWrap}>
            <LegendaryHalo visible={tier.legend} />
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
          {unlockedClass ? (
            <Text style={styles.unlock}>{unlockedClass} LADDER UNLOCKED</Text>
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
  unlock: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
    color: palette.orange,
    textAlign: 'center',
    marginTop: space(3),
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
