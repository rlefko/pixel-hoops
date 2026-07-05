import { attackFrac, rimCenterFraction } from '../courtGeometry';
import { lerpFrac, type Frac } from '../courtMath';
import { POSITIONS, type Position } from '@/types/roster';
import type { SimActionId, SimTeamSide } from '@/types/sim';
import type { OffRole, PlayAction } from './types';

/**
 * Generic, role-based spacing: gives each of the five offensive positions a SET
 * spot (a real half-court spread they get to) and an ACTION spot (where they end
 * as the play resolves). This replaces the seven hand-authored templates with one
 * consolidated spatial authoring keyed off the role + action, so the set always
 * reads like an NBA floor: shooters on the arc, a big inside, the ball up top.
 * The finisher's action spot is the recorded shot spot; the screener has a screen
 * point. Pure and Node-safe; the steering sim drives the movement between spots.
 */

/** Attacking-frame anchors (x 0..1 left..right as the offense faces its rim, depth 0..1).
 *  Deep enough that the whole set sits in the front court, not straddling half-court. */
const A = {
  top: [0.5, 0.66] as const,
  lSlot: [0.32, 0.7] as const,
  rSlot: [0.68, 0.7] as const,
  lWing: [0.16, 0.75] as const,
  rWing: [0.84, 0.75] as const,
  lCorner: [0.07, 0.83] as const,
  rCorner: [0.93, 0.83] as const,
  lBlock: [0.4, 0.86] as const,
  rBlock: [0.6, 0.86] as const,
};

export interface RoleSpots {
  setSpot: Frac;
  actionSpot: Frac;
}

export interface Formation {
  spots: Record<Position, RoleSpots>;
  /** The screener + the pick location (for coverage geometry), if the action has one. */
  screen?: { screener: Position; screenSpot: Frac; rollSpot: Frac };
  /** Who carries the ball up the floor (the initiator, else the finisher). */
  ballHandler: Position;
}

/** The finisher's attacking-frame x (mirror for the away side). */
function attackingX(shotSpot: Frac, side: SimTeamSide): number {
  return side === 'home' ? shotSpot.x : 1 - shotSpot.x;
}

/** A rim finish starts off the ball and cuts/rolls in; a perimeter finish relocates. */
function isRimFinish(action: SimActionId): boolean {
  return action === 'dunk' || action === 'layup' || action === 'post';
}

/**
 * Build the possession's spacing. `offRoles` maps each position to its role;
 * `shotSpot` is the finisher's release point; `sa` is the recorded action.
 */
export function buildFormation(
  offRoles: Record<Position, OffRole>,
  finisher: Position,
  initiator: Position | undefined,
  shotSpot: Frac,
  side: SimTeamSide,
  action: PlayAction,
  sa: SimActionId
): Formation {
  const F = (a: readonly [number, number]) => attackFrac(side, a[0], a[1]);
  const rim = rimCenterFraction(side);
  const onBall = !initiator; // unassisted: the finisher creates his own shot
  const fx = attackingX(shotSpot, side); // finisher's side of the floor
  const strongSide = fx >= 0.5; // finisher's side (attacking frame)

  const spots = {} as Record<Position, RoleSpots>;

  // Assign the four spacing anchors so shooters ring the arc and a big sits inside.
  // Corners + wings on opposite sides keep the floor spread; a big on the weak block.
  const wingAnchor = (right: boolean) => (right ? A.rWing : A.lWing);
  const cornerAnchor = (right: boolean) => (right ? A.rCorner : A.lCorner);
  const blockAnchor = (right: boolean) => (right ? A.rBlock : A.lBlock);

  // Finisher spots.
  let finisherSet: Frac;
  if (onBall) {
    finisherSet = F(A.top); // brings the ball, attacks
  } else if (isRimFinish(sa)) {
    // Rolls / cuts / posts in from a slot on the finisher's side, then attacks the rim.
    finisherSet = F([strongSide ? 0.6 : 0.4, 0.64]);
  } else {
    // Off-ball shooter relocates a SHORT distance on the shot's own side (a lift/shift),
    // never all the way across the floor.
    finisherSet = F([strongSide ? 0.8 : 0.2, 0.72]);
  }
  spots[finisher] = { setSpot: finisherSet, actionSpot: shotSpot };

  // Initiator spots (assisted): up top, then slides toward the action to deliver.
  if (initiator) {
    const deliver = isRimFinish(sa) ? F([strongSide ? 0.6 : 0.4, 0.68]) : F([0.5, 0.64]);
    spots[initiator] = { setSpot: F(A.top), actionSpot: deliver };
  }

  // Screener spots + the screen geometry.
  let screen: Formation['screen'];
  const screenerPos = POSITIONS.find((p) => offRoles[p] === 'screener');
  if (screenerPos) {
    const handler = initiator ?? finisher;
    const handlerSet = spots[handler]?.setSpot ?? F(A.top);
    // The pick is set beside the handler toward the strong side; roll to the rim.
    const screenSpot = lerpFrac(handlerSet, F([strongSide ? 0.62 : 0.38, 0.66]), 0.6);
    const rollSpot =
      action === 'pnp' ? F([strongSide ? 0.6 : 0.4, 0.7]) : lerpFrac(screenSpot, rim, 0.72);
    spots[screenerPos] = { setSpot: lerpFrac(handlerSet, screenSpot, 0.4), actionSpot: rollSpot };
    screen = { screener: screenerPos, screenSpot, rollSpot };
  }

  // Remaining spacers: fill the open perimeter/inside anchors deterministically.
  let cornerSide = strongSide; // alternate to keep the floor balanced
  for (const p of POSITIONS) {
    if (spots[p]) continue;
    const role = offRoles[p];
    let anchor: readonly [number, number];
    if (role === 'big') anchor = blockAnchor(!strongSide);
    else if (role === 'corner') anchor = cornerAnchor(cornerSide);
    else anchor = wingAnchor(!cornerSide);
    cornerSide = !cornerSide;
    const spot = F(anchor);
    spots[p] = { setSpot: spot, actionSpot: spot }; // spacers hold (cuts overlay in the sim)
  }

  return { spots, screen, ballHandler: initiator ?? finisher };
}
