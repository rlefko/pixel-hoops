import { type Vec, sub, scale, norm, len, add } from './vec';

/**
 * Reynolds steering behaviors: each returns a steering FORCE (a desired-velocity
 * delta) in aspect-corrected metric space. The integrator (kinematics.ts) sums a
 * weighted blend of these, clamps to maxAccel, and advances the agent. One cheap
 * vector op each; pure and Node-safe. `force = desired_velocity - current_velocity`.
 */

/** Head straight at `target` at full speed. */
export function seek(pos: Vec, vel: Vec, target: Vec, maxSpeed: number): Vec {
  const desired = scale(norm(sub(target, pos)), maxSpeed);
  return sub(desired, vel);
}

/** Head at `target` but ramp speed down inside `slowR` so the agent plants, not overshoots. */
export function arrive(pos: Vec, vel: Vec, target: Vec, maxSpeed: number, slowR: number): Vec {
  const toTarget = sub(target, pos);
  const d = len(toTarget);
  if (d < 1e-6) return scale(vel, -1); // on the spot: kill residual velocity
  const speed = d < slowR ? maxSpeed * (d / slowR) : maxSpeed;
  const desired = scale(norm(toTarget), speed);
  return sub(desired, vel);
}

/** Chase a moving target, leading it by `leadSec` of its velocity (defender pursuit / oop timing). */
export function pursue(pos: Vec, vel: Vec, tPos: Vec, tVel: Vec, leadSec: number, maxSpeed: number): Vec {
  return seek(pos, vel, add(tPos, scale(tVel, leadSec)), maxSpeed);
}

/** Push away from crowding neighbors within `radius` (inverse-square), keeping spacing. */
export function separation(pos: Vec, others: Vec[], radius: number, maxSpeed: number): Vec {
  let fx = 0;
  let fy = 0;
  for (const o of others) {
    const dx = pos.x - o.x;
    const dy = pos.y - o.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > 1e-9 && d2 < radius * radius) {
      const inv = 1 / d2;
      fx += dx * inv;
      fy += dy * inv;
    }
  }
  const f = { x: fx, y: fy };
  const l = len(f);
  return l > 1e-6 ? scale(norm(f), maxSpeed) : f;
}

/** Keep the agent inside the axis-aligned metric box (soft push back when outside). */
export function containment(pos: Vec, min: Vec, max: Vec, maxSpeed: number): Vec {
  let fx = 0;
  let fy = 0;
  if (pos.x < min.x) fx = 1;
  else if (pos.x > max.x) fx = -1;
  if (pos.y < min.y) fy = 1;
  else if (pos.y > max.y) fy = -1;
  if (fx === 0 && fy === 0) return { x: 0, y: 0 };
  return scale(norm({ x: fx, y: fy }), maxSpeed);
}
