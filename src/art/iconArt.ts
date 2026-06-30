/**
 * The single source of truth for the Pixel Hoops app icon, drawn as 8-bit pixel
 * art on a small logical grid. One mark (a basketball dropping through a hoop and
 * net) feeds every store asset: the iOS/web icon, the Android adaptive layers, and
 * the splash wordmark. Colors come from the shared palette so the icon stays on
 * brand; nothing here imports jimp or Node, so it is deterministic and unit-tested
 * (see scripts/generate-icon.ts for the PNG baking).
 *
 * Geometry is transcribed from BasketballIcon (src/components/run/PixelIcons.tsx):
 * an orange disc seamed in bgPanel. The hoop rim and net are new, built from the
 * same primitives. All tunables live in the constant block below so the art can be
 * nudged and re-rendered (the team verifies icons by eye, never by arc math).
 */
import { Canvas, hexToRgba, mix, type RGBA } from './pixelCanvas';
import { drawText, textWidth, GLYPH_H } from './pixelFont';
import { palette } from '../theme/palette';

/** Logical grid the mark is authored on (matches BasketballIcon's 32 viewBox). */
export const LOGICAL = 32;
/** Taller grid for the splash, leaving room for the wordmark under the mark. */
export const SPLASH_W = 64;
export const SPLASH_H = 64;

const BG: RGBA = hexToRgba(palette.bgDeep); // #1A1A2E navy field
const BALL: RGBA = hexToRgba(palette.orange); // #FF9800
const BALL_SHADE: RGBA = hexToRgba(palette.courtLine); // #FF7A1A lower-right shade
const RIM: RGBA = hexToRgba(palette.epicRed); // #FF2D55 arcade-red hoop rim
const SEAM: RGBA = hexToRgba(palette.bgPanel); // #0E0E1A ball seams
const OUTLINE: RGBA = hexToRgba(palette.shadow); // #000000 crisp silhouette edge
const INK: RGBA = hexToRgba(palette.ink); // wordmark + monochrome silhouette
// Net strands are translucent so the ball shows through where they cross it.
// composite() blends them, so over the opaque master they still resolve opaque.
const NET: RGBA = hexToRgba(palette.ink, 105);
const ARC: RGBA = mix(BG, hexToRgba(palette.courtLine), 0.22); // faint court line

// Hoop rim: a shallow open ellipse near the top; the ball falls through it.
const RIM_CX = 16;
const RIM_CY = 10;
const RIM_RX = 11;
const RIM_RY = 4;
const RIM_T = 2;

// Net: a tapering crosshatch that wraps the ball and billows below it. Wide
// enough at the ball's middle to hug its sides, drawn both behind and in front.
const NET_TOP = RIM_CY + 1;
const NET_BOT = 26;
const NET_TOP_HW = 10;
const NET_BOT_HW = 5;

// Ball: the hero, mid-drop through the hoop.
const BALL_CX = 16;
const BALL_CY = 17;
const BALL_R = 6.8;

/** Stamp the opaque pixels of `src` onto `dst`, but only where they fall inside
 * the disc, so the seams land solely on the ball's orange face. */
function stampWithinDisc(
  dst: Canvas,
  src: Canvas,
  cx: number,
  cy: number,
  r: number
): void {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const i = (y * src.w + x) * 4;
      if (src.data[i + 3] === 0) continue;
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > r * r) continue;
      dst.plot(x, y, [src.data[i], src.data[i + 1], src.data[i + 2], 255]);
    }
  }
}

/** Draw the ball: black outline, orange disc, a warm shade, then the four seams,
 * a center cross plus two curved side seams that hug the left and right edges
 * (each an arc centered on a ball edge, so only its inner half shows). */
function drawBall(c: Canvas): void {
  c.disc(BALL_CX, BALL_CY, BALL_R + 1, OUTLINE);
  c.disc(BALL_CX, BALL_CY, BALL_R, BALL);
  // Soft lower-right shading for a touch of roundness.
  c.disc(BALL_CX + 1.4, BALL_CY + 1.4, BALL_R - 2.2, BALL_SHADE);

  const seams = new Canvas(LOGICAL, LOGICAL);
  seams.line(BALL_CX, BALL_CY - BALL_R, BALL_CX, BALL_CY + BALL_R, SEAM);
  seams.line(BALL_CX - BALL_R, BALL_CY, BALL_CX + BALL_R, BALL_CY, SEAM);
  const seamRx = BALL_R * 0.58;
  seams.ellipseArc(BALL_CX - BALL_R, BALL_CY, seamRx, BALL_R, SEAM, 'right');
  seams.ellipseArc(BALL_CX + BALL_R, BALL_CY, seamRx, BALL_R, SEAM, 'left');
  stampWithinDisc(c, seams, BALL_CX, BALL_CY, BALL_R);
}

// Net mesh resolution: a grid of cells, each crossed by an X, so adjacent cells
// share strands and the whole thing reads as woven diamonds that taper downward.
const NET_ROWS = 4;
const NET_COLS = 5;

/** Edge x of the net at vertical fraction `f` (0 at the rim, 1 at the bottom). */
function netEdgeX(f: number, sign: number): number {
  const hw = NET_TOP_HW + (NET_BOT_HW - NET_TOP_HW) * f;
  return RIM_CX + sign * hw;
}

/** Draw the net as a tapering lattice of diamonds between NET_TOP and NET_BOT:
 * each grid cell gets both diagonals, and shared cell edges weave continuous
 * strands. Rendered translucent (NET alpha) so the ball reads through it. */
function drawNet(c: Canvas): void {
  const yAt = (f: number) => NET_TOP + (NET_BOT - NET_TOP) * f;
  const xAt = (f: number, col: number) =>
    netEdgeX(f, -1) + ((netEdgeX(f, 1) - netEdgeX(f, -1)) * col) / NET_COLS;
  for (let r = 0; r < NET_ROWS; r++) {
    const fTop = r / NET_ROWS;
    const fBot = (r + 1) / NET_ROWS;
    const yTop = yAt(fTop);
    const yBot = yAt(fBot);
    for (let col = 0; col < NET_COLS; col++) {
      c.line(xAt(fTop, col), yTop, xAt(fBot, col + 1), yBot, NET); // down-right
      c.line(xAt(fTop, col + 1), yTop, xAt(fBot, col), yBot, NET); // down-left
    }
  }
}

/** Copy the opaque pixels of `src` rows [yStart, yEnd) onto `dst`, so the rim
 * ring can be split into a back arc (behind the ball) and a front arc (over it). */
function compositeBand(
  dst: Canvas,
  src: Canvas,
  yStart: number,
  yEnd: number
): void {
  for (let y = yStart; y < yEnd; y++) {
    for (let x = 0; x < src.w; x++) {
      const i = (y * src.w + x) * 4;
      if (src.data[i + 3] !== 0) {
        dst.plot(x, y, [src.data[i], src.data[i + 1], src.data[i + 2], 255]);
      }
    }
  }
}

/** Compose the full mark into a 32x32 canvas. Z-order, back to front: the rim's
 * back arc, the net behind the ball, the ball, the net draping over the ball's
 * front, then the rim's front arc, so the ball reads as dropping through a hoop
 * and net. The rim ring and net are each rendered once and reused. */
function composeMark(c: Canvas): void {
  const rim = new Canvas(LOGICAL, LOGICAL);
  rim.ellipseRing(RIM_CX, RIM_CY, RIM_RX, RIM_RY, RIM_T, RIM);
  const net = new Canvas(LOGICAL, LOGICAL);
  drawNet(net);

  compositeBand(c, rim, 0, RIM_CY); // back of the rim, behind the ball
  c.composite(net, 0, 0); // net wrapping behind/around the ball
  drawBall(c);
  c.composite(net, 0, 0); // same mesh continuing over the front: no gap, ball shows through
  compositeBand(c, rim, RIM_CY, LOGICAL); // front of the rim, over the ball
}

/** The mark on a transparent field (Android foreground, splash). */
export function buildMark(): Canvas {
  const c = new Canvas(LOGICAL, LOGICAL);
  composeMark(c);
  return c;
}

/** The opaque master icon: the mark on the navy brand field (iOS, web favicon). */
export function buildMaster(): Canvas {
  const c = new Canvas(LOGICAL, LOGICAL, BG);
  composeMark(c);
  return c;
}

/** A flat ink silhouette of just the hoop and ball (no net) for the Android
 * monochrome themed-icon layer, where a clean shape reads better than mesh. */
export function buildSilhouette(): Canvas {
  const c = new Canvas(LOGICAL, LOGICAL);
  c.ellipseRing(RIM_CX, RIM_CY, RIM_RX, RIM_RY, RIM_T, INK);
  c.disc(BALL_CX, BALL_CY, BALL_R, INK);
  return c.toSilhouette(INK);
}

/** The opaque Android adaptive background: the navy field with a faint court arc
 * in the lower third, so the layered icon still reads as on a court. */
export function buildBackground(): Canvas {
  const c = new Canvas(LOGICAL, LOGICAL, BG);
  c.ellipseRing(16, 40, 15, 16, 1, ARC);
  return c;
}

/** The splash composition: the mark centered up top with the "PIXEL HOOPS"
 * wordmark below it ("PIXEL" in ink, "HOOPS" in orange, as on the home screen).
 * Transparent field; expo-splash-screen paints the navy backgroundColor behind. */
export function buildSplash(): Canvas {
  const c = new Canvas(SPLASH_W, SPLASH_H);
  const mark = buildMark();
  c.composite(mark, (SPLASH_W - LOGICAL) / 2, 3);

  const pixelX = Math.round((SPLASH_W - textWidth('PIXEL')) / 2);
  const hoopsX = Math.round((SPLASH_W - textWidth('HOOPS')) / 2);
  const pixelY = 41;
  const hoopsY = pixelY + GLYPH_H + 3;
  drawText(c, 'PIXEL', pixelX, pixelY, INK);
  drawText(c, 'HOOPS', hoopsX, hoopsY, BALL);
  return c;
}
