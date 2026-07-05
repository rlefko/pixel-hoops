import type { Pt } from './ballPath';

/**
 * Pure Catmull-Rom (Cardinal) spline sampling for smooth, curved player paths.
 * No React, no reanimated, no state, so the choreography planner (which runs in
 * Node tests) can bake curves into waypoints without the animation runtime. The
 * curve passes THROUGH every control point; between points it bows naturally, so
 * cuts arc around defenders instead of running in straight lines.
 *
 * `t` in [0,1] spans the whole polyline. `tension` scales the tangents: 0.5 is a
 * standard Catmull-Rom (default), lower is tighter/straighter, higher is loopier.
 * Endpoints are handled by duplicating the first/last control point (a natural,
 * non-overshooting boundary).
 */

/** Cardinal-spline point on the segment P1->P2 at local u (0..1), tangents from P0/P3. */
function segment(p0: Pt, p1: Pt, p2: Pt, p3: Pt, u: number, s: number): Pt {
  // Hermite basis with Cardinal tangents m1 = s*(P2-P0), m2 = s*(P3-P1).
  const u2 = u * u;
  const u3 = u2 * u;
  const h1 = 2 * u3 - 3 * u2 + 1;
  const h2 = u3 - 2 * u2 + u;
  const h3 = -2 * u3 + 3 * u2;
  const h4 = u3 - u2;
  const m1x = s * (p2.x - p0.x);
  const m1y = s * (p2.y - p0.y);
  const m2x = s * (p3.x - p1.x);
  const m2y = s * (p3.y - p1.y);
  return {
    x: h1 * p1.x + h2 * m1x + h3 * p2.x + h4 * m2x,
    y: h1 * p1.y + h2 * m1y + h3 * p2.y + h4 * m2y,
  };
}

/**
 * Sample the spline through `control` at `t` (0..1). 1 point returns it; 2 points
 * is a straight lerp; 3+ points is a piecewise Cardinal spline.
 */
export function catmullRom(control: Pt[], t: number, tension = 0.5): Pt {
  const n = control.length;
  if (n === 0) return { x: 0, y: 0 };
  if (n === 1) return control[0];
  const tc = Math.max(0, Math.min(1, t));
  if (n === 2) {
    return {
      x: control[0].x + (control[1].x - control[0].x) * tc,
      y: control[0].y + (control[1].y - control[0].y) * tc,
    };
  }
  // Map t across the (n-1) segments.
  const segCount = n - 1;
  const scaled = tc * segCount;
  let i = Math.floor(scaled);
  if (i >= segCount) i = segCount - 1; // t === 1 lands on the last segment
  const u = scaled - i;
  const p0 = control[i - 1] ?? control[i]; // duplicate the first point at the start
  const p1 = control[i];
  const p2 = control[i + 1];
  const p3 = control[i + 2] ?? control[i + 1]; // duplicate the last point at the end
  return segment(p0, p1, p2, p3, u, tension);
}
