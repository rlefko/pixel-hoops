/**
 * Pure slider math, kept free of React Native so it can be unit-tested directly and
 * shared by any slider. Values are normalized 0..1.
 */

/** Clamp a value into the inclusive 0..1 range. */
export function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Clamp to 0..1 and snap to the nearest `step` multiple, so a chiptune slider lands
 * on clean notches (e.g. 5% stops) instead of arbitrary floats. Guards against a
 * non-positive step (returns the clamped value untouched).
 */
export function snapToStep(value: number, step: number): number {
  const clamped = clamp01(value);
  if (step <= 0) return clamped;
  return clamp01(Math.round(clamped / step) * step);
}
