import { RIM_HEIGHT, RIM_OFFSET } from '@/components/fx/PixelCourt';
import type { Position } from '@/types/roster';
import type { SimTeamSide } from '@/types/sim';

/**
 * Shared court geometry: where each player stands and where the rims are. The
 * sprite layout (CourtView), the ball flight, and the particle origins all read
 * from here so a single source defines the floor and nothing drifts.
 *
 * Home defends the bottom half and attacks the top rim; away mirrors it.
 * Positions are possession-aware: the team with the ball advances into the
 * attacking half (a half-court set), the other team holds its defensive set near
 * its own basket. `depth` runs 0 (own baseline) to 1 (the attacking rim).
 */

interface Spot {
  /** Across-court fraction (0 left .. 1 right), mirrored for the away side. */
  x: number;
  /** Depth at rest / on defense, near the team's own basket. */
  defDepth: number;
  /** Depth target when this team has the ball and pushes into the front court. */
  offTargetDepth: number;
}

export const FORMATION: Record<Position, Spot> = {
  PG: { x: 0.5, defDepth: 0.12, offTargetDepth: 0.62 },
  SG: { x: 0.2, defDepth: 0.2, offTargetDepth: 0.74 },
  SF: { x: 0.8, defDepth: 0.2, offTargetDepth: 0.74 },
  PF: { x: 0.34, defDepth: 0.3, offTargetDepth: 0.86 },
  C: { x: 0.66, defDepth: 0.3, offTargetDepth: 0.86 },
};

/** How far the offense advances toward its target (0 = stay back, 1 = run the floor). */
const OFFENSE_ADVANCE = 0.55;
/** Court fraction the depth axis spans, keeping sprites off the exact baselines. */
const SPAN = 0.92;

/**
 * Fractional (0..1) position of a player, given which side currently has the
 * ball. The attacking side resolves to its advanced offensive depth; everyone
 * else holds the defensive set. `null` (pre-tipoff) leaves both teams set.
 */
export function spotFraction(
  side: SimTeamSide,
  position: Position,
  attackingSide: SimTeamSide | null
): { x: number; y: number } {
  const f = FORMATION[position];
  const advancing = attackingSide === side;
  const depth = advancing
    ? f.defDepth + (f.offTargetDepth - f.defDepth) * OFFENSE_ADVANCE
    : f.defDepth;
  const x = side === 'home' ? f.x : 1 - f.x;
  // Home's own basket is the bottom (y~1); it attacks the top rim (y~0).
  const y = side === 'home' ? 1 - depth * SPAN : depth * SPAN;
  return { x, y };
}

/** Pixel position of a player given the measured court size. */
export function spotPx(
  side: SimTeamSide,
  position: Position,
  width: number,
  height: number,
  attackingSide: SimTeamSide | null
): { x: number; y: number } {
  const { x, y } = spotFraction(side, position, attackingSide);
  return { x: x * width, y: y * height };
}

/**
 * Pixel center of the rim a side attacks (home attacks the top rim, away the
 * bottom), given the measured court size. Possession-independent.
 */
export function rimCenterPx(
  side: SimTeamSide,
  width: number,
  height: number
): { x: number; y: number } {
  const x = width * 0.5;
  const y =
    side === 'home'
      ? RIM_OFFSET + RIM_HEIGHT / 2
      : height - RIM_OFFSET - RIM_HEIGHT / 2;
  return { x, y };
}
