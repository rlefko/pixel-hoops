import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { Pop, LiveChip, StaggerIn, TickCounter } from '@/components/fx';
import { CollectionProgressStrip } from './CollectionProgressStrip';
import { DailyRewardStrip } from './DailyRewardStrip';
import { FavorStrip } from './FavorStrip';
import { CoinIcon } from './PixelIcons';
import { sfx, useIdle, useGlowPulse, HUB_IDLE_MS } from '@/feel';
import type { DailyGrants, FavorDelta, ProgressedCopy } from '@/game/home-roster';
import {
  DIFFICULTY_LABELS,
  type Difficulty,
  type LadderClass,
} from '@/game/difficulty-mode';
import type { PlayerClass } from '@/game/ratings';
import type { RosterPlayer } from '@/types/roster';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/** End-of-run summary. Coins were banked into the wallet as they were earned; a clear
 * also carries recruits home and advances the ladder. */

interface RunSummaryViewProps {
  champion: boolean;
  wins: number;
  difficulty: Difficulty;
  ladderClass: LadderClass;
  /** Maps cleared out of `totalMaps`: the endowed ladder bar ("look how far you got"). */
  mapsCleared?: number;
  totalMaps?: number;
  /** Coins this run banked into the wallet (already safe): the keep-tally beat. */
  coinsBanked?: number;
  /** The newly unlocked ladder class (shown as a reward when present). */
  unlockedClass?: PlayerClass;
  /** Players this run advanced a copy toward but did not unlock (compact progress strip). */
  progressed?: ProgressedCopy[];
  /** The favor this run's wins banked (win or lose): the "no run is wasted" strip. */
  favorRows?: FavorDelta[];
  /** On a loss: the final deficit, for the "so close" near-miss line (shown only when small). */
  lossMargin?: number;
  /** On a loss: the trimmed clock when the game ended (e.g. "0:48"). */
  lossClock?: string;
  /** On a loss at the frontier: the class one clear would have unlocked (a retry nudge). */
  nextUnlockLabel?: PlayerClass;
  /** On a milestone-banked hard/insane loss: the recruit whose banked copy OWNED them
   * outright (C/B own at one copy). A banked copy that only progressed shows through
   * `progressed` instead. */
  bankedRecruit?: RosterPlayer;
  /** Daily Layer grants this settle paid (on a loss, at most weekly-tier lines). */
  dailyGrants?: DailyGrants | null;
  onNewRun: () => void;
  onMenu: () => void;
}

/** A loss within this many points reads as a "so close" near-miss (a wider loss does not). */
const NEAR_MISS_MARGIN = 6;

// The "you keep" cascade: the banked-coin tally lands as its own beat, then the
// NEW RUN button starts breathing. Buttons stay live the whole time.
const KEEP_DELAY_MS = 500;
const NEW_RUN_GLOW_DELAY_MS = 1100;
const LADDER_PIP_STAGGER_MS = 80;

/** The endowed ladder bar: cleared maps as filled rungs cascading in, the NEXT rung
 * breathing gold ("one more map"). All rungs read filled on a championship. */
function LadderBar({
  cleared,
  total,
  paused,
}: {
  cleared: number;
  total: number;
  paused: boolean;
}) {
  const glow = useGlowPulse(900, { paused });
  return (
    <View style={styles.ladderRow}>
      {Array.from({ length: total }).map((_, i) => {
        if (i < cleared) {
          return (
            <StaggerIn key={i} index={i} stepMs={LADDER_PIP_STAGGER_MS} distancePx={4}>
              <View style={[styles.ladderPip, styles.ladderPipDone]} />
            </StaggerIn>
          );
        }
        if (i === cleared) {
          return <Animated.View key={i} style={[styles.ladderPip, styles.ladderPipNext, glow]} />;
        }
        return <View key={i} style={styles.ladderPip} />;
      })}
    </View>
  );
}

export function RunSummaryView({
  champion,
  wins,
  difficulty,
  ladderClass,
  mapsCleared,
  totalMaps,
  coinsBanked,
  unlockedClass,
  progressed = [],
  favorRows = [],
  lossMargin,
  lossClock,
  nextUnlockLabel,
  bankedRecruit,
  dailyGrants = null,
  onNewRun,
  onMenu,
}: RunSummaryViewProps) {
  // The milestone consolation: a deep hard/insane loss still banked one recruit copy.
  const bankedName = bankedRecruit?.player.name ?? (!champion ? progressed[0]?.player.player.name : undefined);
  // Quiet the unlock banner's reward glow once the player settles on this terminal
  // screen; the next touch wakes it. Mirrors the hub/run-map idle-pause.
  const { idle, bump } = useIdle(HUB_IDLE_MS);

  // The "you keep" sequence: the ladder bar reads immediately, the banked-coin
  // tally lands as its own beat, then NEW RUN starts breathing. Nothing gates
  // input; the buttons are live the whole time.
  const [showKeep, setShowKeep] = useState(false);
  const [glowNewRun, setGlowNewRun] = useState(false);
  useEffect(() => {
    const keepTimer = setTimeout(() => setShowKeep(true), KEEP_DELAY_MS);
    const glowTimer = setTimeout(() => setGlowNewRun(true), NEW_RUN_GLOW_DELAY_MS);
    return () => {
      clearTimeout(keepTimer);
      clearTimeout(glowTimer);
    };
  }, []);

  // Champion fanfare for the rare flat-fallback championship (a clear without a final
  // game, so ChampionView isn't shown). A loss already got its sting in Postgame, so
  // this stays silent there to avoid a double.
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current || !champion) return;
    firedRef.current = true;
    sfx.champion();
  }, [champion]);

  return (
    <Screen style={styles.container} onTouchStart={bump}>
      <Pop popOnMount>
        <Text
          style={[
            styles.title,
            { color: champion ? palette.gold : palette.ink },
          ]}
        >
          {champion ? 'CHAMPIONS!' : 'RUN OVER'}
        </Text>
      </Pop>
      <Text style={styles.body}>
        {DIFFICULTY_LABELS[difficulty].name} · {ladderClass} ladder · {wins}{' '}
        {wins === 1 ? 'win' : 'wins'}
      </Text>
      {mapsCleared != null && totalMaps != null && totalMaps > 0 ? (
        <LadderBar
          cleared={champion ? totalMaps : mapsCleared}
          total={totalMaps}
          paused={idle}
        />
      ) : null}
      {coinsBanked != null && coinsBanked > 0 ? (
        <View style={styles.keepRow}>
          {showKeep ? (
            <>
              <CoinIcon size={12} color={palette.gold} />
              <TickCounter
                value={coinsBanked}
                from={0}
                prefix="+"
                tier="medium"
                style={styles.keepValue}
              />
              <Text style={styles.keepLabel}>COINS BANKED</Text>
            </>
          ) : null}
        </View>
      ) : null}
      {unlockedClass ? (
        <LiveChip
          active
          color={palette.orange}
          paused={idle}
          style={styles.unlockWrap}
        >
          <Text style={styles.unlock}>{unlockedClass} LADDER UNLOCKED</Text>
        </LiveChip>
      ) : null}
      <Text style={[styles.note, !champion && styles.noteLost]}>
        {champion
          ? 'Recruits carried home.'
          : 'Run recruits lost. Your coins are safe.'}
      </Text>
      {!champion && lossMargin != null && lossMargin > 0 && lossMargin <= NEAR_MISS_MARGIN ? (
        <Pop popOnMount>
          <Text style={styles.nearMiss}>
            SO CLOSE: lost by {lossMargin}
            {lossClock ? ` with ${lossClock} left` : ''}.
          </Text>
        </Pop>
      ) : null}
      {!champion && nextUnlockLabel ? (
        <Text style={styles.nudge}>One clear from the {nextUnlockLabel} ladder.</Text>
      ) : null}
      {!champion && bankedName ? (
        <Pop popOnMount>
          <Text style={styles.banked}>
            HE STAYS IN TOUCH: {bankedName.toUpperCase()}
            {bankedRecruit ? ' JOINS THE COLLECTION' : ' +1 COPY BANKED'}
          </Text>
        </Pop>
      ) : null}
      <CollectionProgressStrip progressed={progressed} />
      <FavorStrip rows={favorRows} />
      <DailyRewardStrip grants={dailyGrants} />
      <LiveChip active={glowNewRun} color={palette.gold} paused={idle} style={styles.newRunWrap}>
        <Pressable style={[styles.button, styles.primary]} onPress={onNewRun}>
          <Text style={styles.buttonText}>NEW RUN</Text>
        </Pressable>
      </LiveChip>
      <Pressable onPress={onMenu}>
        <Text style={styles.menu}>Menu</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(6),
  },
  title: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h1,
    textAlign: 'center',
  },
  body: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.label,
    color: palette.inkDim,
    marginTop: space(4),
  },
  unlockWrap: { marginTop: space(3) },
  unlock: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
    color: palette.orange,
    textAlign: 'center',
  },
  note: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.makeGreenLt,
    marginTop: space(2),
    textAlign: 'center',
  },
  noteLost: { color: palette.missRedLt },
  nearMiss: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.small,
    color: palette.gold,
    textAlign: 'center',
    marginTop: space(3),
    paddingHorizontal: space(4),
  },
  nudge: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(2),
  },
  banked: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.small,
    color: palette.gold,
    textAlign: 'center',
    marginTop: space(3),
    paddingHorizontal: space(4),
  },
  ladderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
    marginTop: space(3),
  },
  ladderPip: {
    width: 10,
    height: 10,
    borderWidth: BORDER.thin,
    borderColor: palette.inkDim,
    borderRadius: RADIUS.none,
  },
  ladderPipDone: {
    borderColor: palette.gold,
    backgroundColor: palette.gold,
  },
  ladderPipNext: {
    borderColor: palette.gold,
  },
  // Fixed height whether or not the tally has popped in, so the beat never
  // shifts the buttons under the player's thumb.
  keepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    marginTop: space(3),
    height: space(5),
  },
  keepValue: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
    color: palette.gold,
  },
  keepLabel: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
  },
  newRunWrap: { marginTop: space(7) },
  button: {
    paddingVertical: space(4),
    paddingHorizontal: space(6),
    borderWidth: BORDER.chunk,
    borderColor: palette.gold,
    borderRadius: RADIUS.chip,
  },
  primary: { backgroundColor: palette.gold + '1A' },
  buttonText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.label,
    color: palette.gold,
  },
  menu: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(5),
  },
});
