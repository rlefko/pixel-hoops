/**
 * Snappy timing tokens. The old card game locked the screen for 1500-1600ms per
 * resolution; these durations (80-260ms) are the contract that keeps the new
 * feel fast. Pure numbers, safe to import anywhere; hooks reference reanimated's
 * Easing directly at the call site.
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
