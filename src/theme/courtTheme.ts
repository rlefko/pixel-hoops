import { palette } from './palette';
import { mix, pickReadable } from './color';

/**
 * Derives the court colors for a matchup from the opponent franchise's two
 * colors. The player travels the bracket as the visitor, so every game is hosted
 * in the opponent's arena: the floor takes a small tint of their primary and the
 * lines/rim take their secondary color, falling back to the house orange when a
 * franchise's secondary is too close to the dark floor to read. Pure (palette +
 * color math only), so it stays Node-safe and testable.
 */

export interface CourtTheme {
  /** Dark, lightly team-tinted floor. */
  floorColor: string;
  /** Center line, border, keys, and circle. */
  lineColor: string;
  /** Rim and net accent. */
  accentColor: string;
}

/** How much opponent primary bleeds into the dark floor. Kept low so the
 * opponent's primary-colored sprites stay legible against the floor. */
const FLOOR_TINT = 0.12;
/** Lines are chunky pixels, so they need less than text-grade contrast. */
const MIN_LINE_CONTRAST = 2.2;

export function courtThemeFor(
  primaryHex: string,
  secondaryHex: string
): CourtTheme {
  const floorColor = mix(palette.bgCourt, primaryHex, FLOOR_TINT);
  return {
    floorColor,
    lineColor: pickReadable(
      floorColor,
      [secondaryHex, primaryHex],
      palette.courtLine,
      MIN_LINE_CONTRAST
    ),
    accentColor: pickReadable(
      floorColor,
      [secondaryHex, palette.orange],
      palette.orange,
      MIN_LINE_CONTRAST
    ),
  };
}
