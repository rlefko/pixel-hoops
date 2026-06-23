import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withDelay,
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
import { spotPercent, spotPx, rimCenterPx } from '@/components/game/courtGeometry';
import { idleBobFor, moveOffsetFor, MOVE } from '@/components/game/possession';
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
      origin: spotPx(side, e.scorerPosition, width, height),
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
  if (e.action === 'dunk') return { origin: rim, variant: 'debris', count: 8 };
  return {
    origin: rim,
    variant: 'spark',
    count: 5,
    color: side === 'home' ? homeTeam.colorHex : awayTeam.colorHex,
  };
}

function SpriteAt({
  side,
  position,
  team,
  current,
  width,
  height,
}: {
  side: SimTeamSide;
  position: Position;
  team: Team;
  current: SimEvent | null;
  width: number;
  height: number;
}) {
  const { reducedMotion } = useFeelSettings();
  const rp = playerAt(team, position);

  // Idle breathe, detuned per sprite so the floor undulates instead of marching.
  const bob = useMemo(() => idleBobFor(side, position), [side, position]);
  const { bobStyle } = usePulse(bob.durationMs, {
    delayMs: bob.delayMs,
    bobAmplitude: bob.bobAmplitude,
  });

  // Possession motion: a driver steps to the rim, a defender leans in, a jumper
  // shooter rises. Idle sprites don't move.
  const offset = useMemo(
    () => moveOffsetFor(current, side, position, width, height),
    [current, side, position, width, height]
  );
  const move = useSharedValue(0);
  const seq = current?.seq ?? -1;
  useEffect(() => {
    if (reducedMotion || (offset.dx === 0 && offset.dy === 0)) {
      move.value = 0;
      return;
    }
    move.value = 0;
    move.value = withSequence(
      withTiming(1, { duration: MOVE.out, easing: Easing.out(Easing.cubic) }),
      withDelay(MOVE.hold, withTiming(0, { duration: MOVE.back, easing: Easing.out(Easing.quad) }))
    );
  }, [seq, offset.dx, offset.dy, reducedMotion, move]);
  const moveStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offset.dx * move.value },
      { translateY: offset.dy * move.value },
    ],
  }));

  if (!rp) return null;
  const active =
    current != null && current.team === side && current.scorerPosition === position;
  const { left, top } = spotPercent(side, position);
  // Pop only when this sprite becomes the active scorer on a new possession.
  const trigger = active ? current!.seq : `idle-${side}-${position}`;

  return (
    <Animated.View style={[styles.sprite, { left, top }, moveStyle]}>
      <Animated.View style={bobStyle}>
        <Pop trigger={trigger}>
          <PixelPlayer
            color={team.colorHex}
            accent={team.accentHex}
            number={rp.jerseyNumber ?? jerseyNumber(rp.player.name)}
            skinIndex={skinIndexFor(rp.player.name)}
            active={active}
          />
          {/* Under reduced motion the ball doesn't fly, so the active sprite holds it. */}
          {active && reducedMotion ? <View style={styles.ball} /> : null}
        </Pop>
      </Animated.View>
    </Animated.View>
  );
}

export function CourtView({ homeTeam, awayTeam, current, onArrival }: CourtViewProps) {
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
    width: SPRITE_W,
    // Center the sprite on its court spot.
    marginLeft: -SPRITE_W / 2,
    marginTop: -SPRITE_W * 0.75,
    alignItems: 'center',
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
