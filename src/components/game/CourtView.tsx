import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  PixelCourt,
  PixelPlayer,
  Pop,
  BallFlight,
  RimRipple,
  ParticleBurst,
  type BurstVariant,
} from '@/components/fx';
import { jerseyNumber, skinIndexFor } from '@/components/game/jersey';
import { spotPx, rimCenterPx } from '@/components/game/courtGeometry';
import { idleBobFor, moveOffsetFor, roleFor, MOVE, DUNK } from '@/components/game/possession';
import { useFeelSettings, usePulse } from '@/feel';
import { palette } from '@/theme';
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

function playerAt(team: Team, position: Position): RosterPlayer | undefined {
  return team.lineup.players.find((p) => p.position === position);
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
      origin: spotPx(side, e.scorerPosition, width, height, side),
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
  current,
  width,
  height,
  hot,
}: {
  side: SimTeamSide;
  position: Position;
  team: Team;
  current: SimEvent | null;
  width: number;
  height: number;
  hot: boolean;
}) {
  const { reducedMotion } = useFeelSettings();
  const rp = playerAt(team, position);

  const role = roleFor(current, side, position);
  const active =
    current != null && current.team === side && current.scorerPosition === position;
  const isDunker = role === 'dunker';
  const seq = current?.seq ?? -1;

  // Possession-aware base: the team with the ball advances into the attacking
  // half; everyone else holds the defensive set. The base slides on each change.
  const target = useMemo(() => {
    if (width === 0 || height === 0) return { x: 0, y: 0 };
    return spotPx(side, position, width, height, current?.team ?? null);
  }, [side, position, width, height, current?.team]);
  const baseX = useSharedValue(0);
  const baseY = useSharedValue(0);
  const placed = useRef(false);
  useEffect(() => {
    if (width === 0 || height === 0) return;
    if (!placed.current || reducedMotion) {
      baseX.value = target.x; // first placement or reduced motion: snap
      baseY.value = target.y;
      placed.current = true;
      return;
    }
    baseX.value = withTiming(target.x, { duration: 120, easing: Easing.out(Easing.cubic) });
    baseY.value = withTiming(target.y, { duration: 120, easing: Easing.out(Easing.cubic) });
  }, [target.x, target.y, reducedMotion, baseX, baseY, width, height]);
  // Quantize to whole 2px steps so the slide reads as discrete 8-bit hops.
  const slideStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: Math.round(baseX.value / 2) * 2 },
      { translateY: Math.round(baseY.value / 2) * 2 },
    ],
  }));

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
      withTiming(1, { duration: MOVE.out, easing: Easing.out(Easing.cubic) }),
      withDelay(MOVE.hold, withTiming(0, { duration: MOVE.back, easing: Easing.out(Easing.quad) }))
    );
  }, [seq, offset.dx, offset.dy, reducedMotion, isDunker, move]);
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
    dunk.value = withTiming(1, { duration: DUNK_TOTAL, easing: Easing.linear });
    return () => cancelAnimation(dunk);
  }, [seq, isDunker, reducedMotion, dunk]);
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

  // On-fire aura: a flame glow behind a hot scorer (NBA Jam). Steady under reduced motion.
  const { glowStyle } = usePulse(560);

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
    <Animated.View style={[styles.sprite, slideStyle]}>
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
    </Animated.View>
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

  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) =>
    setSize({
      width: e.nativeEvent.layout.width,
      height: e.nativeEvent.layout.height,
    });

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
      <PixelCourt
        floorColor={theme.floorColor}
        lineColor={theme.lineColor}
        accentColor={theme.accentColor}
      />
      {(['away', 'home'] as SimTeamSide[]).map((side) =>
        POSITIONS.map((position) => (
          <SpriteAt
            key={`${side}-${position}`}
            side={side}
            position={position}
            team={side === 'home' ? homeTeam : awayTeam}
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
  },
  sprite: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SPRITE_W,
    // Center the sprite on its court spot (translated into place by slideStyle).
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
