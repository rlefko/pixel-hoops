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
  lSlot: [0.3, 0.7] as const,
  rSlot: [0.7, 0.7] as const,
  lWing: [0.14, 0.75] as const,
  rWing: [0.86, 0.75] as const,
  lCorner: [0.06, 0.84] as const,
  rCorner: [0.94, 0.84] as const,
  lBlock: [0.36, 0.86] as const,
  rBlock: [0.64, 0.86] as const,
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
  sa: SimActionId,
  trailerPos?: Position
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
    // Stage the screener a step OFF the handler pre-pick (it slides in to set the pick at
    // the action), so the two aren't stacked during the set.
    spots[screenerPos] = { setSpot: lerpFrac(handlerSet, screenSpot, 0.65), actionSpot: rollSpot };
    screen = { screener: screenerPos, screenSpot, rollSpot };
  }

  // Remaining spacers: fill the open perimeter/inside anchors deterministically.
  let cornerSide = strongSide; // alternate to keep the floor balanced
  for (const p of POSITIONS) {
    if (spots[p]) continue;
    // The inbound trailer fills from BEHIND the ball: a shallow trail-three spot behind the
    // top, then flows to the dunker/block late (its actionSpot), so it never races ahead.
    if (p === trailerPos) {
      spots[p] = { setSpot: F([strongSide ? 0.42 : 0.58, 0.55]), actionSpot: F(blockAnchor(!strongSide)) };
      continue;
    }
    const role = offRoles[p];
    let anchor: readonly [number, number];
    if (role === 'big') anchor = blockAnchor(!strongSide);
    else if (role === 'corner') anchor = cornerAnchor(cornerSide);
    else anchor = wingAnchor(!cornerSide);
    cornerSide = !cornerSide;
    const spot = F(anchor);
    spots[p] = { setSpot: spot, actionSpot: spot }; // spacers hold (cuts overlay in the sim)
  }

  // Spread the holding spacers off each other AND off the finisher's shot spot so no two
  // players stack (e.g. a corner three colliding with a corner spacer). Front-court clamped
  // so it never pushes anyone toward mid-court / the backcourt.
  spreadSpacers(spots, finisher, shotSpot, side);

  return { spots, screen, ballHandler: initiator ?? finisher };
}

/** Push `a` to at least `min` from `b` (frac space); a no-op if already spaced. */
function repel(a: Frac, b: Frac, min: number): Frac {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return { x: a.x + min * 0.5, y: a.y }; // coincident: nudge sideways
  if (d >= min) return a;
  const push = min - d;
  return { x: a.x + (dx / d) * push, y: a.y + (dy / d) * push };
}

/** Iteratively spread the holding spacers (setSpot === actionSpot) off each other and the
 *  finisher's shot spot + the other principals, so the five hold a real spread. Pure. */
const SPACER_MIN_DIST = 0.15; // min frac distance between two holding spacers (and off the shot spot)

function spreadSpacers(spots: Record<Position, RoleSpots>, finisher: Position, shotSpot: Frac, side: SimTeamSide): void {
  const yLo = side === 'home' ? 0.08 : 0.52; // keep inside the front court (home small y, away large)
  const yHi = side === 'home' ? 0.48 : 0.92;
  const spacers = POSITIONS.filter((p) => spots[p] && p !== finisher && spots[p].setSpot === spots[p].actionSpot);
  const fixed: Frac[] = [shotSpot];
  for (const p of POSITIONS) if (spots[p] && !spacers.includes(p)) fixed.push(spots[p].setSpot);
  for (let iter = 0; iter < 6; iter++) {
    for (const p of spacers) {
      let pt: Frac = spots[p].setSpot;
      for (const f of fixed) pt = repel(pt, f, SPACER_MIN_DIST);
      for (const q of spacers) if (q !== p) pt = repel(pt, spots[q].setSpot, SPACER_MIN_DIST);
      pt = { x: Math.max(0.05, Math.min(0.95, pt.x)), y: Math.max(yLo, Math.min(yHi, pt.y)) };
      spots[p] = { setSpot: pt, actionSpot: pt };
    }
  }
}
