import { useMemo, useState } from 'react';
import { View, StyleSheet, type LayoutChangeEvent } from 'react-native';
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
import { palette } from '@/theme';
import { courtThemeFor } from '@/theme/courtTheme';
import { POSITIONS, type Position, type RosterPlayer } from '@/types/roster';
import { isMadeShot, type SimEvent, type SimTeamSide } from '@/types/sim';
import type { Team } from '@/types/team';

/**
 * The visual heart of the sim: ten procedural pixel players on the court, five
 * per side in a real formation. The player making the current play is
 * spotlighted and holds the ball, so you can watch the action, not just read it.
 * Sits behind the play-by-play ticker (see PlayByPlayFeed).
 */

interface CourtViewProps {
  homeTeam: Team;
  awayTeam: Team;
  /** The play currently being shown, or null before tip-off. */
  current: SimEvent | null;
}

function playerAt(team: Team, position: Position): RosterPlayer | undefined {
  return team.lineup.players.find((p) => p.position === position);
}

interface Burst {
  origin: { x: number; y: number };
  variant: BurstVariant;
  color?: string;
}

/** The particle burst (if any) for the current event, positioned in court px. */
function burstFor(
  current: SimEvent | null,
  homeTeam: Team,
  awayTeam: Team,
  width: number,
  height: number
): Burst | null {
  if (!current || width === 0 || height === 0) return null;
  const side = current.team;
  const made = isMadeShot(current);
  const rim = rimCenterPx(side, width, height);
  if (current.result === 'block' || current.result === 'steal') {
    return {
      origin: spotPx(side, current.scorerPosition, width, height),
      variant: 'cool',
    };
  }
  if (!made) return null;
  if (current.action === 'three' || current.result === 'and-one') {
    return { origin: rim, variant: 'confetti' };
  }
  if (current.action === 'dunk') return { origin: rim, variant: 'debris' };
  return {
    origin: rim,
    variant: 'spark',
    color: side === 'home' ? homeTeam.colorHex : awayTeam.colorHex,
  };
}

function SpriteAt({
  side,
  position,
  team,
  current,
}: {
  side: SimTeamSide;
  position: Position;
  team: Team;
  current: SimEvent | null;
}) {
  const rp = playerAt(team, position);
  if (!rp) return null;
  const active =
    current != null && current.team === side && current.scorerPosition === position;
  const { left, top } = spotPercent(side, position);
  // Pop only when this sprite becomes the active scorer on a new possession.
  const trigger = active ? current!.seq : `idle-${side}-${position}`;

  return (
    <Pop trigger={trigger} style={[styles.sprite, { left, top }]}>
      <PixelPlayer
        color={team.colorHex}
        accent={team.accentHex}
        number={rp.jerseyNumber ?? jerseyNumber(rp.player.name)}
        skinIndex={skinIndexFor(rp.player.name)}
        active={active}
      />
      {active ? <View style={styles.ball} /> : null}
    </Pop>
  );
}

export function CourtView({ homeTeam, awayTeam, current }: CourtViewProps) {
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

  const burst = useMemo(
    () => burstFor(current, homeTeam, awayTeam, size.width, size.height),
    [current, homeTeam, awayTeam, size.width, size.height]
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
          />
        ))
      )}
      <BallFlight event={current} width={size.width} height={size.height} />
      <RimRipple
        event={current}
        width={size.width}
        height={size.height}
        color={theme.accentColor}
      />
      <ParticleBurst
        origin={burst?.origin ?? null}
        variant={burst?.variant ?? 'spark'}
        color={burst?.color}
        trigger={burst ? current?.seq : null}
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
