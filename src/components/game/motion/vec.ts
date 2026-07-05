import type { Frac } from '../courtMath';
import { COURT } from '../courtDimensions';

/**
 * Tiny 2D vector math for the possession movement sim, and the aspect-corrected
 * space it integrates in. Court fractions are anisotropic (a 94ft x 50ft floor
 * squeezed into 0..1 on each axis), so a raw fraction is NOT a metric space:
 * one unit of x is ~1.88x the real distance of one unit of y. The steering sim
 * integrates in a corrected space where `y' = y * ASPECT`, so speeds, arrivals,
 * and separation read isotropically, then maps back to raw fractions when it
 * writes waypoints. Pure and Node-safe (no react-native).
 */

export interface Vec {
  x: number;
  y: number;
}

/** Court length / width: the factor that makes fraction space metric. */
export const ASPECT = COURT.length / COURT.width;

export function vec(x: number, y: number): Vec {
  return { x, y };
}

export function add(a: Vec, b: Vec): Vec {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Vec, k: number): Vec {
  return { x: a.x * k, y: a.y * k };
}

export function len(a: Vec): number {
  return Math.hypot(a.x, a.y);
}

export function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Unit vector (zero-safe: a zero vector normalizes to zero). */
export function norm(a: Vec): Vec {
  const l = Math.hypot(a.x, a.y);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
}

/** Clamp a vector's magnitude to `max`. */
export function limit(a: Vec, max: number): Vec {
  const l = Math.hypot(a.x, a.y);
  return l > max && l > 1e-9 ? { x: (a.x / l) * max, y: (a.y / l) * max } : a;
}

export function lerp(a: Vec, b: Vec, t: number): Vec {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Raw court fraction -> metric (aspect-corrected) space. */
export function toMetric(f: Frac): Vec {
  return { x: f.x, y: f.y * ASPECT };
}

/** Metric space -> raw court fraction. */
export function toFrac(v: Vec): Frac {
  return { x: v.x, y: v.y / ASPECT };
}
