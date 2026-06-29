import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withDelay,
  cancelAnimation,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { Text } from '@/components/StyledText';
import {
  SvgCourt,
  PixelPlayer,
  Pop,
  BallFlight,
  RimRipple,
  ParticleBurst,
  type BurstVariant,
} from '@/components/fx';
import { jerseyNumber, skinIndexFor } from '@/components/game/jersey';
import { spotPercent, spotPx, rimCenterPx } from '@/components/game/courtGeometry';
import { COURT } from '@/components/game/courtDimensions';
import { idleBobFor, moveOffsetFor, roleFor, MOVE, DUNK } from '@/components/game/possession';
import { useFeelSettings, usePulse, scaled, SIM_SPEED_FACTOR } from '@/feel';
import { palette, FONT, FONT_SIZE } from '@/theme';
import { courtThemeFor } from '@/theme/courtTheme';
import { POSITIONS, type Position, type RosterPlayer } from '@/types/roster';
import { isMadeShot, type SimEvent, type SimTeamSide } from '@/types/sim';
import type { Team } from '@/types/team';

/**
 * The visual heart of the sim: ten procedural pixel players on the court, five
 * per side in a real formation. They breathe on the floor; the shooter drives or
 * rises and a defender contests; the ball arcs into a real hoop and the make or
 * miss flourish lands when it arrives. Sits behind the play-by-play ticker (see
 * PlayByPlayFeed).
 */

interface CourtViewProps {
  homeTeam: Team;
  awayTeam: Team;
  /** The play currently being shown, or null before tip-off. */
  current: SimEvent | null;
  /** `${side}-${position}` keys of players who are currently on fire. */
  hotKeys?: string[];
  /** Fired when the ball reaches the rim (synced make/miss feedback). */
  onArrival?: (e: SimEvent) => void;
}

/**
 * The player in a court slot. The slot is the lineup array index, NOT the
 * player's intrinsic position. Slot `i` (POSITIONS[i]) maps to the static
 * starter `players[i]`, but with in-game rotation the player on the floor there
 * changes, so when an event is in play we resolve the slot to whoever the sim
 * says is on the floor (by name, across starters and bench). This keeps the
 * highlighted scorer's sprite correct after a substitution; falls back to the
 * starter before tip-off or if the name is unknown.
 */
function playerAt(
  team: Team,
  position: Position,
  side: SimTeamSide,
  current: SimEvent | null,
  roster: Map<string, RosterPlayer>
): RosterPlayer | undefined {
  const starter = team.lineup.players[POSITIONS.indexOf(position)];
  const onCourtName = current?.onCourt[side]?.[position];
  if (!onCourtName) return starter;
  // Resolve through a prebuilt name -> player map (memoized once per team) rather
  // than rebuilding a combined starters+bench array on every sprite, every event.
  // Falls back to the starter before tip-off or on an unknown name.
  return roster.get(onCourtName) ?? starter;
}

/**
 * A name -> player lookup across a team's starters and bench, built once per team
 * and reused for every sprite/event. Starters win over the bench on the (not
 * expected) name clash, matching the prior first-match `.find` over the combined
 * `[...starters, ...bench]` list.
 */
function rosterByName(team: Team): Map<string, RosterPlayer> {
  const map = new Map<string, RosterPlayer>();
  // Bench first, then starters, so a starter overwrites the (not expected) name
  // clash and wins, matching the prior first-match `.find` over starters+bench.
  for (const rp of team.bench) map.set(rp.player.name, rp);
  for (const rp of team.lineup.players) map.set(rp.player.name, rp);
  return map;
}

interface Burst {
  origin: { x: number; y: number };
  variant: BurstVariant;
  count?: number;
  color?: string;
}

/**
 * The particle burst (if any) for a landed event, positioned in court px. Routine
 * makes stay quiet (a small team-tinted spark); confetti and debris are reserved
 * for threes, dunks, and-ones, and the game-winner.
 */
function burstFor(
  e: SimEvent | null,
  homeTeam: Team,
  awayTeam: Team,
  width: number,
  height: number
): Burst | null {
  if (!e || width === 0 || height === 0) return null;
  const side = e.team;
  const rim = rimCenterPx(side, width, height);
  if (e.result === 'block' || e.result === 'steal') {
    return {
      // The defender/ball is at the player's stable base, so pass null to match.
      origin: spotPx(side, e.scorerPosition, width, height, null),
      variant: 'cool',
      count: e.result === 'block' ? 6 : 5,
    };
  }
  if (!isMadeShot(e)) return null; // misses and turnovers: no burst
  if (e.callout === 'BUZZER BEATER!') {
    return { origin: rim, variant: 'confetti', count: 16 };
  }
  if (e.action === 'three' || e.result === 'and-one') {
    return { origin: rim, variant: 'confetti', count: 14 };
  }
  if (e.action === 'dunk') return { origin: rim, variant: 'debris', count: 14 };
  return {
    origin: rim,
    variant: 'spark',
    count: 5,
    color: side === 'home' ? homeTeam.colorHex : awayTeam.colorHex,
  };
}

/** Cumulative time fractions of the dunk beats, for interpolating the sequence. */
const DUNK_TOTAL = DUNK.gather + DUNK.leap + DUNK.slam + DUNK.hang + DUNK.recover;
const DUNK_KF = [
  0,
  DUNK.gather / DUNK_TOTAL,
  (DUNK.gather + DUNK.leap) / DUNK_TOTAL,
  (DUNK.gather + DUNK.leap + DUNK.slam) / DUNK_TOTAL,
  (DUNK.gather + DUNK.leap + DUNK.slam + DUNK.hang) / DUNK_TOTAL,
  1,
];

function SpriteAt({
  side,
  position,
  team,
  roster,
  current,
  width,
  height,
  hot,
}: {
  side: SimTeamSide;
  position: Position;
  team: Team;
  roster: Map<string, RosterPlayer>;
  current: SimEvent | null;
  width: number;
  height: number;
  hot: boolean;
}) {
  const { reducedMotion, simSpeed } = useFeelSettings();
  const speed = SIM_SPEED_FACTOR[simSpeed];
  const rp = playerAt(team, position, side, current, roster);

  const role = roleFor(current, side, position);
  const active =
    current != null && current.team === side && current.scorerPosition === position;
  const isDunker = role === 'dunker';
  const seq = current?.seq ?? -1;

  // Stable base: the floor holds a fixed defensive set and does NOT reposition
  // per possession (that read as jumpy). The ball flight and the active
  // shooter/driver/dunker carry the possession. Static percent placement avoids
  // a pre-layout jump.
  const { left, top } = spotPercent(side, position, null);

  // Idle breathe, detuned per sprite so the floor undulates instead of marching.
  const bob = useMemo(() => idleBobFor(side, position), [side, position]);
  const { bobStyle } = usePulse(bob.durationMs, {
    delayMs: bob.delayMs,
    bobAmplitude: bob.bobAmplitude,
  });

  // Possession motion: a driver steps to the rim, a defender leans in, a jumper
  // shooter rises. The dunker owns its own travel (below), so it skips this.
  const offset = useMemo(
    () => moveOffsetFor(current, side, position, width, height),
    [current, side, position, width, height]
  );
  const move = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion || isDunker || (offset.dx === 0 && offset.dy === 0)) {
      move.value = 0;
      return;
    }
    move.value = 0;
    move.value = withSequence(
      withTiming(1, { duration: scaled(MOVE.out, speed), easing: Easing.out(Easing.cubic) }),
      withDelay(
        scaled(MOVE.hold, speed),
        withTiming(0, { duration: scaled(MOVE.back, speed), easing: Easing.out(Easing.quad) })
      )
    );
  }, [seq, offset.dx, offset.dy, reducedMotion, isDunker, speed, move]);
  const moveStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offset.dx * move.value },
      { translateY: offset.dy * move.value },
    ],
  }));

  // The dunk: gather (squash), leap (stretch up toward the rim), slam (squash
  // down, the ball arrives), hang, recover. One progress value drives it all.
  const dunk = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion || !isDunker) {
      dunk.value = 0;
      return;
    }
    dunk.value = 0;
    dunk.value = withTiming(1, { duration: scaled(DUNK_TOTAL, speed), easing: Easing.linear });
    return () => cancelAnimation(dunk);
  }, [seq, isDunker, reducedMotion, speed, dunk]);
  const dunkStyle = useAnimatedStyle(() => {
    const p = dunk.value;
    // Values per beat: rest, gather (squash), leap (stretch up), slam (squash
    // down), hang, recover.
    const travel = interpolate(p, DUNK_KF, [0, 0.4, 1, 1, 1, 0]);
    const lift = interpolate(p, DUNK_KF, [0, 0, -DUNK.lift, 0, 0, 0]);
    const sx = interpolate(p, DUNK_KF, [1, 1.08, 0.88, 1.16, 1.1, 1]);
    const sy = interpolate(p, DUNK_KF, [1, 0.86, 1.22, 0.82, 0.88, 1]);
    return {
      transform: [
        { translateX: Math.round(offset.dx * travel) },
        { translateY: Math.round(offset.dy * travel + lift) },
        { scaleX: sx },
        { scaleY: sy },
      ],
    };
  });

  // On-fire aura: a flame glow behind a hot scorer (NBA Jam). Steady under reduced
  // motion. Paused (no loop) unless this sprite is actually hot, so the other nine
  // sprites don't run an unread shared-value loop every frame of the whole watch.
  const { glowStyle } = usePulse(560, { paused: !hot });

  if (!rp) return null;
  const inner = (
    <>
      {hot ? (
        <Animated.View pointerEvents="none" style={[styles.aura, glowStyle]} />
      ) : null}
      <PixelPlayer
        color={team.colorHex}
        accent={team.accentHex}
        number={rp.jerseyNumber ?? jerseyNumber(rp.player.name)}
        skinIndex={skinIndexFor(rp.player.name)}
        active={active}
      />
      {/* Under reduced motion the ball doesn't fly, so the active sprite holds it. */}
      {active && reducedMotion ? <View style={styles.ball} /> : null}
    </>
  );

  return (
    <View style={[styles.sprite, { left, top }]}>
      <Animated.View style={moveStyle}>
        <Animated.View style={bobStyle}>
          <Animated.View style={dunkStyle}>
            {isDunker ? (
              inner
            ) : (
              <Pop trigger={active ? current!.seq : `idle-${side}-${position}`}>
                {inner}
              </Pop>
            )}
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

export function CourtView({
  homeTeam,
  awayTeam,
  current,
  hotKeys = [],
  onArrival,
}: CourtViewProps) {
  // Every game is hosted in the opponent's arena, so the floor takes their colors.
  const theme = useMemo(
    () => courtThemeFor(awayTeam.colorHex, awayTeam.accentHex),
    [awayTeam.colorHex, awayTeam.accentHex]
  );

  // Name -> player lookups, built once per team so each sprite resolves its
  // on-court player without rebuilding a combined starters+bench array per event.
  const homeRoster = useMemo(() => rosterByName(homeTeam), [homeTeam]);
  const awayRoster = useMemo(() => rosterByName(awayTeam), [awayTeam]);

  // Aspect-lock the floor to the true 50:94 court inside the available space, so
  // feet map to pixels uniformly on both axes (circles stay round, and every
  // fractional player/ball coordinate lands on the drawn markings). The leftover
  // space reads as a dark out-of-bounds apron.
  const [avail, setAvail] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) =>
    setAvail({
      width: e.nativeEvent.layout.width,
      height: e.nativeEvent.layout.height,
    });
  const scale = Math.min(avail.width / COURT.width, avail.height / COURT.length);
  const size = { width: COURT.width * scale, height: COURT.length * scale };

  // The landed event: drives the rim flourish and particles so they fire when
  // the ball arrives, not when the play is first revealed.
  const [arrival, setArrival] = useState<SimEvent | null>(null);
  const handleArrival = useCallback(
    (e: SimEvent) => {
      setArrival(e);
      onArrival?.(e);
    },
    [onArrival]
  );

  const burst = useMemo(
    () => burstFor(arrival, homeTeam, awayTeam, size.width, size.height),
    [arrival, homeTeam, awayTeam, size.width, size.height]
  );

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      <View style={[styles.courtBox, { width: size.width, height: size.height }]}>
        <SvgCourt
          floorColor={theme.floorColor}
          lineColor={theme.lineColor}
          accentColor={theme.accentColor}
        />
        {/* The opponent's name painted on their own side of the floor (the top
            half they defend), outlined in the player's team color so it reads
            against the opponent-themed court. The player's squad plays the bottom. */}
        <Text
          style={[
            styles.courtTeamName,
            {
              color: theme.lineColor,
              top: Math.round(size.height * 0.012),
              textShadowColor: homeTeam.colorHex,
            },
          ]}
          numberOfLines={1}
        >
          {awayTeam.name.toUpperCase()}
        </Text>
        {(['away', 'home'] as SimTeamSide[]).map((side) =>
          POSITIONS.map((position) => (
            <SpriteAt
              key={`${side}-${position}`}
              side={side}
              position={position}
              team={side === 'home' ? homeTeam : awayTeam}
              roster={side === 'home' ? homeRoster : awayRoster}
              current={current}
              width={size.width}
              height={size.height}
              hot={hotKeys.includes(`${side}-${position}`)}
            />
          ))
        )}
        <BallFlight
          event={current}
          width={size.width}
          height={size.height}
          onArrival={handleArrival}
        />
        <RimRipple
          event={arrival}
          width={size.width}
          height={size.height}
          color={theme.accentColor}
        />
        <ParticleBurst
          origin={burst?.origin ?? null}
          variant={burst?.variant ?? 'spark'}
          count={burst?.count}
          color={burst?.color}
          trigger={burst ? arrival?.seq : null}
        />
      </View>
    </View>
  );
}

const SPRITE_W = 30;

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // The out-of-bounds apron framing the aspect-locked court.
    backgroundColor: palette.bgDeep,
  },
  courtBox: {
    position: 'relative',
  },
  courtTeamName: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
    opacity: 0.85,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
  },
  sprite: {
    position: 'absolute',
    width: SPRITE_W,
    // Center the sprite on its court spot (left/top set per sprite).
    marginLeft: -SPRITE_W / 2,
    marginTop: -SPRITE_W * 0.75,
    alignItems: 'center',
  },
  aura: {
    position: 'absolute',
    top: -4,
    left: -4,
    width: SPRITE_W + 8,
    height: SPRITE_W * 1.5 + 8,
    borderRadius: 4,
    backgroundColor: palette.flame,
  },
  ball: {
    position: 'absolute',
    right: -6,
    top: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.orange,
    borderWidth: 1,
    borderColor: palette.courtLine,
  },
});
