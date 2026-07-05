import { spotFraction, rimCenterFraction } from './courtGeometry';
import { shotShapeFor, WINNER_TIME_SCALE } from './possession';
import {
  TEMPLATES,
  selectTemplate,
  assignRoles,
  deriveContest,
  instantiateTemplate,
} from './playTemplates';
import {
  lerpFrac,
  spriteKey,
  strictlyIncreasingByMs,
  type Frac,
  type SpriteKey,
} from './courtMath';
import { FLIGHT_DURATION_MAX, resolveDurationFor, type ShotShape } from '@/feel/ballPath';
import { scaled } from '@/feel/timings';
import { type Position } from '@/types/roster';
import { isMadeShot, type SimEvent, type SimTeamSide } from '@/types/sim';

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
  ball: BallPlan;
  camera: CameraPlan;
}

const otherSide = (side: SimTeamSide): SimTeamSide => (side === 'home' ? 'away' : 'home');

// --- Pre-shot windows (unscaled). Real NBA ratios, compressed for a skippable watch:
// half-court possessions develop over a real trip up the floor; transition is quicker. ---
const PRESHOT = {
  halfCourt: 640, // advance -> initiate -> primary action
  halfCourtAssistBonus: 100, // room for the extra pass
  transition: 460, // compressed: sprint lanes -> finish
  highlights: 220, // a brief settle before the shot
  highlightsAssistBonus: 160, // the assist pass
} as const;

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

/** The scorer's spot when the shot goes up, biased toward the rim by the action. */
function shotSpotFor(event: SimEvent): Frac {
  const adv = spotFraction(event.team, event.scorerPosition, event.team);
  const rim = rimCenterFraction(event.team);
  switch (event.action) {
    case 'dunk':
      return lerpFrac(adv, rim, 0.72);
    case 'layup':
    case 'drive':
      return lerpFrac(adv, rim, 0.5);
    case 'post':
      return lerpFrac(adv, rim, 0.34);
    case 'midrange':
      return lerpFrac(adv, rim, 0.18);
    case 'three':
    default:
      return adv;
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
  cameraFollow = true
): PossessionPlan {
  const shape = shotShapeFor(event);
  const shooterKey = spriteKey(event.team, event.scorerPosition);
  const shotSpot = shotSpotFor(event);
  const timeScale = cinema ? WINNER_TIME_SCALE : 1;
  const reducedBaseMs = reducedBaseFor(event);
  const flight = FLIGHT_DURATION_MAX + resolveDurationFor(shape);
  const assisted = !!event.assist && isMadeShot(event);
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
      ball: { legs: [], origin: shotSpot },
      camera: { keys: [{ atMs: 0, center: CENTER, zoom: CAM.rest }, { atMs: HL_ROUTINE_MS, center: CENTER, zoom: CAM.rest }] },
    };
  }

  const template = TEMPLATES[selectTemplate(event, prevEvent)];
  const roles = assignRoles(template, event);
  const contest = deriveContest(event);

  // Pre-shot window + total budget.
  let preShotMs: number;
  if (mode === 'highlights') {
    preShotMs = PRESHOT.highlights + (assisted ? PRESHOT.highlightsAssistBonus : 0);
  } else if (template.transition) {
    preShotMs = PRESHOT.transition + (assisted ? PRESHOT.halfCourtAssistBonus * 0.5 : 0);
  } else {
    preShotMs = PRESHOT.halfCourt + (assisted ? PRESHOT.halfCourtAssistBonus : 0);
  }
  const postMs =
    mode === 'highlights'
      ? event.isBigPlay
        ? HL_LINGER.big
        : HL_LINGER.make
      : (rebounds ? POST.rebound : 0) + POST.reset + lingerFullFor(event);
  const totalMs = preShotMs + flight + postMs;
  const holdUntil = preShotMs + flight;

  const inst = instantiateTemplate(
    template,
    event,
    roles,
    { preShotMs, totalMs, holdUntil },
    mode,
    shotSpot,
    contest
  );
  const movers = inst.movers;

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
    ball: { legs: inst.ball, origin: shotSpot },
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
