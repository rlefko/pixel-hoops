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
const RIM: RGBA = hexToRgba(palette.gold); // #FFD54F hoop, the brand accent
const SEAM: RGBA = hexToRgba(palette.bgPanel); // #0E0E1A ball seams
const OUTLINE: RGBA = hexToRgba(palette.shadow); // #000000 crisp silhouette edge
const INK: RGBA = hexToRgba(palette.ink); // wordmark + monochrome silhouette
// Net strands sit on both opaque (master) and transparent (foreground) fields, so
// they must be fully opaque; a touch of navy mixed in keeps them from glaring.
const NET: RGBA = mix(BG, INK, 0.82);
const ARC: RGBA = mix(BG, hexToRgba(palette.courtLine), 0.22); // faint court line

// Hoop rim: a shallow open ellipse near the top; the ball falls through it.
const RIM_CX = 16;
const RIM_CY = 10;
const RIM_RX = 11;
const RIM_RY = 4;
const RIM_T = 2;

// Net: a tapering crosshatch hanging from the rim down past the ball.
const NET_TOP = RIM_CY + 1;
const NET_BOT = 25;
const NET_TOP_HW = 9;
const NET_BOT_HW = 4;

// Ball: the hero, mid-drop through the hoop.
const BALL_CX = 16;
const BALL_CY = 17;
const BALL_R = 6.8;

/** Draw the ball: black outline, orange disc, a warm shade, then the four seams. */
function drawBall(c: Canvas): void {
  c.disc(BALL_CX, BALL_CY, BALL_R + 1, OUTLINE);
  c.disc(BALL_CX, BALL_CY, BALL_R, BALL);
  // Soft lower-right shading for a touch of roundness.
  c.disc(BALL_CX + 1.4, BALL_CY + 1.4, BALL_R - 2.2, BALL_SHADE);
  // Seams, clipped to the disc by construction. Center cross plus two curved
  // side seams (a narrow vertical ellipse ring whose flanks hug the edges).
  c.line(BALL_CX, BALL_CY - BALL_R, BALL_CX, BALL_CY + BALL_R, SEAM);
  c.line(BALL_CX - BALL_R, BALL_CY, BALL_CX + BALL_R, BALL_CY, SEAM);
  c.ellipseRing(BALL_CX, BALL_CY, BALL_R * 0.5, BALL_R * 0.96, 1, SEAM);
}

/** Draw the net as a tapering crosshatch between (NET_TOP) and (NET_BOT). */
function drawNet(c: Canvas): void {
  const strands = 4;
  for (let k = 0; k <= strands; k++) {
    const f = k / strands;
    const topX = RIM_CX - NET_TOP_HW + 2 * NET_TOP_HW * f;
    const botRight = RIM_CX - NET_BOT_HW + 2 * NET_BOT_HW * f;
    const botLeft = RIM_CX - NET_BOT_HW + 2 * NET_BOT_HW * (1 - f);
    c.line(topX, NET_TOP, botRight, NET_BOT, NET); // right-leaning strand
    c.line(topX, NET_TOP, botLeft, NET_BOT, NET); // left-leaning strand
  }
  // Two dashed horizontal courses to read as woven mesh.
  for (let row = 1; row <= 2; row++) {
    const f = row / 3;
    const y = Math.round(NET_TOP + (NET_BOT - NET_TOP) * f);
    const hw = NET_TOP_HW + (NET_BOT_HW - NET_TOP_HW) * f;
    for (let x = Math.round(RIM_CX - hw); x <= RIM_CX + hw; x++) {
      if ((x + row) % 2 === 0) c.plot(x, y, NET);
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

/** Compose the full mark into a 32x32 canvas: the rim's back arc, the net, the
 * ball, then the rim's front arc, so the ball reads as dropping through the hoop.
 * The ring is rendered once and composited in two y-bands around the ball. */
function composeMark(c: Canvas): void {
  const rim = new Canvas(LOGICAL, LOGICAL);
  rim.ellipseRing(RIM_CX, RIM_CY, RIM_RX, RIM_RY, RIM_T, RIM);
  compositeBand(c, rim, 0, RIM_CY); // back of the rim, behind the ball
  drawNet(c);
  drawBall(c);
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
