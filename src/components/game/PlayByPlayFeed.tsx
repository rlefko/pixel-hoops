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
import { haptics } from '@/feel';
import { palette, FONT, FONT_SIZE, space, BORDER, RADIUS } from '@/theme';
import type { SimEvent } from '@/types/sim';
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

/** Gap before the next event: big plays linger, makes pause, misses fly by. */
function gapFor(e: SimEvent): number {
  if (e.isBigPlay) return 460;
  if (e.result === 'score' || e.result === 'and-one') return 280;
  return 150;
}

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
  const [cursor, setCursor] = useState(-1);
  const [skipped, setSkipped] = useState(false);
  const shakeRef = useRef<ShakeViewHandle>(null);
  const flashRef = useRef<FlashOverlayHandle>(null);
  const completedRef = useRef(false);

  const current = cursor >= 0 ? timeline[cursor] : null;
  const homeScore = current ? current.homeScore : 0;
  const awayScore = current ? current.awayScore : 0;

  const applyJuice = useCallback((e: SimEvent) => {
    if (e.isBigPlay) {
      shakeRef.current?.shake(e.action === 'dunk' ? 'heavy' : 'medium');
      flashRef.current?.flash(colorForEvent(e));
      haptics.bigPlay();
    } else if (e.result === 'score' || e.result === 'and-one') {
      haptics.selection();
    }
  }, []);

  // Scheduler: reveal the next event after an event-weighted delay. Assumes a
  // non-empty timeline (simulateGame always emits events).
  useEffect(() => {
    if (skipped || timeline.length === 0 || cursor >= timeline.length - 1)
      return;
    const nextIdx = cursor + 1;
    const next = timeline[nextIdx];
    const timer = setTimeout(() => {
      applyJuice(next);
      setCursor(nextIdx);
    }, gapFor(next));
    return () => clearTimeout(timer);
  }, [cursor, timeline, skipped, applyJuice]);

  // Fire onComplete exactly once when the timeline finishes.
  useEffect(() => {
    if (
      !completedRef.current &&
      timeline.length > 0 &&
      cursor >= timeline.length - 1
    ) {
      completedRef.current = true;
      onComplete();
    }
  }, [cursor, timeline, onComplete]);

  const skip = useCallback(() => {
    setSkipped(true);
    // Still land the final beat (usually the game-winner) so the skip pays off.
    const last = timeline[timeline.length - 1];
    if (last) applyJuice(last);
    setCursor(timeline.length - 1);
  }, [timeline, applyJuice]);

  const start = Math.max(0, cursor - VISIBLE_ROWS + 1);
  const rows = cursor >= 0 ? timeline.slice(start, cursor + 1) : [];
  const bigCallout = current?.isBigPlay ? current.callout : undefined;

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
        <CourtView homeTeam={homeTeam} awayTeam={awayTeam} current={current} />
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
            color={current ? colorForEvent(current) : palette.gold}
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
