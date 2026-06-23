/**
 * Official NBA court geometry, the single source of truth for everything that
 * draws or targets the floor. All values are in FEET, with the origin at a
 * baseline corner: x runs across the court (0..50) and y runs along its length
 * (0..94). The court is drawn top down in portrait, so the 94 ft length is the
 * vertical axis and the 50 ft width is the horizontal one. Every basket-end
 * feature is mirrored about the center line (y = 47) for the far hoop, which in
 * fractions is just (1 - frac) or in feet (length - y).
 *
 * Pure module: no React and no react-native imports, so it stays Node-safe and
 * unit-testable like courtTheme.ts, and so both the SVG court (SvgCourt) and the
 * sprite/ball geometry (courtGeometry) can read from one place.
 */

/** Full court: 94 ft long by 50 ft wide. */
export const COURT = { length: 94, width: 50 } as const;

/** Half-court line and the two center circles (12 ft and 4 ft diameters). */
export const CENTER_LINE_Y = 47;
export const CENTER_CIRCLE = { cx: 25, cy: 47, r: 6 } as const;
export const INNER_CIRCLE_R = 2;

/** Painted lane: 16 ft wide, 19 ft deep (baseline to the free-throw line). */
export const LANE = { x: 17, w: 16, depth: 19 } as const;

/** Free-throw circle, centered on the free-throw line (19 ft from baseline). */
export const FT_CIRCLE = { cx: 25, cy: 19, r: 6 } as const;

/** Backboard: 6 ft wide, 4 ft in from the baseline. */
export const BACKBOARD = { x1: 22, x2: 28, y: 4 } as const;

/** Rim: 18 in (1.5 ft) diameter, center 5.25 ft from the baseline. */
export const RIM = { cx: 25, cy: 5.25, r: 0.75 } as const;

/** Restricted-area arc radius, centered on the rim. */
export const RESTRICTED_R = 4;

/**
 * Three-point line: a 23.75 ft arc about the rim, joined to straight corner
 * segments 3 ft from each sideline (22 ft from the basket). The straight part
 * runs from the baseline up to where it meets the arc, derived exactly so the
 * junction never drifts. The arc apex sits 23.75 ft past the rim (y = 29).
 */
export const THREE = {
  radius: 23.75,
  cornerX: 3,
  cornerXFar: COURT.width - 3,
  apexY: RIM.cy + 23.75,
  cornerTopY: RIM.cy + Math.sqrt(23.75 ** 2 - 22 ** 2),
} as const;

/**
 * Canonical fractions (0..1 of the court box) the rest of the app reuses so no
 * magic numbers get recomputed. The rim the home side attacks is the top one.
 */
export const RIM_CENTER_FRACTION_X = RIM.cx / COURT.width;
export const RIM_CENTER_FRACTION_Y = RIM.cy / COURT.length;
