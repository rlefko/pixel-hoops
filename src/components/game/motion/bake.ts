import { lerpFrac, strictlyIncreasingByMs, type Frac, type SpriteKey } from '../courtMath';
import { POSITIONS, type Position } from '@/types/roster';
import type { Waypoint, BallLeg, BallLegKind } from '../choreography';
import type { MotionMovement, OffRole, PossessionScript } from './types';
import type { SimResult } from './simulate';

/**
 * Bakes the raw ~150-frame agent tracks into the renderer's compact structures:
 * Waypoint paths (Douglas-Peucker simplified, <=24, with the base/plant/shot
 * anchors force-kept), per-mover burst windows, and the ball legs (a carry rides
 * the dribbler's baked path, a pass is a two-point arc, the final leg pinned to the
 * shot spot). Pure and Node-safe. The finisher's shot frame is pinned so the
 * recorded outcome is exact.
 */

const MAX_WP = 24;
const EPS_FRAC = 0.006;
const CARRY_SAMPLES = 6;
const MOVE_EPS = 0.012; // total travel below this = a non-mover
const STEP_EPS = 0.0015; // per-20ms displacement above this = "moving" (burst)

type Frame = { atMs: number; frac: Frac };

/** Perpendicular distance from p to the segment a-b, in frac space. */
function perpDist(p: Frac, a: Frac, b: Frac): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return Math.hypot(p.x - px, p.y - py);
}

/** Douglas-Peucker on the (x,y) polyline; returns kept indices (0 and last always). */
function dpKeep(frames: Frame[], eps: number): boolean[] {
  const keep: boolean[] = Array.from({ length: frames.length }, () => false);
  keep[0] = true;
  keep[frames.length - 1] = true;
  const stack: [number, number][] = [[0, frames.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop()!;
    if (hi <= lo + 1) continue;
    let maxD = -1;
    let idx = -1;
    for (let i = lo + 1; i < hi; i++) {
      const d = perpDist(frames[i].frac, frames[lo].frac, frames[hi].frac);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > eps && idx > 0) {
      keep[idx] = true;
      stack.push([lo, idx], [idx, hi]);
    }
  }
  return keep;
}

/** Index of the frame nearest a target ms. */
function nearestIdx(frames: Frame[], ms: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < frames.length; i++) {
    const d = Math.abs(frames[i].atMs - ms);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Simplify one agent's frames to a capped Waypoint[], force-keeping anchors. */
function simplify(frames: Frame[], spawn: Frac, resetTo: Frac, totalMs: number, mustKeepMs: number[], pin?: { ms: number; frac: Frac }): Waypoint[] {
  let eps = EPS_FRAC;
  let wps: Waypoint[] = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    const keep = dpKeep(frames, eps);
    for (const ms of mustKeepMs) keep[nearestIdx(frames, ms)] = true;
    const kept: Waypoint[] = [];
    for (let i = 0; i < frames.length; i++) if (keep[i]) kept.push({ atMs: frames[i].atMs, frac: frames[i].frac });
    wps = kept;
    if (wps.length <= MAX_WP) break;
    eps *= 1.6;
  }
  // Pin exact anchors: the spawn at atMs 0, the reset target at totalMs (a live-ball
  // transition carries these away from base), the shot frame for the finisher.
  wps[0] = { atMs: 0, frac: spawn };
  wps[wps.length - 1] = { atMs: totalMs, frac: resetTo };
  if (pin) {
    const i = wps.findIndex((w) => Math.abs(w.atMs - pin.ms) < 30);
    if (i >= 0) wps[i] = { atMs: pin.ms, frac: pin.frac };
    else wps.push({ atMs: pin.ms, frac: pin.frac });
  }
  wps.sort((a, b) => a.atMs - b.atMs);
  return strictlyIncreasingByMs(wps);
}

/** The burst window [startMs, endMs] where the agent is actually traveling pre-shot. */
function burstOf(frames: Frame[], preShotMs: number): { startMs: number; endMs: number } | undefined {
  let start = -1;
  let end = -1;
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].atMs > preShotMs) break;
    const d = Math.hypot(frames[i].frac.x - frames[i - 1].frac.x, frames[i].frac.y - frames[i - 1].frac.y);
    if (d > STEP_EPS) {
      if (start < 0) start = frames[i - 1].atMs;
      end = frames[i].atMs;
    }
  }
  return start >= 0 && end > start ? { startMs: start, endMs: end } : undefined;
}

/** Sample a Waypoint[] at atMs (piecewise-linear). */
function sampleAt(wps: Waypoint[], atMs: number): Frac {
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

/** Bake the sim result into the renderer's PossessionPlan movement + ball. */
export function bake(sim: SimResult, script: PossessionScript, finisherPos: Position, shotSpot: Frac): MotionMovement {
  const { agents, offSide, preShotMs, totalMs } = sim;
  const movers: Partial<Record<SpriteKey, Waypoint[]>> = {};
  const moverBursts: Partial<Record<SpriteKey, { startMs: number; endMs: number }>> = {};
  const finisherKey = `${offSide}-${finisherPos}` as SpriteKey;

  for (const a of agents) {
    const frames = a.frames;
    // Total travel: skip a truly static sprite (keeps the plan lean).
    let travel = 0;
    for (let i = 1; i < frames.length; i++) travel += Math.hypot(frames[i].frac.x - frames[i - 1].frac.x, frames[i].frac.y - frames[i - 1].frac.y);
    if (travel < MOVE_EPS) continue;
    const b = burstOf(frames, preShotMs);
    if (b) moverBursts[a.key] = b;
    // Force-keep the PLANT (burst end) and the hold-end so a player who arrives and
    // holds reads as arrive-then-still, not a slow drift (Douglas-Peucker is
    // time-unaware and would otherwise collapse the hold to an arbitrary frame).
    const pin = a.key === finisherKey ? { ms: preShotMs, frac: shotSpot } : undefined;
    const mustKeep = [sim.holdUntil];
    if (b) mustKeep.push(b.endMs);
    if (a.key === finisherKey) mustKeep.push(preShotMs);
    movers[a.key] = simplify(frames, a.spawn, a.resetTo, totalMs, mustKeep, pin);
  }

  // Ball legs from the touch script, resolved against the baked mover paths.
  const roleKey = (role: OffRole): SpriteKey => {
    const pos = POSITIONS.find((p) => script.offRoles[p] === role) ?? finisherPos;
    return `${offSide}-${pos}` as SpriteKey;
  };
  const pathOf = (key: SpriteKey): Waypoint[] | undefined => movers[key];
  const spotAt = (key: SpriteKey, atMs: number, fallback: Frac): Frac => {
    const wp = pathOf(key);
    return wp ? sampleAt(wp, atMs) : fallback;
  };

  const legs: BallLeg[] = [];
  for (let i = 0; i < script.touches.length; i++) {
    const tch = script.touches[i];
    const isFinal = i === script.touches.length - 1;
    const fromKey = roleKey(tch.fromRole);
    const toKey = roleKey(tch.toRole);
    const startMs = tch.startFrac * preShotMs;
    const endMs = tch.endFrac * preShotMs;
    const kind: BallLegKind = tch.kind;
    const from = spotAt(fromKey, startMs, sampleShotFallback(shotSpot));
    const to = isFinal ? shotSpot : spotAt(toKey, endMs, shotSpot);
    let path: Frac[] | undefined;
    if (kind === 'carry') {
      const wp = pathOf(fromKey);
      if (wp) {
        path = [];
        for (let s = 0; s < CARRY_SAMPLES; s++) {
          const atMs = startMs + ((endMs - startMs) * s) / (CARRY_SAMPLES - 1);
          path.push(sampleAt(wp, atMs));
        }
        if (isFinal) path[path.length - 1] = shotSpot;
      }
    }
    legs.push({
      kind,
      from: path ? path[0] : from,
      to: path ? path[path.length - 1] : to,
      startMs,
      ms: endMs - startMs,
      path,
    });
  }
  // Guarantee the ball ends at the shot spot exactly when the shot fires.
  if (legs.length > 0) {
    const last = legs[legs.length - 1];
    last.to = shotSpot;
    last.ms = preShotMs - last.startMs;
    if (last.path) last.path[last.path.length - 1] = shotSpot;
  }

  return { movers, moverBursts, ball: legs };
}

function sampleShotFallback(shotSpot: Frac): Frac {
  return shotSpot;
}
