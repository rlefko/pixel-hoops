import { View, StyleSheet, type DimensionValue } from 'react-native';
import { PixelCourt, PixelPlayer, Pop } from '@/components/fx';
import { jerseyNumber, skinIndexFor } from '@/components/game/jersey';
import { palette } from '@/theme';
import { POSITIONS, type Position, type RosterPlayer } from '@/types/roster';
import type { SimEvent, SimTeamSide } from '@/types/sim';
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

/** Court spot per position: x across the floor, depth from the center line. */
const FORMATION: Record<Position, { x: number; depth: number }> = {
  PG: { x: 0.5, depth: 0.86 },
  SG: { x: 0.2, depth: 0.58 },
  SF: { x: 0.8, depth: 0.58 },
  PF: { x: 0.34, depth: 0.3 },
  C: { x: 0.66, depth: 0.3 },
};

function playerAt(team: Team, position: Position): RosterPlayer | undefined {
  return team.lineup.players.find((p) => p.position === position);
}

/** Screen position (percent) for a position on a given side. */
function spot(
  side: SimTeamSide,
  position: Position
): { left: DimensionValue; top: DimensionValue } {
  const f = FORMATION[position];
  // Home defends the bottom half, away the top half (mirrored).
  const x = side === 'home' ? f.x : 1 - f.x;
  const top = side === 'home' ? 0.5 + f.depth * 0.46 : 0.5 - f.depth * 0.46;
  return { left: `${x * 100}%`, top: `${top * 100}%` };
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
  const { left, top } = spot(side, position);
  // Pop only when this sprite becomes the active scorer on a new possession.
  const trigger = active ? current!.seq : `idle-${side}-${position}`;

  return (
    <Pop trigger={trigger} style={[styles.sprite, { left, top }]}>
      <PixelPlayer
        color={team.colorHex}
        number={rp.jerseyNumber ?? jerseyNumber(rp.player.name)}
        skinIndex={skinIndexFor(rp.player.name)}
        active={active}
      />
      {active ? <View style={styles.ball} /> : null}
    </Pop>
  );
}

export function CourtView({ homeTeam, awayTeam, current }: CourtViewProps) {
  return (
    <View style={styles.wrap}>
      <PixelCourt />
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
