/**
 * Pixel-grid layout tokens. Everything sits on a 4px base unit, corners are
 * square (or barely rounded), and borders are hard. This keeps new UI reading
 * as 8-bit rather than smooth and modern.
 */

const UNIT = 4;

/** Spacing on the 4px grid: space(2) === 8. */
export function space(n: number): number {
  return n * UNIT;
}

/** Snap a value to a whole pixel so motion reads as stepped, not floaty. */
export function snapPx(value: number): number {
  return Math.round(value);
}

/** Square-ish corners only. */
export const RADIUS = {
  none: 0,
  chip: 2,
} as const;

/** Hard pixel borders. */
export const BORDER = {
  thin: 1,
  chunk: 2,
  chunkier: 3,
} as const;

/** Font sizes that render crisply for pixel fonts. */
export const FONT_SIZE = {
  micro: 8,
  small: 10,
  body: 12,
  label: 14,
  h3: 18,
  h2: 24,
  h1: 32,
} as const;

/** Nearest-neighbor scaling for any future pixel-art images. */
export const PIXEL_IMAGE_RESIZE = 'nearest' as const;
