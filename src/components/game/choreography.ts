import { spotFraction, rimCenterFraction } from './courtGeometry';
import { shotShapeFor, WINNER_TIME_SCALE } from './possession';
import { FLIGHT_DURATION_MAX, resolveDurationFor, type ShotShape } from '@/feel/ballPath';
import { scaled } from '@/feel/timings';
import { POSITIONS, type Position } from '@/types/roster';
import { isMadeShot, type SimEvent, type SimTeamSide } from '@/types/sim';

/**
 * Possession theater: pure, deterministic choreography that turns one SimEvent
 * (an outcome) into a timed plan the watch dramatizes: the offense runs the floor
 * into a set, the passer feeds the shooter on an assist, the shot goes up, the
 * ball resolves, a rebounder secures a miss, then everyone resets. No React, no
 * randomness (every "choice" is a pure function of seq), no court size baked in
 * beyond fractions (0..1). The renderer (CourtView / BallFlight) scales the beat
 * durations by playback speed and resolves the fractions to pixels.
 *
 * The sim is untouched: this only reads the recorded event. Under reduced motion
 * or highlights' routine plays the renderer ignores the movement and the plan just
 * supplies the snappy gap (planDurationMs), so those paths behave exactly as before.
 */

/** A fractional court position (0..1 on each axis). */
export interface Frac {
  x: number;
  y: number;
}

/** `${side}-${position}`, e.g. 'home-PG'. Identifies a sprite on the floor. */
export type SpriteKey = `${SimTeamSide}-${Position}`;

/** One point on a sprite's path: be at `frac` by `atMs` (cumulative, unscaled). */
export interface Waypoint {
  atMs: number;
  frac: Frac;
}

/** A pre-shot ball leg: the ball carried up the floor, or the assist pass. */
export interface BallLeg {
  from: Frac;
  to: Frac;
  /** Unscaled duration; the renderer scales by speed x timeScale. */
  ms: number;
}

/** Where the ball goes before and up to the shot release. */
export interface BallPlan {
  /** The ball dribbled up the floor with the handler (absent when there's no lead-in). */
  carry?: BallLeg;
  /** The assist pass from the credited passer to the shooter (assisted makes only). */
  pass?: BallLeg;
  /** The shot origin: the shooter's spot when the ball leaves their hands. */
  origin: Frac;
}

/** Which watch mode a plan was built for. */
export type WatchMode = 'full' | 'highlights';

/**
 * The full choreography for one possession. `movers` lists only the sprites that
 * move (others hold their defensive base and just idle-bob, as before). `ball`
 * drives the live ball. `totalMs`/`reducedBaseMs`/`timeScale` own the pacing so
 * the scheduler and the renderer read one budget (feel convention: budgets live
 * in the plan).
 */
export interface PossessionPlan {
  seq: number;
  /** Full unscaled possession length; the scheduler waits scaled(totalMs x timeScale). */
  totalMs: number;
  /** Unscaled time from possession start to the shot release (ball leaves for the rim). */
  preShotMs: number;
  /** The snappy gap under reduced motion (the former reduced-motion pacing, now removed). */
  reducedBaseMs: number;
  /** 1, or WINNER_TIME_SCALE on the one game-deciding shot (slow-mo cinema). */
  timeScale: number;
  /** How the shot reads in the air. */
  shape: ShotShape;
  /** The scorer's sprite key. */
  shooterKey: SpriteKey;
  /** True when the scorer throws down a dunk (drives the slam squash overlay). */
  dunk: boolean;
  /** The shooter's shot spot (the ignite burst and hot-ball origin anchor here). */
  igniteFrac: Frac;
  /** Per-sprite waypoint paths for the sprites that move this possession. */
  movers: Partial<Record<SpriteKey, Waypoint[]>>;
  ball: BallPlan;
}

export function spriteKey(side: SimTeamSide, position: Position): SpriteKey {
  return `${side}-${position}`;
}

/** Resolve a court fraction (0..1) to pixels for the measured floor. */
export function fracToPx(f: Frac, width: number, height: number): { x: number; y: number } {
  return { x: f.x * width, y: f.y * height };
}

// --- Beat durations (unscaled). Tuned so a full possession reads as a real trip
// up the floor while staying skippable; highlights stay tight. ---
const FULL = {
  advance: 520, // offense runs base -> set, ball dribbled up
  pass: 200, // the assist pass leg
  rebound: 240, // a rebounder secures a miss/block
  reset: 200, // everyone drifts back toward the set
  lingerWinner: 300,
  lingerBig: 140,
  lingerMake: 70,
  lingerOther: 40,
} as const;

const HL = {
  pad: 220, // a brief settle so a highlight doesn't hard-cut into the shot
  pass: 200,
  lingerBig: 140,
  lingerMake: 90,
} as const;

/** The routine-highlights blow-past gap (the former 60ms scheduler floor). */
const HL_ROUTINE_MS = 60;

const otherSide = (side: SimTeamSide): SimTeamSide => (side === 'home' ? 'away' : 'home');

function lerpFrac(a: Frac, b: Frac, t: number): Frac {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** The scorer's spot when the shot goes up, biased toward the rim by the action. */
function shotSpotFor(event: SimEvent): Frac {
  const adv = spotFraction(event.team, event.scorerPosition, event.team);
  const rim = rimCenterFraction(event.team);
  switch (event.action) {
    case 'dunk':
      return lerpFrac(adv, rim, 0.72); // rises right at the rim
    case 'layup':
    case 'drive':
      return lerpFrac(adv, rim, 0.5); // attacks into the paint
    case 'post':
      return lerpFrac(adv, rim, 0.34); // backs down on the block
    case 'midrange':
      return lerpFrac(adv, rim, 0.18); // steps into a pull-up
    case 'three':
    default:
      return adv; // spots up behind the arc
  }
}

/**
 * The offensive set spot for a non-scorer: their advanced spot, nudged by the
 * play so the floor reads as spacing/cutting rather than five men jogging in
 * parallel. Deterministic in seq so a replay is identical.
 */
function offSetFor(event: SimEvent, position: Position): Frac {
  const adv = spotFraction(event.team, position, event.team);
  const rim = rimCenterFraction(event.team);
  // A rim attack clears the strong-side wing to the corner (one cutter, seq-picked).
  const cutter = event.seq % 2 === 0 ? 'SG' : 'SF';
  if ((event.action === 'drive' || event.action === 'layup' || event.action === 'dunk') && position === cutter) {
    return { x: adv.x < 0.5 ? adv.x - 0.06 : adv.x + 0.06, y: lerpFrac(adv, rim, 0.12).y };
  }
  // A post-up sends the other big to the weak-side block for a spacing look.
  if (event.action === 'post' && (position === 'PF' || position === 'C') && position !== event.scorerPosition) {
    return lerpFrac(adv, rim, 0.22);
  }
  return adv;
}

/**
 * The defender's spot: goal-side of the man they guard. The matched defender (the
 * scorer's slot) steps up to contest; the rest collapse a touch toward their rim.
 */
function defSpotFor(event: SimEvent, position: Position): Frac {
  const defSide = otherSide(event.team);
  const base = spotFraction(defSide, position, null);
  const rim = rimCenterFraction(event.team); // the rim the defense protects
  if (position === event.scorerPosition) {
    // Contest: sit between the shooter's spot and the rim.
    return lerpFrac(shotSpotFor(event), rim, 0.28);
  }
  // Help: a small shift toward the offensive man's set and the rim.
  const man = offSetFor(event, position);
  return lerpFrac(base, lerpFrac(man, rim, 0.4), 0.4);
}

/** Waypoints that go base -> target by preShot, hold through the shot, then reset. */
function movePath(base: Frac, target: Frac, preShotMs: number, holdMs: number, totalMs: number): Waypoint[] {
  const holdAt = Math.min(preShotMs + holdMs, totalMs - 1);
  const path: Waypoint[] = [
    { atMs: 0, frac: base },
    { atMs: preShotMs, frac: target },
  ];
  if (holdAt > preShotMs) path.push({ atMs: holdAt, frac: target });
  path.push({ atMs: totalMs, frac: base });
  return path;
}

function lingerFullFor(event: SimEvent): number {
  if (event.callout === 'BUZZER BEATER!') return FULL.lingerWinner;
  if (event.isBigPlay) return FULL.lingerBig;
  if (isMadeShot(event)) return FULL.lingerMake;
  return FULL.lingerOther;
}

/** The former reduced-motion gap for an event (kept identical to preserve that path). */
function reducedBaseFor(event: SimEvent): number {
  if (event.isBigPlay) return 220;
  if (isMadeShot(event)) return 150;
  return 90;
}

/**
 * Build the possession plan for one event in the given watch mode. `cinema` marks
 * the one game-deciding shot (slow-mo). Pure and deterministic.
 */
export function buildPossessionPlan(
  event: SimEvent,
  mode: WatchMode,
  cinema: boolean
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
      ball: { origin: shotSpot },
    };
  }

  if (mode === 'highlights') {
    // A noteworthy highlight: a short pad, the assist pass if any, the shot.
    const preShotMs = HL.pad + (assisted ? HL.pass : 0);
    const linger = event.isBigPlay ? HL.lingerBig : HL.lingerMake;
    const totalMs = preShotMs + flight + linger;
    const movers: Partial<Record<SpriteKey, Waypoint[]>> = {};
    // Only the shooter (and passer) move, so highlights stay tight.
    const shooterBase = spotFraction(event.team, event.scorerPosition, null);
    movers[shooterKey] = movePath(shooterBase, shotSpot, preShotMs, flight, totalMs);
    const ball: BallPlan = { origin: shotSpot };
    if (assisted && event.assist) {
      const passerKey = spriteKey(event.team, event.assist.position);
      const passerSpot = offSetFor(event, event.assist.position);
      const passerBase = spotFraction(event.team, event.assist.position, null);
      if (passerKey !== shooterKey) {
        movers[passerKey] = movePath(passerBase, passerSpot, HL.pad, flight, totalMs);
      }
      ball.pass = { from: passerSpot, to: shotSpot, ms: HL.pass };
    }
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
      ball,
    };
  }

  // Full mode: the whole floor runs the possession.
  const preShotMs = FULL.advance + (assisted ? FULL.pass : 0);
  const postMs = (rebounds ? FULL.rebound : 0) + FULL.reset + lingerFullFor(event);
  const totalMs = preShotMs + flight + postMs;

  const movers: Partial<Record<SpriteKey, Waypoint[]>> = {};

  // Offense advances into its set; the scorer ends at the shot spot.
  for (const pos of POSITIONS) {
    const k = spriteKey(event.team, pos);
    const base = spotFraction(event.team, pos, null);
    const target = pos === event.scorerPosition ? shotSpot : offSetFor(event, pos);
    movers[k] = movePath(base, target, preShotMs, flight, totalMs);
  }

  // Defense shifts to guard; the matched defender contests.
  const defSide = otherSide(event.team);
  for (const pos of POSITIONS) {
    const k = spriteKey(defSide, pos);
    const base = spotFraction(defSide, pos, null);
    movers[k] = movePath(base, defSpotFor(event, pos), preShotMs, flight, totalMs);
  }

  // The rebounder steps to the rim on a miss/block (cosmetic; the box owns the
  // stat). Defense grabs it ~73% of the time (matching the sim's rebound bias).
  const rim = rimCenterFraction(event.team);
  if (rebounds) {
    const defensiveBoard = event.seq % 100 >= 27; // ~73% defensive
    const boardSide = defensiveBoard ? defSide : event.team;
    // Pick a big by a seq walk so back-to-back boards vary.
    const bigs: Position[] = ['C', 'PF', 'SF'];
    const rebPos = bigs[event.seq % bigs.length];
    const k = spriteKey(boardSide, rebPos);
    const base = spotFraction(boardSide, rebPos, null);
    const secureAt = preShotMs + flight; // the ball is at the rim by now
    // Step to the glass, secure, then drift out.
    movers[k] = [
      { atMs: 0, frac: base },
      { atMs: secureAt, frac: lerpFrac(base, rim, 0.7) },
      { atMs: Math.min(secureAt + FULL.rebound, totalMs - 1), frac: lerpFrac(base, rim, 0.55) },
      { atMs: totalMs, frac: base },
    ];
  }

  // The live ball: dribbled up by the handler, passed on an assist, then shot.
  const ball: BallPlan = { origin: shotSpot };
  if (assisted && event.assist) {
    const passerSpot = offSetFor(event, event.assist.position);
    const passerBase = spotFraction(event.team, event.assist.position, null);
    ball.carry = { from: passerBase, to: passerSpot, ms: FULL.advance };
    ball.pass = { from: passerSpot, to: shotSpot, ms: FULL.pass };
  } else {
    const shooterBase = spotFraction(event.team, event.scorerPosition, null);
    ball.carry = { from: shooterBase, to: shotSpot, ms: FULL.advance };
  }

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
    ball,
  };
}

/**
 * The scheduler gap for a possession: scaled(total x timeScale) normally, or the
 * snappy reduced-motion gap. `scaled` is the single speed knob, applied once (the
 * whole watch's pacing flows through it, as the former eventGapMs did).
 */
export function planDurationMs(plan: PossessionPlan, reducedMotion: boolean, speed: number): number {
  if (reducedMotion) return scaled(plan.reducedBaseMs, speed);
  return scaled(plan.totalMs * plan.timeScale, speed);
}
