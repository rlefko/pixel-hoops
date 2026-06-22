import type { DimensionValue } from 'react-native';
import { RIM_HEIGHT, RIM_OFFSET } from '@/components/fx/PixelCourt';
import type { Position } from '@/types/roster';
import type { SimTeamSide } from '@/types/sim';

/**
 * Shared court geometry: where each player stands and where the rims are. The
 * sprite layout (CourtView), the ball flight, and the particle origins all read
 * from here so a single source defines the floor and nothing drifts.
 *
 * Home defends the bottom half and attacks the top rim; away mirrors it.
 */

/** Court spot per position: x across the floor, depth from the center line. */
export const FORMATION: Record<Position, { x: number; depth: number }> = {
  PG: { x: 0.5, depth: 0.86 },
  SG: { x: 0.2, depth: 0.58 },
  SF: { x: 0.8, depth: 0.58 },
  PF: { x: 0.34, depth: 0.3 },
  C: { x: 0.66, depth: 0.3 },
};

/** Fractional (0..1) position of a player on a given side. */
export function spotFraction(
  side: SimTeamSide,
  position: Position
): { x: number; y: number } {
  const f = FORMATION[position];
  const x = side === 'home' ? f.x : 1 - f.x;
  const y = side === 'home' ? 0.5 + f.depth * 0.46 : 0.5 - f.depth * 0.46;
  return { x, y };
}

/** Percent-string position for absolute layout (sprite placement). */
export function spotPercent(
  side: SimTeamSide,
  position: Position
): { left: DimensionValue; top: DimensionValue } {
  const { x, y } = spotFraction(side, position);
  return { left: `${x * 100}%`, top: `${y * 100}%` };
}

/** Pixel position of a player given the measured court size. */
export function spotPx(
  side: SimTeamSide,
  position: Position,
  width: number,
  height: number
): { x: number; y: number } {
  const { x, y } = spotFraction(side, position);
  return { x: x * width, y: y * height };
}

/**
 * Pixel center of the rim a side attacks (home attacks the top rim, away the
 * bottom), given the measured court size.
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

