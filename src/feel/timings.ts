/**
 * Snappy timing tokens. These short durations (80-260ms) are the contract that
 * keeps the auto-sim watch feeling fast. Pure numbers, safe to import anywhere;
 * hooks reference reanimated's Easing directly at the call site.
 */
export const DUR = {
  instant: 80, // hit-confirmation flash on/off
  fast: 120, // pop scale punch
  snap: 180, // entrance slide/fade
  count: 260, // count-up tween for a small change
  shake: 220, // full screen-shake envelope
} as const;

/**
 * Screen-shake amplitude in pixels by intensity. Softened so the floor doesn't
 * quake on every bucket: `medium` carries dunks and blocks, `heavy` is reserved
 * for the game-winner.
 */
export const SHAKE_PX = {
  light: 3,
  medium: 6,
  heavy: 10,
} as const;

export type ShakeIntensity = keyof typeof SHAKE_PX;

/**
 * Divide a duration by the playback speed, with a floor so beats stay readable
 * (and 8-bit crisp) even at the fastest speed. Used for every per-event gap and
 * animation duration so the ball and the scheduler scale together and stay in
 * sync. Ambient loops (idle bob, glow, scanlines) are not scaled.
 */
export function scaled(ms: number, speed: number): number {
  return Math.max(60, Math.round(ms / speed));
}
