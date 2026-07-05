import { type Vec, add, scale, limit } from './vec';

/**
 * Point-mass integrator for one steering step. `steer` is a desired-velocity
 * delta (Reynolds); we cap it to the per-step acceleration budget, add it to
 * velocity, cap speed, and advance position. Pure and Node-safe.
 */
export interface Kin {
  pos: Vec;
  vel: Vec;
}

export function integrate(
  pos: Vec,
  vel: Vec,
  steer: Vec,
  maxAccelPerStep: number,
  maxSpeed: number,
  dtSec: number
): Kin {
  const dv = limit(steer, maxAccelPerStep);
  const nvel = limit(add(vel, dv), maxSpeed);
  const npos = add(pos, scale(nvel, dtSec));
  return { pos: npos, vel: nvel };
}
