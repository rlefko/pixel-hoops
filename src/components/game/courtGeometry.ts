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
 * sprite BASE layout is the stable defensive set (`attackingSide = null`): the
 * floor does not reposition per possession (that read as jumpy). The advanced
 * offensive depth is used only as a launch anchor for the ball origin and the
 * active shooter/driver/dunker step, so possession still reads from the ball and
 * the moving player, not a whole-floor shuffle. `depth` runs 0 (own baseline) to
 * 1 (the attacking rim).
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
 * is retained for the (currently unused) offensive-advance path; only `x` and
 * `defDepth` are rendered today.
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
 * Pixel center of the rim a side attacks (home attacks the top rim, away the
 * bottom), given the measured court size. Possession-independent.
 */
export function rimCenterPx(
  side: SimTeamSide,
  width: number,
  height: number
): { x: number; y: number } {
  // Fractional, so the ball, rim ripple, and particles all land on the rim the
  // SVG court draws (5.25 ft from the baseline). Home attacks the top rim.
  const x = width * RIM_CENTER_FRACTION_X;
  const y =
    side === 'home'
      ? height * RIM_CENTER_FRACTION_Y
      : height * (1 - RIM_CENTER_FRACTION_Y);
  return { x, y };
}
