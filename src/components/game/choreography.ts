import { spotFraction, rimCenterFraction, attackFrac } from './courtGeometry';
import { shotShapeFor, WINNER_TIME_SCALE } from './possession';
import { buildMotionPlan } from './motion';
import { neutralCtx } from './motion/ratings';
import { deriveContest } from './motion/outcome';
import type { MotionCtx } from './motion/types';
import {
  lerpFrac,
  spriteKey,
  strictlyIncreasingByMs,
  type Frac,
  type SpriteKey,
} from './courtMath';
import { FLIGHT_DURATION_MAX, resolveDurationFor, type ShotShape } from '@/feel/ballPath';
import { scaled } from '@/feel/timings';
import { deriveSeed } from '@/game/rng';
import { type Position } from '@/types/roster';
import { isMadeShot, type SimActionId, type SimEvent, type SimTeamSide } from '@/types/sim';

// Re-exported so the renderer keeps importing court primitives from one place.
export { spriteKey, fracToPx, type Frac, type SpriteKey } from './courtMath';

/**
 * Possession theater: pure, deterministic choreography that turns one SimEvent (an
 * outcome) into a believable NBA possession. A play-template library (playTemplates.ts)
 * picks a real action from the statistical fields (pick-and-roll, hand-off, pin-down,
 * post-up, iso, spot-up, transition), assigns the five on-court positions to its roles,
 * and bakes curved, staggered, decelerating movement + a multi-pass ball + reacting
 * defenders. A ball-following camera plan frames it all. No React, no randomness (every
 * choice is a pure function of `seq`), no court size baked in beyond fractions (0..1).
 *
 * The sim is untouched: this only reads the recorded event. Under reduced motion or
 * highlights' routine plays the renderer ignores the movement and the plan just supplies
 * the snappy gap (planDurationMs), so those paths behave exactly as before.
 */

/** One point on a sprite's path: be at `frac` by `atMs` (cumulative, unscaled). */
export interface Waypoint {
  atMs: number;
  frac: Frac;
}

/** How a ball leg reads in the air (selects its arc peak + easing at render). */
export type BallLegKind = 'carry' | 'handoff' | 'pass' | 'lob';

/** One pre-shot ball leg: the ball dribbled, handed off, passed, or lobbed. */
export interface BallLeg {
  from: Frac;
  to: Frac;
  /** When the leg begins (cumulative, unscaled) — legs may have gaps (ball held). */
  startMs: number;
  /** Unscaled duration; the renderer scales by speed x timeScale. */
  ms: number;
  kind: BallLegKind;
  /**
   * A dense polyline the ball rides (a `carry`: the dribbler's exact baked path,
   * resampled on the same time basis so the ball stays glued to the handler rather
   * than chording across the curve). Undefined for a straight two-point arc
   * (pass/handoff/lob); when present, `from`/`to` equal its first/last point.
   */
  path?: Frac[];
}

/** The live ball's pre-shot path (the shot leg itself is derived by the renderer). */
export interface BallPlan {
  /** Ordered pre-shot legs; the last ends at `origin` (the credited assist). */
  legs: BallLeg[];
  /** The shot origin: the shooter's spot when the ball leaves their hands. */
  origin: Frac;
}

/** One frame of the broadcast camera: center court fraction + zoom, at `atMs`. */
export interface CameraKeyframe {
  atMs: number;
  center: Frac;
  zoom: number;
}

/** The per-possession camera track (identity keyframes = a fixed wide view). */
export interface CameraPlan {
  keys: CameraKeyframe[];
}

/** Which watch mode a plan was built for. */
export type WatchMode = 'full' | 'highlights';

/**
 * The full choreography for one possession. `movers` lists only the sprites that
 * move; others hold their defensive base and idle-bob. `totalMs`/`reducedBaseMs`/
 * `timeScale` own the pacing so the scheduler and the renderer read one budget.
 */
export interface PossessionPlan {
  seq: number;
  totalMs: number;
  preShotMs: number;
  reducedBaseMs: number;
  timeScale: number;
  shape: ShotShape;
  shooterKey: SpriteKey;
  dunk: boolean;
  igniteFrac: Frac;
  movers: Partial<Record<SpriteKey, Waypoint[]>>;
  /**
   * Per-mover travel window `[startMs, endMs]` (the burst before the plant). The
   * renderer runs the stride run-hop only inside it, so a sprite that has arrived
   * stops hopping (no perpetual run-in-place). A mover with no entry never hops.
   */
  moverBursts: Partial<Record<SpriteKey, { startMs: number; endMs: number }>>;
  ball: BallPlan;
  camera: CameraPlan;
}

const otherSide = (side: SimTeamSide): SimTeamSide => (side === 'home' ? 'away' : 'home');

const POST = {
  rebound: 240, // a rebounder secures a miss/block
  reset: 200, // everyone drifts back toward the set
  lingerWinner: 300,
  lingerBig: 140,
  lingerMake: 70,
  lingerOther: 40,
} as const;

const HL_LINGER = { big: 140, make: 90 } as const;

/** The routine-highlights blow-past gap (the former 60ms scheduler floor). */
const HL_ROUTINE_MS = 60;

// --- Camera framing (kept gentle: a broadcast lean, not a lurch, since it fires
// every possession on a phone-size court) ---
const CAM = {
  rest: 1.0,
  advance: 1.2,
  attack: 1.5,
  shot: 1.6,
  cinemaShot: 1.75,
  rebound: 1.2,
} as const;

/**
 * The finisher's across-court x (attacking frame), varied by seq so shot spots
 * spread realistically: threes rotate corner/wing/top, midrange the elbows/wings,
 * rim finishes near the lane, post-ups on a block. The engine's play sampler then
 * chooses HOW the finisher gets there; this only fixes WHERE the shot is authored.
 */
function finisherX(event: SimEvent): number {
  const s = event.seq;
  switch (event.action as SimActionId) {
    case 'three':
      return [0.08, 0.92, 0.2, 0.8, 0.5][s % 5];
    case 'midrange':
      return [0.36, 0.64, 0.5, 0.28, 0.72][s % 5];
    case 'drive':
      return [0.4, 0.6, 0.5][s % 3];
    case 'layup':
      return [0.42, 0.58, 0.5][s % 3];
    case 'dunk':
      return [0.46, 0.54, 0.5][s % 3];
    case 'post':
      return s % 2 ? 0.58 : 0.42;
    default:
      return 0.5;
  }
}

/**
 * The scorer's spot when the shot goes up, authored at a REAL front-court location
 * in the attacking frame (depth 1 = the rim), not derived from the shallow
 * offensive-advance. `terminalX` is where the scorer stands, so a corner three
 * stays in the corner; rim finishes converge toward the lane. depth: three 0.72
 * (corners 0.85), midrange 0.80, drive 0.87, layup 0.92, dunk 0.94, post 0.86.
 */
function shotSpotFor(event: SimEvent, terminalX: number): Frac {
  const team = event.team;
  // Pull x toward the rim lane (0.5) as the finish attacks the basket.
  const towardLane = (x: number, f: number) => x + (0.5 - x) * f;
  switch (event.action) {
    case 'dunk':
      return attackFrac(team, towardLane(terminalX, 0.7), 0.94);
    case 'layup':
      return attackFrac(team, towardLane(terminalX, 0.6), 0.92);
    case 'drive':
      return attackFrac(team, towardLane(terminalX, 0.4), 0.87);
    case 'post':
      return attackFrac(team, terminalX < 0.5 ? 0.42 : 0.58, 0.86);
    case 'midrange':
      return attackFrac(team, towardLane(terminalX, 0.15), 0.8);
    case 'three':
    default: {
      const corner = Math.abs(terminalX - 0.5) > 0.34;
      return attackFrac(team, terminalX, corner ? 0.85 : 0.72);
    }
  }
}

function lingerFullFor(event: SimEvent): number {
  if (event.callout === 'BUZZER BEATER!') return POST.lingerWinner;
  if (event.isBigPlay) return POST.lingerBig;
  if (isMadeShot(event)) return POST.lingerMake;
  return POST.lingerOther;
}

/** The former reduced-motion gap for an event (kept identical to preserve that path). */
function reducedBaseFor(event: SimEvent): number {
  if (event.isBigPlay) return 220;
  if (isMadeShot(event)) return 150;
  return 90;
}

/** Clamp a camera center so the frame never leaves the court (dead apron out of shot). */
function clampCenter(center: Frac, zoom: number): Frac {
  const half = 0.5 / zoom;
  return {
    x: Math.max(half, Math.min(1 - half, center.x)),
    y: Math.max(half, Math.min(1 - half, center.y)),
  };
}

const CENTER: Frac = { x: 0.5, y: 0.5 };

/**
 * The broadcast camera track: wide for transition, pushed into the attacking half for
 * a half-court set, a small lean on the shot, wide again on the rebound/reset. Every
 * possession ends wide so the swing to the other end reads as a cut, not a hard pan.
 */
function buildCameraPlan(
  event: SimEvent,
  mode: WatchMode,
  cinema: boolean,
  cameraFollow: boolean,
  ctx: { preShotMs: number; flight: number; totalMs: number; shotSpot: Frac; rebounds: boolean }
): CameraPlan {
  const { preShotMs, flight, totalMs, shotSpot, rebounds } = ctx;
  if (!cameraFollow || preShotMs <= 0) {
    return { keys: [{ atMs: 0, center: CENTER, zoom: CAM.rest }, { atMs: Math.max(1, totalMs), center: CENTER, zoom: CAM.rest }] };
  }
  const rim = rimCenterFraction(event.team);
  const setCenter = lerpFrac(shotSpot, rim, 0.25);
  const shotZoom = cinema ? CAM.cinemaShot : CAM.shot;
  // Each keyframe's center is clamped to ITS zoom so the frame never leaves the court.
  const key = (atMs: number, center: Frac, zoom: number): CameraKeyframe => ({
    atMs,
    center: clampCenter(center, zoom),
    zoom,
  });
  const keys: CameraKeyframe[] = [];
  if (mode === 'highlights') {
    const advZoom = CAM.advance + 0.15;
    keys.push(key(0, setCenter, advZoom));
    keys.push(key(preShotMs, setCenter, CAM.attack));
    keys.push(key(preShotMs + flight, shotSpot, shotZoom));
    keys.push({ atMs: totalMs, center: CENTER, zoom: CAM.rest });
    return { keys: strictlyIncreasingByMs(keys) };
  }
  keys.push({ atMs: 0, center: CENTER, zoom: CAM.rest });
  keys.push(key(preShotMs * 0.45, lerpFrac(CENTER, setCenter, 0.6), CAM.advance));
  keys.push(key(preShotMs, setCenter, CAM.attack));
  keys.push(key(preShotMs + flight * 0.6, shotSpot, shotZoom));
  keys.push(key(preShotMs + flight, shotSpot, shotZoom));
  if (rebounds) keys.push(key(preShotMs + flight + POST.rebound, lerpFrac(shotSpot, CENTER, 0.6), CAM.rebound));
  keys.push({ atMs: totalMs, center: CENTER, zoom: CAM.rest });
  return { keys: strictlyIncreasingByMs(keys) };
}

/**
 * Build the possession plan for one event in the given watch mode. `cinema` marks the
 * one game-deciding shot (slow-mo). `prevEvent` lets us read transition-vs-halfcourt.
 * Pure and deterministic.
 */
export function buildPossessionPlan(
  event: SimEvent,
  mode: WatchMode,
  cinema: boolean,
  prevEvent?: SimEvent,
  cameraFollow = true,
  motionCtx?: MotionCtx,
  seed?: number,
  nextEvent?: SimEvent
): PossessionPlan {
  const shape = shotShapeFor(event);
  const shooterKey = spriteKey(event.team, event.scorerPosition);
  // Author the shot spot where the finisher shoots from (the engine chooses HOW he
  // gets there); a corner three stays in the corner, a rim finish near the lane.
  const shotSpot = shotSpotFor(event, finisherX(event));
  const timeScale = cinema ? WINNER_TIME_SCALE : 1;
  const reducedBaseMs = reducedBaseFor(event);
  const flight = FLIGHT_DURATION_MAX + resolveDurationFor(shape);
  const rebounds = shape === 'miss' || shape === 'block';

  // Highlights, routine (non-scoring, non-big) play: blow past it, no theater.
  if (mode === 'highlights' && !isMadeShot(event) && !event.isBigPlay) {
    return {
      seq: event.seq,
      totalMs: HL_ROUTINE_MS,
      preShotMs: 0,
      reducedBaseMs: HL_ROUTINE_MS,
      timeScale: 1,
      shape,
      shooterKey,
      dunk: false,
      igniteFrac: shotSpot,
      movers: {},
      moverBursts: {},
      ball: { legs: [], origin: shotSpot },
      camera: { keys: [{ atMs: 0, center: CENTER, zoom: CAM.rest }, { atMs: HL_ROUTINE_MS, center: CENTER, zoom: CAM.rest }] },
    };
  }

  const contest = deriveContest(event);
  const postMs =
    mode === 'highlights'
      ? event.isBigPlay
        ? HL_LINGER.big
        : HL_LINGER.make
      : (rebounds ? POST.rebound : 0) + POST.reset + lingerFullFor(event);

  // The agent engine samples the play, sizes the broadcast pacing, and bakes the
  // movement + ball (or highlights cuts straight to the set). Outcomes untouched.
  const motion = buildMotionPlan({
    event,
    prevEvent,
    nextEvent,
    mode,
    contest,
    shotSpot,
    flight,
    postMs,
    ctx: motionCtx ?? neutralCtx(event),
    seed: seed ?? deriveSeed(0, `poss-${event.seq}`),
  });
  const { preShotMs, totalMs, movers, moverBursts } = motion;

  // The rebounder steps to the rim on a miss/block (cosmetic; the box owns the stat).
  if (rebounds && mode === 'full') {
    const rim = rimCenterFraction(event.team);
    const defSide = otherSide(event.team);
    const defensiveBoard = event.seq % 100 >= 27; // ~73% defensive
    const boardSide = defensiveBoard ? defSide : event.team;
    const bigs: Position[] = ['C', 'PF', 'SF'];
    const rebPos = bigs[event.seq % bigs.length];
    const k = spriteKey(boardSide, rebPos);
    const base = spotFraction(boardSide, rebPos, null);
    const secureAt = preShotMs + flight;
    movers[k] = [
      { atMs: 0, frac: base },
      { atMs: secureAt, frac: lerpFrac(base, rim, 0.7) },
      { atMs: Math.min(secureAt + POST.rebound, totalMs - 1), frac: lerpFrac(base, rim, 0.55) },
      { atMs: totalMs, frac: base },
    ];
    // The crash is this sprite's real travel now (it overwrote its set path), so hop
    // while it works to the glass rather than during a stale spacer window.
    moverBursts[k] = { startMs: 0, endMs: secureAt };
  }

  const camera = buildCameraPlan(event, mode, cinema, cameraFollow, {
    preShotMs,
    flight,
    totalMs,
    shotSpot,
    rebounds,
  });

  return {
    seq: event.seq,
    totalMs,
    preShotMs,
    reducedBaseMs,
    timeScale,
    shape,
    shooterKey,
    dunk: shape === 'dunk',
    igniteFrac: shotSpot,
    movers,
    moverBursts,
    ball: { legs: motion.ball, origin: shotSpot },
    camera,
  };
}

/**
 * The scheduler gap for a possession: scaled(total x timeScale) normally, or the
 * snappy reduced-motion gap. `scaled` is the single speed knob, applied once.
 */
export function planDurationMs(plan: PossessionPlan, reducedMotion: boolean, speed: number): number {
  if (reducedMotion) return scaled(plan.reducedBaseMs, speed);
  return scaled(plan.totalMs * plan.timeScale, speed);
}
