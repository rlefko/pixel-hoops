import { rimCenterFraction } from '../courtGeometry';
import { type Frac, type SpriteKey } from '../courtMath';
import { POSITIONS, type Position } from '@/types/roster';
import { toFrac, toMetric, lerp as vlerp, add, scale, dist, clampBox, type Vec } from './vec';
import { arrive, separation, containment } from './behaviors';
import { integrate } from './kinematics';
import { buildAgents, defenderBox, frontCourtBox, type SimAgent } from './agents';
import type { MotionBudget, MotionInput, OffRole, PossessionScript } from './types';

/**
 * The per-possession steering sim. Runs a fixed-step (50 Hz) loop over the whole
 * possession: offense chases its script's set/action spots, defenders REACT to the
 * offense's live positions (ball-you-man, weak-side help, screen coverage,
 * closeout). Records each agent's frame track for baking. Deterministic (no RNG in
 * the loop) and Node-safe. The recorded outcome is honored by the finisher's action
 * spot being the shot spot; baking pins it exactly.
 */

const DT_MS = 20;
const DT_SEC = DT_MS / 1000;
const ACTION_START_HALF = 0.62; // fraction of preShot when the action beat begins
const ACTION_START_TRANS = 0.45;
const SLOW_R = 0.14; // metric arrive-slowdown radius (plant, not overshoot)
const STOP_R = 0.045; // within this of the target, SNAP and plant (dead-still hold)
const TARGET_EPS = 0.03; // a target move bigger than this un-plants the agent
const ADVANCE_FLOOR = 0.78; // min offense speed while bringing it up, so slow bigs keep pace
const ON_BALL_TIGHT = 0.1; // on-ball defender sits this far off his man toward the rim
const CONTEST_TIGHT = 0.13; // closeout into the shooter's airspace

export interface BallSample {
  atMs: number;
  holderRole: OffRole;
}

export interface SimResult {
  agents: SimAgent[];
  byKey: Map<SpriteKey, SimAgent>;
  offSide: 'home' | 'away';
  preShotMs: number;
  holdUntil: number;
  totalMs: number;
  shotSpot: Frac;
  ballHolders: BallSample[];
}

/** Position playing a role (1:1). */
function posOfRole(offRoles: Record<Position, OffRole>, role: OffRole): Position | undefined {
  return POSITIONS.find((p) => offRoles[p] === role);
}

/** Which role holds the ball at pre-shot fraction `frac` (from the touch script). */
function holderRoleAt(script: PossessionScript, frac: number): OffRole {
  let holder: OffRole = script.touches[0]?.fromRole ?? 'finisher';
  for (const t of script.touches) {
    if (frac >= t.startFrac) holder = frac >= t.endFrac ? t.toRole : t.fromRole;
  }
  return holder;
}

/** A fired cut's destination (metric), given the cut type and the offense's rim. */
function cutTarget(type: string, base: Vec, rimM: Vec, ballM: Vec, offSide: 'home' | 'away'): Vec {
  switch (type) {
    case 'backdoor':
    case 'basketCut':
      return vlerp(base, rimM, 0.7);
    case 'giveAndGo':
    case 'curl':
      return vlerp(base, ballM, 0.5);
    case 'relocate':
    case 'flare':
    default: {
      // Drift to the nearer weak-side corner depth.
      const cornerY = offSide === 'home' ? toMetric({ x: 0, y: 0.8 }).y : toMetric({ x: 0, y: 0.2 }).y;
      return { x: base.x < 0.5 ? toMetric({ x: 0.1, y: 0 }).x : toMetric({ x: 0.9, y: 0 }).x, y: cornerY };
    }
  }
}

export function simulate(
  input: MotionInput,
  script: PossessionScript,
  budget: MotionBudget,
  startPositions: Partial<Record<SpriteKey, Frac>>,
  resetPositions: Partial<Record<SpriteKey, Frac>>
): SimResult {
  const built = buildAgents(input, script, startPositions, resetPositions);
  const { agents, byKey, formation, offSide } = built;
  const { preShotMs, totalMs, holdUntil } = budget;
  const shotSpot = input.shotSpot;
  const rimM = toMetric(rimCenterFraction(offSide));
  const shotSpotM = toMetric(shotSpot);
  const box = frontCourtBox(offSide);
  const defBox = defenderBox(offSide);
  const actionStart = script.family === 'transition' ? ACTION_START_TRANS : ACTION_START_HALF;

  const offAgents = agents.filter((a) => a.team === 'off');
  const defAgents = agents.filter((a) => a.team === 'def');
  const finisherPos = input.event.scorerPosition;
  const screenerPos = posOfRole(script.offRoles, 'screener');
  const cov = script.defense.coverage;
  const helpDepth = script.defense.helpDepth;

  const ballHolders: BallSample[] = [];

  const offTargetSpot = (a: SimAgent, t: number, frac: number, ballM: Vec): Vec => {
    if (t >= holdUntil) return toMetric(a.resetTo); // reset (flows into a break if next flips)
    if (t >= preShotMs) return toMetric(a.actionSpot!); // hold through the shot
    if (frac < a.startMoveFrac) return toMetric(a.spawn); // stagger at the spawn
    // A fired cut overrides the spacer's target for its window.
    const cut = script.cuts.find((c) => a.role === c.role);
    if (cut && frac >= cut.fireFrac && frac < cut.fireFrac + 0.28) {
      return cutTarget(cut.type, toMetric(a.setSpot ?? a.base), rimM, ballM, offSide);
    }
    return frac < actionStart ? toMetric(a.setSpot!) : toMetric(a.actionSpot!);
  };

  const defTargetSpot = (a: SimAgent, t: number, frac: number, ballM: Vec, ballHasMan: boolean): Vec => {
    if (t >= holdUntil) return toMetric(a.resetTo); // reset (sprint back if the next is a break)
    const man = byKey.get(`${offSide}-${a.guards}` as SpriteKey);
    const manM = man ? man.pos : toMetric(a.base);
    const guardingFinisher = a.guards === finisherPos;
    const inAction = frac >= actionStart;

    // Every defender's target is clamped to the get-back box: he sinks to help and
    // guards his man, but NEVER chases into the offense's backcourt (no accidental
    // full-court chase when a lagging man drifts back).
    const clamp = (v: Vec) => clampBox(v, defBox.min, defBox.max);

    // Screen coverage geometry for the screener's defender (no switch: switch swapped the man).
    if (screenerPos && a.guards === screenerPos && cov !== 'switch' && cov !== 'none' && inAction && frac < 1.0) {
      if (formation.screen) {
        const screenM = toMetric(formation.screen.screenSpot);
        if (cov === 'drop') return clamp(vlerp(screenM, rimM, 0.8));
        if (cov === 'hedge') return clamp(frac < actionStart + 0.15 ? screenM : vlerp(manM, rimM, 0.2));
        if (cov === 'ice') return clamp(vlerp(screenM, rimM, 0.5));
      }
    }

    // On-ball defender: sit tight, goal-side; close out hard on the finisher near the shot.
    if (ballHasMan) {
      const tight = guardingFinisher && inAction ? CONTEST_TIGHT : ON_BALL_TIGHT;
      const anchor = guardingFinisher && inAction ? shotSpotM : manM;
      return clamp(vlerp(anchor, rimM, tight));
    }

    // Off-ball: weak-side help up the ball-you-man line (goal-side), tag the roller late.
    if (script.defense.tagRoller && a.guards !== finisherPos && inAction && frac > actionStart + 0.1 && frac < actionStart + 0.3) {
      return clamp(vlerp(rimM, manM, 0.5)); // brief tag near the rim
    }
    const midBallRim = vlerp(ballM, rimM, 0.5);
    return clamp(vlerp(manM, midBallRim, helpDepth));
  };

  // Advance one agent one step, honoring the IDLE/planted state: once it arrives
  // (within STOP_R) it SNAPS to the target, zeros velocity, and holds dead-still with
  // no steering until its target moves (TARGET_EPS) - genuine stillness, not drift.
  const stepAgent = (a: SimAgent, target: Vec, sameTeam: SimAgent[], t: number, agentBox: { min: Vec; max: Vec }, maxSpeed: number) => {
    if (!a.lastTarget || dist(target, a.lastTarget) > TARGET_EPS) a.planted = false;
    a.lastTarget = target;
    if (!a.planted) {
      const steer = blend(a, target, sameTeam, agentBox, maxSpeed);
      const k = integrate(a.pos, a.vel, steer, a.maxAccel * DT_SEC, maxSpeed, DT_SEC);
      a.pos = k.pos;
      a.vel = k.vel;
      if (dist(a.pos, target) < STOP_R) {
        a.pos = { x: target.x, y: target.y }; // snap onto the spot
        a.vel = { x: 0, y: 0 };
        a.planted = true;
      }
    }
    a.frames.push({ atMs: t, frac: toFrac(a.pos) });
  };

  // Step in DT_MS increments but always land the FINAL frame exactly on totalMs (a
  // pacing value is rarely a multiple of DT_MS), so every agent's track covers the
  // whole [0, totalMs] window the bake step and renderer expect.
  for (let step = 0; ; step++) {
    const t = Math.min(step * DT_MS, totalMs);
    const frac = preShotMs > 0 ? Math.min(1, t / preShotMs) : 1;
    const holder = holderRoleAt(script, frac);
    const holderPos = posOfRole(script.offRoles, holder) ?? finisherPos;
    const holderAgent = byKey.get(`${offSide}-${holderPos}` as SpriteKey);
    const ballM = holderAgent ? holderAgent.pos : shotSpotM;
    ballHolders.push({ atMs: t, holderRole: holder });

    // Players run FASTER while getting up (or back down) the floor than in a set, so
    // slow bigs keep pace and defenders sprint back on a break.
    const traveling = frac < actionStart || t >= holdUntil;
    // Offense first, so defenders react to updated positions this step.
    for (const a of offAgents) {
      const spd = traveling ? Math.max(a.maxSpeed, ADVANCE_FLOOR) : a.maxSpeed;
      stepAgent(a, offTargetSpot(a, t, frac, ballM), offAgents, t, box, spd);
    }
    for (const a of defAgents) {
      const spd = traveling ? Math.max(a.maxSpeed, ADVANCE_FLOOR) : a.maxSpeed;
      stepAgent(a, defTargetSpot(a, t, frac, ballM, a.guards === holderPos), defAgents, t, defBox, spd);
    }
    if (t >= totalMs) break;
  }

  return { agents, byKey, offSide, preShotMs, holdUntil, totalMs, shotSpot, ballHolders };
}

/** Weighted blend: arrive at the target + separation from teammates + containment. */
function blend(a: SimAgent, target: Vec, sameTeam: SimAgent[], box: { min: Vec; max: Vec }, maxSpeed: number): Vec {
  const primary = arrive(a.pos, a.vel, target, maxSpeed, SLOW_R);
  const others: Vec[] = [];
  for (const o of sameTeam) if (o !== a) others.push(o.pos);
  const sep = separation(a.pos, others, 0.14, maxSpeed);
  const con = containment(a.pos, box.min, box.max, maxSpeed);
  return add(add(primary, scale(sep, 0.35)), scale(con, 0.25));
}
