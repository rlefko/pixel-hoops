import { attackFrac, spotFraction, rimCenterFraction } from './courtGeometry';
import { COURT } from './courtDimensions';
import {
  clampToCourt,
  lerpFrac,
  spriteKey,
  strictlyIncreasingByMs,
  type Frac,
  type SpriteKey,
} from './courtMath';
import { catmullRom } from '@/feel/catmullRom';
import { POSITIONS, type Position } from '@/types/roster';
import { isMadeShot, type SimEvent, type SimTeamSide } from '@/types/sim';
import type { BallLeg, BallLegKind, Waypoint } from './choreography';

/**
 * The play-template library: a small, pure, deterministic vocabulary of real NBA
 * actions (pick-and-roll, hand-off, pin-down, post-up, iso, spot-up, transition)
 * that turn one statistical SimEvent into a believable possession. A template is
 * authored once as per-role parametric paths (control points in an attacking
 * frame) + a ball script + fractional timing; `instantiate` selects it from the
 * event, assigns the five on-court positions to its roles, and BAKES curved,
 * staggered, decelerating waypoints (plus reacting defenders) — all at plan-build
 * time. No React, no reanimated, no randomness (variety is seeded by `event.seq`).
 *
 * The sim is untouched: this reads the recorded outcome and dresses it as a play.
 * The credited assist is always the FINAL pass; earlier touches are cosmetic and
 * never change who scored or assisted.
 */

// --- Roles ---

export type RoleId =
  | 'ballHandler'
  | 'screener'
  | 'rollMan'
  | 'receiver'
  | 'shooter'
  | 'passer'
  | 'entry'
  | 'post'
  | 'corner'
  | 'strongWing'
  | 'weakWing'
  | 'rimRunner'
  | 'wingL'
  | 'wingR'
  | 'trailer';

/** Movement archetype, for assigning positions to roles (bigs screen/post, etc.). */
type Archetype = 'handler' | 'wing' | 'big';

function roleArchetype(role: RoleId): Archetype {
  switch (role) {
    case 'ballHandler':
    case 'receiver':
    case 'shooter':
    case 'passer':
    case 'entry':
      return 'handler';
    case 'screener':
    case 'rollMan':
    case 'post':
    case 'trailer':
      return 'big';
    default:
      return 'wing';
  }
}

/** Each position's preference order over archetypes (index 0 = best fit). */
const POS_ARCH: Record<Position, Archetype[]> = {
  PG: ['handler', 'wing', 'big'],
  SG: ['handler', 'wing', 'big'],
  SF: ['wing', 'handler', 'big'],
  PF: ['big', 'wing', 'handler'],
  C: ['big', 'wing', 'handler'],
};

// --- Template authoring model ---

/** A control point in the attacking frame: [x 0..1, depth 0..1] (depth 1 = the rim). */
type AttackPt = [number, number];

/** One role's parametric path. Timings are FRACTIONS of preShotMs (0..1). */
interface RoleSpec {
  /** Front-court control points the role runs THROUGH (first = entry spot, last = final). */
  control: AttackPt[];
  /** Fraction of preShotMs when the role starts moving from its base (stagger). */
  start: number;
  /** Fraction of preShotMs when the role settles at its final spot (arrive-decel). */
  arrive: number;
  /** Screener only: fraction of preShotMs to hold at the screen spot (contact beat). */
  contact?: number;
}

/** One pre-shot ball leg. Times are FRACTIONS of preShotMs; the last ends at 1.0. */
interface BallLegSpec {
  kind: BallLegKind;
  from: RoleId;
  to: RoleId;
  start: number;
  end: number;
}

export interface PlayTemplate {
  id: TemplateId;
  /** The five offensive roles this template fills. */
  roles: Partial<Record<RoleId, RoleSpec>>;
  /** The role the scorer occupies (its final spot is replaced by the real shot spot). */
  terminal: RoleId;
  /** The role the assister occupies (assisted plays only). */
  feeder?: RoleId;
  /** Pre-shot ball legs (the last ends at the shooter = the credited assist). */
  ball: BallLegSpec[];
  /** Transition templates run the full floor with sprint lanes. */
  transition?: boolean;
}

export type TemplateId =
  | 'spotUp'
  | 'dho'
  | 'pindown'
  | 'pnr'
  | 'postUp'
  | 'iso'
  | 'transition';

// Attacking-frame anchors (x, depth): rim ~0.94; arc ~0.72-0.78; corners x ~0.08/0.92;
// wings x ~0.20/0.80; elbows x ~0.36/0.64; top x 0.5; blocks x ~0.40/0.60 near d 0.88.

export const TEMPLATES: Record<TemplateId, PlayTemplate> = {
  // Drive-and-kick to a weak-side shooter relocating late behind the arc.
  spotUp: {
    id: 'spotUp',
    terminal: 'corner',
    feeder: 'ballHandler',
    roles: {
      ballHandler: { control: [[0.5, 0.6], [0.44, 0.8], [0.41, 0.85]], start: 0, arrive: 0.72 },
      corner: { control: [[0.2, 0.72], [0.1, 0.74], [0.09, 0.72]], start: 0.32, arrive: 0.98 },
      strongWing: { control: [[0.8, 0.72], [0.85, 0.72]], start: 0.1, arrive: 0.78 },
      weakWing: { control: [[0.32, 0.6], [0.24, 0.66]], start: 0.1, arrive: 0.8 },
      post: { control: [[0.6, 0.86], [0.66, 0.85]], start: 0, arrive: 0.78 },
    },
    // Ball reversal then a drive-and-kick: the ball swings weak-side and back
    // before the creator drives and kicks to the spotting-up shooter (the assist).
    ball: [
      { kind: 'carry', from: 'ballHandler', to: 'ballHandler', start: 0, end: 0.28 },
      { kind: 'pass', from: 'ballHandler', to: 'weakWing', start: 0.3, end: 0.42 },
      { kind: 'pass', from: 'weakWing', to: 'ballHandler', start: 0.5, end: 0.62 },
      { kind: 'pass', from: 'ballHandler', to: 'corner', start: 0.74, end: 1 },
    ],
  },
  // Dribble hand-off: the receiver curls off the handler into the shot.
  dho: {
    id: 'dho',
    terminal: 'receiver',
    feeder: 'ballHandler',
    roles: {
      ballHandler: { control: [[0.62, 0.7], [0.52, 0.68], [0.5, 0.64]], start: 0, arrive: 0.55, contact: 0.18 },
      receiver: { control: [[0.4, 0.66], [0.48, 0.66], [0.5, 0.72]], start: 0.2, arrive: 0.96 },
      strongWing: { control: [[0.82, 0.72], [0.86, 0.72]], start: 0.1, arrive: 0.8 },
      weakWing: { control: [[0.2, 0.72], [0.16, 0.72]], start: 0.1, arrive: 0.8 },
      post: { control: [[0.62, 0.87], [0.6, 0.88]], start: 0, arrive: 0.8 },
    },
    ball: [
      { kind: 'carry', from: 'ballHandler', to: 'ballHandler', start: 0, end: 0.5 },
      { kind: 'handoff', from: 'ballHandler', to: 'receiver', start: 0.62, end: 1 },
    ],
  },
  // Shooter runs off a down-screen to catch-and-shoot.
  pindown: {
    id: 'pindown',
    terminal: 'shooter',
    feeder: 'passer',
    roles: {
      passer: { control: [[0.5, 0.62], [0.52, 0.64]], start: 0, arrive: 0.5 },
      shooter: { control: [[0.3, 0.88], [0.32, 0.78], [0.28, 0.72]], start: 0.28, arrive: 0.96 },
      screener: { control: [[0.34, 0.86], [0.36, 0.82]], start: 0.05, arrive: 0.5, contact: 0.22 },
      weakWing: { control: [[0.8, 0.72], [0.84, 0.72]], start: 0.1, arrive: 0.8 },
      corner: { control: [[0.9, 0.72], [0.91, 0.72]], start: 0, arrive: 0.8 },
    },
    ball: [
      { kind: 'carry', from: 'passer', to: 'passer', start: 0, end: 0.55 },
      { kind: 'pass', from: 'passer', to: 'shooter', start: 0.7, end: 1 },
    ],
  },
  // Pick-and-roll: the screener holds a contact beat then rolls to the rim to finish.
  pnr: {
    id: 'pnr',
    terminal: 'rollMan',
    feeder: 'ballHandler',
    roles: {
      ballHandler: { control: [[0.5, 0.62], [0.56, 0.72], [0.58, 0.82]], start: 0, arrive: 0.75 },
      rollMan: { control: [[0.58, 0.7], [0.56, 0.82], [0.53, 0.9]], start: 0.1, arrive: 0.95, contact: 0.28 },
      strongWing: { control: [[0.2, 0.72], [0.14, 0.72]], start: 0.1, arrive: 0.8 },
      weakWing: { control: [[0.8, 0.72], [0.86, 0.72]], start: 0.1, arrive: 0.8 },
      corner: { control: [[0.1, 0.72], [0.09, 0.72]], start: 0, arrive: 0.8 },
    },
    ball: [
      { kind: 'carry', from: 'ballHandler', to: 'ballHandler', start: 0, end: 0.72 },
      { kind: 'pass', from: 'ballHandler', to: 'rollMan', start: 0.8, end: 1 },
    ],
  },
  // Post-up: wing entry pass to the block; the post backs down; the weak-side big lifts.
  postUp: {
    id: 'postUp',
    terminal: 'post',
    feeder: 'entry',
    roles: {
      entry: { control: [[0.28, 0.7], [0.34, 0.74]], start: 0, arrive: 0.55 },
      post: { control: [[0.58, 0.82], [0.57, 0.87], [0.56, 0.89]], start: 0.05, arrive: 0.95 },
      weakWing: { control: [[0.8, 0.72], [0.86, 0.72]], start: 0.1, arrive: 0.8 },
      corner: { control: [[0.1, 0.72], [0.09, 0.72]], start: 0, arrive: 0.8 },
      strongWing: { control: [[0.34, 0.86], [0.32, 0.84]], start: 0.1, arrive: 0.8 },
    },
    ball: [
      { kind: 'carry', from: 'entry', to: 'entry', start: 0, end: 0.5 },
      { kind: 'pass', from: 'entry', to: 'post', start: 0.62, end: 1 },
    ],
  },
  // Isolation: four clear to the weak side; the handler attacks 1-on-1 (0 passes).
  iso: {
    id: 'iso',
    terminal: 'ballHandler',
    roles: {
      ballHandler: { control: [[0.5, 0.62], [0.5, 0.72], [0.5, 0.8]], start: 0, arrive: 0.95 },
      weakWing: { control: [[0.82, 0.72], [0.88, 0.7]], start: 0.05, arrive: 0.7 },
      strongWing: { control: [[0.86, 0.86], [0.9, 0.84]], start: 0.05, arrive: 0.7 },
      corner: { control: [[0.9, 0.72], [0.92, 0.72]], start: 0, arrive: 0.7 },
      post: { control: [[0.14, 0.86], [0.1, 0.84]], start: 0.05, arrive: 0.7 },
    },
    ball: [{ kind: 'carry', from: 'ballHandler', to: 'ballHandler', start: 0, end: 1 }],
  },
  // Transition: a three-lane sprint; a lead pass/lob finishes at the rim.
  transition: {
    id: 'transition',
    terminal: 'rimRunner',
    feeder: 'ballHandler',
    transition: true,
    roles: {
      ballHandler: { control: [[0.5, 0.28], [0.5, 0.55], [0.5, 0.72]], start: 0, arrive: 0.75 },
      rimRunner: { control: [[0.56, 0.26], [0.53, 0.7], [0.51, 0.9]], start: 0, arrive: 0.96 },
      wingL: { control: [[0.2, 0.32], [0.14, 0.62], [0.16, 0.8]], start: 0, arrive: 0.85 },
      wingR: { control: [[0.8, 0.32], [0.86, 0.62], [0.84, 0.8]], start: 0, arrive: 0.85 },
      trailer: { control: [[0.5, 0.2], [0.5, 0.5]], start: 0, arrive: 0.8 },
    },
    ball: [
      { kind: 'carry', from: 'ballHandler', to: 'ballHandler', start: 0, end: 0.72 },
      { kind: 'pass', from: 'ballHandler', to: 'rimRunner', start: 0.8, end: 1 },
    ],
  },
};

// --- Selection (deterministic, seeded by seq) ---

export type Contest = 'open' | 'contested';

/**
 * A live-ball turnover the other way runs a break; a defensive rebound runs one
 * about a third of the time; a made basket must be inbounded (half-court).
 */
export function deriveTransition(event: SimEvent, prev?: SimEvent): boolean {
  if (!prev) return false;
  const flipped = prev.team !== event.team;
  if (flipped && (prev.result === 'steal' || prev.result === 'turnover')) return true;
  if (flipped && (prev.result === 'miss' || prev.result === 'block')) return event.seq % 3 === 0;
  return false;
}

/** How guarded the shot reads (tunes only the defender's arrival, never the outcome). */
export function deriveContest(event: SimEvent): Contest {
  if (event.result === 'block') return 'contested';
  if (!isMadeShot(event) && event.isBigPlay) return 'contested';
  if (event.successRate <= 40) return 'contested';
  if (!!event.assist && isMadeShot(event)) return 'open';
  return event.successRate >= 60 ? 'open' : 'contested';
}

export function selectTemplate(event: SimEvent, prev?: SimEvent): TemplateId {
  const transition = deriveTransition(event, prev);
  const assisted = !!event.assist && isMadeShot(event);
  const a = event.action;
  if (transition && (a === 'dunk' || a === 'layup')) return 'transition';
  if (a === 'dunk' && !assisted) return 'transition'; // leak-out
  if (a === 'post') return 'postUp';
  if (assisted && (a === 'dunk' || a === 'layup' || a === 'drive')) return 'pnr';
  if (assisted) return (['spotUp', 'dho', 'pindown'] as const)[event.seq % 3];
  return 'iso';
}

// --- Role assignment ---

export interface RoleAssignment {
  /** role -> the position that plays it. */
  posOf: Partial<Record<RoleId, Position>>;
  /** position -> the role it plays. */
  roleOf: Record<Position, RoleId>;
}

/** Assign the five on-court positions to a template's roles, deterministically. */
export function assignRoles(template: PlayTemplate, event: SimEvent): RoleAssignment {
  const roleIds = Object.keys(template.roles) as RoleId[];
  const posOf: Partial<Record<RoleId, Position>> = {};
  const takenPos = new Set<Position>();
  const takenRole = new Set<RoleId>();

  // 1. Scorer -> terminal.
  posOf[template.terminal] = event.scorerPosition;
  takenPos.add(event.scorerPosition);
  takenRole.add(template.terminal);

  // 2. Assister -> feeder (assisted makes with a distinct passer).
  const assisted = !!event.assist && isMadeShot(event);
  if (assisted && event.assist && template.feeder && template.feeder !== template.terminal) {
    const p = event.assist.position;
    if (!takenPos.has(p)) {
      posOf[template.feeder] = p;
      takenPos.add(p);
      takenRole.add(template.feeder);
    }
  }

  // 3. Remaining positions -> remaining roles by archetype preference (greedy, deterministic).
  const freeRoles = roleIds.filter((r) => !takenRole.has(r));
  const freePos = POSITIONS.filter((p) => !takenPos.has(p));
  const pairs: { role: RoleId; pos: Position; cost: number }[] = [];
  for (const role of freeRoles) {
    for (const pos of freePos) {
      const cost = POS_ARCH[pos].indexOf(roleArchetype(role));
      pairs.push({ role, pos, cost });
    }
  }
  pairs.sort(
    (a, b) =>
      a.cost - b.cost ||
      roleIds.indexOf(a.role) - roleIds.indexOf(b.role) ||
      POSITIONS.indexOf(a.pos) - POSITIONS.indexOf(b.pos)
  );
  for (const { role, pos } of pairs) {
    if (takenRole.has(role) || takenPos.has(pos)) continue;
    posOf[role] = pos;
    takenRole.add(role);
    takenPos.add(pos);
  }

  const roleOf = {} as Record<Position, RoleId>;
  for (const role of roleIds) {
    const p = posOf[role];
    if (p) roleOf[p] = role;
  }
  return { posOf, roleOf };
}

// --- Baking (curves, arrive-decel, stagger, separation, defenders) ---

const SAMPLES = 6; // dense samples per curved role (piecewise-linear reads as a curve)
const GOAL_SIDE = 0.06; // how far goal-side of his man a defender sits (attacking-frame depth)
const DEF_LATENCY = 0.16; // defender reaction, as a fraction of preShotMs
const DEF_OPEN_LATENCY = 0.12; // extra latency when the shot reads open (late closeout)
const MIN_GAP = 0.18; // min spacing between offensive spots (aspect-corrected fraction)
const ASPECT = COURT.length / COURT.width; // to compare gaps on both axes fairly

/** Quadratic ease-out so samples bunch near the target (deceleration into a spot). */
function easeOutArrive(u: number): number {
  return 1 - (1 - u) * (1 - u);
}

/** Sample a spline over `[startMs, arriveMs]` (arrive-eased), holding through the shot then resetting. */
function sampleRolePath(
  base: Frac,
  control: Frac[],
  startMs: number,
  arriveMs: number,
  holdUntil: number,
  totalMs: number
): Waypoint[] {
  const combined = [base, ...control]; // run from the defensive base up through the role path
  const final = control[control.length - 1];
  const wps: Waypoint[] = [{ atMs: 0, frac: base }];
  if (startMs > 0.5) wps.push({ atMs: startMs, frac: base }); // stagger: hold at base
  for (let s = 1; s <= SAMPLES; s++) {
    const u = s / SAMPLES;
    const atMs = startMs + easeOutArrive(u) * (arriveMs - startMs);
    wps.push({ atMs, frac: catmullRom(combined, u) });
  }
  if (holdUntil > arriveMs + 1) wps.push({ atMs: holdUntil, frac: final });
  wps.push({ atMs: totalMs, frac: base });
  return strictlyIncreasingByMs(wps);
}

/** One relaxation pass pushing any two final spots apart to keep NBA-like spacing. */
function separate(spots: Frac[]): void {
  for (let i = 0; i < spots.length; i++) {
    for (let j = i + 1; j < spots.length; j++) {
      const dx = spots[j].x - spots[i].x;
      const dy = (spots[j].y - spots[i].y) * ASPECT;
      const d = Math.hypot(dx, dy);
      if (d > 0 && d < MIN_GAP) {
        const push = (MIN_GAP - d) / 2 / d;
        spots[i] = { x: clampToCourt(spots[i].x - dx * push), y: clampToCourt(spots[i].y - (dy * push) / ASPECT) };
        spots[j] = { x: clampToCourt(spots[j].x + dx * push), y: clampToCourt(spots[j].y + (dy * push) / ASPECT) };
      }
    }
  }
}

export interface Budget {
  preShotMs: number;
  totalMs: number;
  holdUntil: number; // preShotMs + flight: sprites hold their spot through the shot
}

export interface Instantiated {
  movers: Partial<Record<SpriteKey, Waypoint[]>>;
  ball: BallLeg[];
}

/**
 * Turn a selected template into baked movers (offense + reacting defense) + a
 * multi-pass ball script, anchored to the real players and court.
 * `shotSpot` replaces the scorer's authored final spot so the ball/ignite/burst
 * stay registered.
 */
export function instantiateTemplate(
  template: PlayTemplate,
  event: SimEvent,
  roles: RoleAssignment,
  budget: Budget,
  mode: 'full' | 'highlights',
  shotSpot: Frac,
  contest: Contest
): Instantiated {
  const off = event.team;
  const def: SimTeamSide = off === 'home' ? 'away' : 'home';
  const { preShotMs, totalMs, holdUntil } = budget;

  // Resolve each role's control points to screen fractions; the terminal role's
  // last point becomes the true shot spot.
  const roleIds = Object.keys(template.roles) as RoleId[];
  const roleControl: Partial<Record<RoleId, Frac[]>> = {};
  const finalOf: Partial<Record<RoleId, Frac>> = {};
  for (const roleId of roleIds) {
    const spec = template.roles[roleId]!;
    const pts = spec.control.map(([x, d]) => attackFrac(off, x, d));
    if (roleId === template.terminal) pts[pts.length - 1] = shotSpot;
    roleControl[roleId] = pts;
    finalOf[roleId] = pts[pts.length - 1];
  }

  // Spacing: relax the five final spots, then write the adjusted spot back as each
  // role's last control point (Highlights skips this — only two movers).
  if (mode === 'full') {
    const spots = roleIds.map((r) => ({ ...finalOf[r]! }));
    // Never move the scorer's shot spot (the ball/ignite depend on it).
    const termIdx = roleIds.indexOf(template.terminal);
    separate(spots);
    for (let i = 0; i < roleIds.length; i++) {
      if (i === termIdx) continue; // pin the shooter
      const pts = roleControl[roleIds[i]]!;
      pts[pts.length - 1] = spots[i];
      finalOf[roleIds[i]] = spots[i];
    }
  }

  const movers: Partial<Record<SpriteKey, Waypoint[]>> = {};
  const highlightsRoles = new Set<RoleId>([template.terminal, template.feeder ?? template.terminal]);

  // Offense.
  for (const roleId of roleIds) {
    if (mode === 'highlights' && !highlightsRoles.has(roleId)) continue;
    const pos = roles.posOf[roleId];
    if (!pos) continue;
    const spec = template.roles[roleId]!;
    const base = spotFraction(off, pos, null);
    const startMs = spec.start * preShotMs;
    const arriveMs = Math.max(startMs + 1, spec.arrive * preShotMs);
    movers[spriteKey(off, pos)] = sampleRolePath(
      base,
      roleControl[roleId]!,
      startMs,
      arriveMs,
      holdUntil,
      totalMs
    );
  }

  // Defense: each defender pursues his man goal-side, a reaction beat late (full mode).
  if (mode === 'full') {
    const rim = rimCenterFraction(off); // the rim the defense protects
    const latency = (DEF_LATENCY + (contest === 'open' ? DEF_OPEN_LATENCY : 0)) * preShotMs;
    for (const pos of POSITIONS) {
      const roleId = roles.roleOf[pos];
      const manFinal = roleId ? finalOf[roleId]! : spotFraction(off, pos, off);
      const defBase = spotFraction(def, pos, null);
      const matched = pos === event.scorerPosition;
      // Sit between his man and the rim (a tighter contest on the scorer).
      const guardSpot = matched
        ? lerpFrac(shotSpot, rim, 0.26)
        : lerpFrac(manFinal, rim, GOAL_SIDE * 2);
      const arriveMs = Math.min(totalMs - 2, preShotMs + latency);
      const midMs = Math.min(arriveMs - 1, preShotMs * 0.6 + latency);
      movers[spriteKey(def, pos)] = strictlyIncreasingByMs([
        { atMs: 0, frac: defBase },
        { atMs: midMs, frac: lerpFrac(defBase, guardSpot, 0.55) },
        { atMs: arriveMs, frac: guardSpot },
        { atMs: Math.min(totalMs - 1, holdUntil + latency), frac: guardSpot },
        { atMs: totalMs, frac: defBase },
      ]);
    }
  }

  // Ball script: resolve each leg's endpoints to the role's spot AT the leg's time.
  const ball: BallLeg[] = [];
  const assisted = !!event.assist && isMadeShot(event);
  const legSpecs =
    mode === 'highlights'
      ? template.ball.filter((l) => l.kind !== 'carry' || template.ball.length === 1)
      : template.ball;
  for (const leg of legSpecs) {
    // Drop the credited (final) pass entirely when the play was unassisted; the
    // ball is simply carried to the shooter instead.
    const isFinal = leg === template.ball[template.ball.length - 1];
    const fromPos = roles.posOf[leg.from];
    const toPos = roles.posOf[leg.to];
    if (!fromPos || !toPos) continue;
    if (isFinal && leg.kind !== 'carry' && !assisted) {
      // Extend a preceding carry to the shooter instead of a phantom pass.
      const carry = ball[ball.length - 1];
      if (carry) {
        carry.to = sampleAt(movers[spriteKey(off, toPos)], leg.end * preShotMs) ?? finalOf[template.terminal]!;
        carry.ms = leg.end * preShotMs - carry.startMs;
      }
      continue;
    }
    const fromWps = movers[spriteKey(off, fromPos)];
    const toWps = movers[spriteKey(off, toPos)];
    const startMs = leg.start * preShotMs;
    const endMs = leg.end * preShotMs;
    // An assisted dunk to a rim finisher reads as an alley-oop: arc it as a lob.
    const kind: BallLegKind = isFinal && leg.kind === 'pass' && event.action === 'dunk' ? 'lob' : leg.kind;
    ball.push({
      kind,
      from: sampleAt(fromWps, startMs) ?? spotFraction(off, fromPos, null),
      to: isFinal ? shotSpot : sampleAt(toWps, endMs) ?? finalOf[roles.roleOf[toPos]]!,
      startMs,
      ms: endMs - startMs,
    });
  }
  // Guarantee the ball ends at the shot spot exactly when the shot fires.
  if (ball.length > 0) {
    const last = ball[ball.length - 1];
    last.to = shotSpot;
    last.ms = preShotMs - last.startMs;
  }

  return { movers, ball };
}

/** The frac a mover occupies at time `atMs` (piecewise-linear over its waypoints). */
function sampleAt(wps: Waypoint[] | undefined, atMs: number): Frac | undefined {
  if (!wps || wps.length === 0) return undefined;
  if (atMs <= wps[0].atMs) return wps[0].frac;
  const last = wps[wps.length - 1];
  if (atMs >= last.atMs) return last.frac;
  for (let i = 1; i < wps.length; i++) {
    if (atMs <= wps[i].atMs) {
      const a = wps[i - 1];
      const b = wps[i];
      const t = (atMs - a.atMs) / (b.atMs - a.atMs || 1);
      return lerpFrac(a.frac, b.frac, t);
    }
  }
  return last.frac;
}
