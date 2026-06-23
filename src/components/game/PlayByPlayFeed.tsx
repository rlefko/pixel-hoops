import { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from '@/components/StyledText';
import {
  ShakeView,
  type ShakeViewHandle,
  FlashOverlay,
  type FlashOverlayHandle,
  Scanlines,
  Counter,
  Callout,
} from '@/components/fx';
import { CourtView } from '@/components/game/CourtView';
import { eventGapMs } from '@/components/game/possession';
import { haptics, useFeelSettings } from '@/feel';
import { palette, FONT, FONT_SIZE, space, BORDER, RADIUS } from '@/theme';
import { isMadeShot, type SimEvent } from '@/types/sim';
import type { Team } from '@/types/team';

/**
 * The "watch the sim" centerpiece. Replays a precomputed SimEvent timeline at a
 * snappy, event-weighted cadence: misses blow by, makes land, big plays shake
 * the court, flash, buzz, and pop an arcade callout. Skippable at any time
 * (honors the instant-restart pillar).
 */

const VISIBLE_ROWS = 3;

function colorForEvent(e: SimEvent): string {
  if (e.result === 'and-one') return palette.gold;
  if (e.result === 'block' || e.result === 'steal') return palette.steelBlue;
  if (e.result === 'score')
    return e.action === 'three' ? palette.gold : palette.makeGreen;
  return palette.missRed;
}

const isWinner = (e: SimEvent): boolean => e.callout === 'BUZZER BEATER!';

interface PlayByPlayFeedProps {
  timeline: SimEvent[];
  homeTeam: Team;
  awayTeam: Team;
  round: number;
  totalRounds: number;
  onComplete: () => void;
}

export function PlayByPlayFeed({
  timeline,
  homeTeam,
  awayTeam,
  round,
  totalRounds,
  onComplete,
}: PlayByPlayFeedProps) {
  const { reducedMotion } = useFeelSettings();
  const [cursor, setCursor] = useState(-1);
  const [skipped, setSkipped] = useState(false);
  // The most recently landed event drives the HUD score, callout, and feedback,
  // so the bucket counts and the celebration land *with* the ball, not when the
  // play is first revealed.
  const [landed, setLanded] = useState<SimEvent | null>(null);
  const shakeRef = useRef<ShakeViewHandle>(null);
  const flashRef = useRef<FlashOverlayHandle>(null);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const current = cursor >= 0 ? timeline[cursor] : null;
  const homeScore = landed ? landed.homeScore : 0;
  const awayScore = landed ? landed.awayScore : 0;

  // Outcome feedback, tiered so routine plays stay quiet and only special moments
  // pop. Fired when the ball reaches the rim (see CourtView onArrival).
  const applyOutcomeJuice = useCallback((e: SimEvent) => {
    if (e.result === 'block') {
      shakeRef.current?.shake('medium');
      haptics.medium();
      return;
    }
    if (e.result === 'steal') {
      shakeRef.current?.shake('light');
      haptics.light();
      return;
    }
    if (!isMadeShot(e)) return; // misses and turnovers: quiet

    if (isWinner(e)) {
      shakeRef.current?.shake('heavy');
      flashRef.current?.flash(palette.gold, { peak: 0.3 });
      haptics.bigPlay();
      return;
    }
    if (e.result === 'and-one') {
      shakeRef.current?.shake('light');
      flashRef.current?.flash(palette.gold, { peak: 0.22 });
      haptics.success();
      return;
    }
    if (e.action === 'three') {
      shakeRef.current?.shake('light');
      haptics.light();
      return;
    }
    if (e.action === 'dunk') {
      shakeRef.current?.shake('medium');
      haptics.medium();
      return;
    }
    if (e.isBigPlay) {
      // A clutch bucket (the sim flags it) earns a small bump over a routine make.
      shakeRef.current?.shake('light');
      haptics.medium();
      return;
    }
    haptics.selection(); // routine make: a clean tick, the net swish carries it
  }, []);

  const handleArrival = useCallback(
    (e: SimEvent) => {
      setLanded(e);
      applyOutcomeJuice(e);
    },
    [applyOutcomeJuice]
  );

  // Scheduler: reveal the next event after a possession-length delay so the ball
  // always lands before the next play. Assumes a non-empty timeline.
  useEffect(() => {
    if (skipped || timeline.length === 0 || cursor >= timeline.length - 1)
      return;
    const nextIdx = cursor + 1;
    const next = timeline[nextIdx];
    const timer = setTimeout(() => setCursor(nextIdx), eventGapMs(next, reducedMotion));
    return () => clearTimeout(timer);
  }, [cursor, timeline, skipped, reducedMotion]);

  // Fire onComplete once the timeline finishes, after the final ball has had time
  // to land and celebrate (so the game-winner isn't cut off by the transition).
  // Keyed on cursor/timeline only; the latest onComplete is read through a ref so
  // a re-render mid-beat can't clear the pending timer.
  useEffect(() => {
    if (completedRef.current || timeline.length === 0 || cursor < timeline.length - 1)
      return;
    completedRef.current = true;
    const last = timeline[timeline.length - 1];
    const timer = setTimeout(
      () => onCompleteRef.current(),
      eventGapMs(last, reducedMotion)
    );
    return () => clearTimeout(timer);
  }, [cursor, timeline, reducedMotion]);

  const skip = useCallback(() => {
    // Jump to the final beat; its ball still arcs and lands the payoff via
    // onArrival (the game-winner), so the skip pays off.
    setSkipped(true);
    setCursor(timeline.length - 1);
  }, [timeline]);

  const start = Math.max(0, cursor - VISIBLE_ROWS + 1);
  const rows = cursor >= 0 ? timeline.slice(start, cursor + 1) : [];
  const bigCallout = landed?.isBigPlay ? landed.callout : undefined;

  return (
    <View style={styles.wrap}>
      <View style={styles.hud}>
        <Text style={styles.round}>
          ROUND {round}/{totalRounds}
        </Text>
        <View style={styles.scoreRow}>
          <View style={styles.teamCol}>
            <Text
              style={[styles.team, { color: homeTeam.colorHex }]}
              numberOfLines={1}
            >
              {homeTeam.name}
            </Text>
            <View style={[styles.teamBar, { backgroundColor: homeTeam.accentHex }]} />
          </View>
          <Counter value={homeScore} style={styles.score} />
          <Text style={styles.dash}>-</Text>
          <Counter value={awayScore} style={styles.score} />
          <View style={styles.teamCol}>
            <Text
              style={[styles.team, { color: awayTeam.colorHex }]}
              numberOfLines={1}
            >
              {awayTeam.name}
            </Text>
            <View style={[styles.teamBar, { backgroundColor: awayTeam.accentHex }]} />
          </View>
        </View>
      </View>

      <ShakeView ref={shakeRef} style={styles.courtWrap}>
        <CourtView
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          current={current}
          onArrival={handleArrival}
        />
        <View style={styles.feed}>
          {rows.map((e) => (
            <Text
              key={e.seq}
              style={[
                styles.feedLine,
                {
                  color:
                    e.team === 'home' ? palette.makeGreenLt : palette.missRedLt,
                  opacity: e === current ? 1 : 0.45,
                },
              ]}
              numberOfLines={1}
            >
              {e.clock} {e.text}
            </Text>
          ))}
        </View>
        {bigCallout ? (
          <Callout
            text={bigCallout}
            color={landed ? colorForEvent(landed) : palette.gold}
            style={styles.callout}
          />
        ) : null}
        <Scanlines />
        <FlashOverlay ref={flashRef} />
      </ShakeView>

      <Pressable style={styles.skip} onPress={skip} disabled={skipped}>
        <Text style={styles.skipText}>
          {skipped ? 'FINISHING...' : 'TAP TO SKIP >>'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  hud: {
    paddingHorizontal: space(3),
    paddingVertical: space(2),
    alignItems: 'center',
  },
  round: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
    marginBottom: space(2),
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teamCol: {
    maxWidth: 96,
    alignItems: 'center',
  },
  team: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
  },
  teamBar: {
    alignSelf: 'stretch',
    height: 2,
    marginTop: space(0.5),
    borderRadius: RADIUS.chip,
  },
  score: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h2,
    color: palette.ink,
    marginHorizontal: space(2),
  },
  dash: {
    fontSize: FONT_SIZE.h3,
    color: palette.inkDim,
  },
  courtWrap: {
    flex: 1,
    margin: space(3),
    overflow: 'hidden',
    borderRadius: RADIUS.chip,
  },
  feed: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    padding: space(3),
  },
  feedLine: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    marginTop: space(1),
    // Keep the ticker legible where it overlaps the sprites on the floor.
    textShadowColor: palette.bgPanel,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  callout: {
    position: 'absolute',
    top: '38%',
    left: 0,
    right: 0,
  },
  skip: {
    paddingVertical: space(3),
    alignItems: 'center',
    borderTopWidth: BORDER.thin,
    borderTopColor: palette.bgPanel,
  },
  skipText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.gold,
  },
});
