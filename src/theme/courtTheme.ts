import { palette } from './palette';
import { mix, pickReadable } from './color';

/**
 * Derives the court colors for a matchup from the opponent franchise's two
 * colors. The player travels the bracket as the visitor, so every game is hosted
 * in the opponent's arena: the floor takes a small tint of their primary and the
 * lines/rim take their secondary color, falling back to the base theme's line
 * color when a franchise's secondary is too close to the dark floor to read.
 * The BASE is the player's unlocked home-court theme (src/game/court-themes.ts,
 * default = the shipped palette), so a cosmetic theme restyles the arena while
 * the opponent tint and legibility rules hold on top of it. Pure (palette +
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

/** The base palette the opponent tint mixes over (a court-theme selection). */
export interface CourtThemeBase {
  floor: string;
  line: string;
  accent: string;
}

/** How much opponent primary bleeds into the dark floor. Kept low so the
 * opponent's primary-colored sprites stay legible against the floor. */
const FLOOR_TINT = 0.12;
/** Lines are chunky pixels, so they need less than text-grade contrast. */
const MIN_LINE_CONTRAST = 2.2;

/** The shipped default base (identical to the pre-theme rendering). */
const CLASSIC_BASE: CourtThemeBase = {
  floor: palette.bgCourt,
  line: palette.courtLine,
  accent: palette.orange,
};

export function courtThemeFor(
  primaryHex: string,
  secondaryHex: string,
  base: CourtThemeBase = CLASSIC_BASE
): CourtTheme {
  const floorColor = mix(base.floor, primaryHex, FLOOR_TINT);
  return {
    floorColor,
    lineColor: pickReadable(
      floorColor,
      [secondaryHex, primaryHex],
      base.line,
      MIN_LINE_CONTRAST
    ),
    accentColor: pickReadable(
      floorColor,
      [secondaryHex, base.accent],
      base.accent,
      MIN_LINE_CONTRAST
    ),
  };
}
