import type { DimensionValue } from 'react-native';
import {
  RIM_CENTER_FRACTION_X,
  RIM_CENTER_FRACTION_Y,
} from '@/components/game/courtDimensions';
import type { Position } from '@/types/roster';
import type { SimTeamSide } from '@/types/sim';

/**
 * Shared court geometry: where each player stands and where the rims are. The
 * sprite layout (CourtView), the ball flight, and the particle origins all read
 * from here so a single source defines the floor and nothing drifts.
 *
 * Home defends the bottom half and attacks the top rim; away mirrors it. The
 * sprite BASE layout is the defensive set (`attackingSide = null`), where the
 * floor rests between possessions. In Full mode the possession theater
 * (choreography.ts) runs the offense up into the front court each possession via
 * the advanced offensive depth (`attackingSide = side`); Highlights and reduced
 * motion hold the base set and let the ball and the shooter carry the beat.
 * `depth` runs 0 (own baseline) to 1 (the attacking rim).
 */

interface Spot {
  /** Across-court fraction (0 left .. 1 right), mirrored for the away side. */
  x: number;
  /** Depth at rest / on defense, near the team's own basket. */
  defDepth: number;
  /** Depth target when this team has the ball and pushes into the front court. */
  offTargetDepth: number;
}

/**
 * Resting spots, hand-placed so each side reads as a recognizable half-court
 * spread in its own half against the real court lines. With depth d the home
 * sprite sits at screen y = 1 - d * SPAN, so these depths land the PG up near the
 * three-point apex (~0.70), the wings on the arc (~0.76), and the bigs on the
 * blocks near the rim (~0.84 and ~0.88). The x values keep the bigs inside the
 * 16 ft lane (x 0.34..0.66) and the wings out on the perimeter. `offTargetDepth`
 * drives the Full-mode offensive-advance path (the offense runs up to it each
 * possession); the base defensive set uses `x` and `defDepth`.
 */
export const FORMATION: Record<Position, Spot> = {
  PG: { x: 0.5, defDepth: 0.32, offTargetDepth: 0.62 },
  SG: { x: 0.24, defDepth: 0.26, offTargetDepth: 0.74 },
  SF: { x: 0.76, defDepth: 0.26, offTargetDepth: 0.74 },
  PF: { x: 0.36, defDepth: 0.17, offTargetDepth: 0.86 },
  C: { x: 0.6, defDepth: 0.13, offTargetDepth: 0.86 },
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

/**
 * Convert an attacking-frame point `(x, depth)` to a court fraction for `side`.
 * `x` is 0 (left as the attacking team faces its rim) .. 1 (right), mirrored for
 * away; `depth` is 0 (the offense's own baseline) .. 1 (the attacking rim). This
 * is the anchor the play templates author their control points in, so one
 * template serves both ends of the floor.
 */
export function attackFrac(
  side: SimTeamSide,
  x: number,
  depth: number
): { x: number; y: number } {
  const mx = side === 'home' ? x : 1 - x;
  const y = side === 'home' ? 1 - depth * SPAN : depth * SPAN;
  return { x: mx, y };
}

/** Percent-string position for absolute layout (the static sprite base). */
export function spotPercent(
  side: SimTeamSide,
  position: Position,
  attackingSide: SimTeamSide | null
): { left: DimensionValue; top: DimensionValue } {
  const { x, y } = spotFraction(side, position, attackingSide);
  return { left: `${x * 100}%`, top: `${y * 100}%` };
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
 * Fractional (0..1) center of the rim a side attacks (home attacks the top rim,
 * away the bottom). The single source for rim placement, so the ball, the rim
 * ripple, the particles, and the choreography's shot spots all agree.
 */
export function rimCenterFraction(side: SimTeamSide): { x: number; y: number } {
  return {
    x: RIM_CENTER_FRACTION_X,
    y: side === 'home' ? RIM_CENTER_FRACTION_Y : 1 - RIM_CENTER_FRACTION_Y,
  };
}

/**
 * Pixel center of the rim a side attacks, given the measured court size.
 * Possession-independent.
 */
export function rimCenterPx(
  side: SimTeamSide,
  width: number,
  height: number
): { x: number; y: number } {
  const { x, y } = rimCenterFraction(side);
  return { x: x * width, y: y * height };
}
