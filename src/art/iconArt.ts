/**
 * The single source of truth for the Pixel Hoops app icon, drawn as 8-bit pixel
 * art on a small logical grid. One mark (a basketball dropping through a hoop and
 * net) feeds every store asset: the iOS icons (light, dark, tinted), the web
 * favicon, the Android adaptive layers, and both splash lockups. Colors come from
 * the shared palette so the icon stays on brand; nothing here imports jimp or
 * Node, so it is deterministic and unit-tested (see scripts/generate-icon.ts for
 * the PNG baking).
 *
 * Composition, back to front: the rim's back arc, the net hanging behind the
 * ball (knotted to the back arc, visible in the hoop window's flank gaps), the
 * ball, the net's front cords across the whole ball below the rim plane (the
 * ball is inside the net, seen through the diamond holes; over-ball cords render
 * in a softer warm tone so the sphere stays readable), then the rim's front arc.
 * All tunables live in the constant block below so the art can be nudged and
 * re-rendered (the team verifies icons by eye, never by arc math).
 */
import {
  Canvas,
  hexToRgba,
  mix,
  opaqueBounds,
  TRANSPARENT,
  type RGBA,
} from './pixelCanvas';
import { drawText, textWidth, GLYPH_H } from './pixelFont';
import { palette } from '../theme/palette';

/** Logical grid the mark is authored on (matches BasketballIcon's 32 viewBox). */
export const LOGICAL = 32;

const BG: RGBA = hexToRgba(palette.bgDeep); // #1A1A2E navy field
const BALL: RGBA = hexToRgba(palette.orange); // #FF9800
const BALL_SHADE: RGBA = hexToRgba(palette.courtLine); // #FF7A1A lower-right shade
const BALL_HI: RGBA = mix(
  hexToRgba(palette.orange),
  hexToRgba(palette.gold),
  0.65
); // warm gleam
const RIM: RGBA = hexToRgba(palette.epicRed); // #FF2D55 arcade-red hoop rim
const RIM_HI: RGBA = mix(hexToRgba(palette.epicRed), hexToRgba(palette.ink), 0.4);
// Ball seams: a deep warm brown instead of near-black. Under the front net
// cords, black seams read as armor plating; a warm dark tone keeps the seam
// grid legible while letting the ball stay one cohesive sphere.
const SEAM: RGBA = mix(hexToRgba(palette.courtLine), hexToRgba(palette.shadow), 0.72);
const OUTLINE: RGBA = hexToRgba(palette.shadow); // #000000 crisp silhouette edge
const INK: RGBA = hexToRgba(palette.ink); // wordmark + monochrome silhouette
// Net cord: a light neutral, fully opaque. Translucent strands used to blend
// into checker noise over the ball and rim; an opaque cord color reads as string
// on the navy master, the transparent Android layer, and the splash alike.
const NET: RGBA = mix(hexToRgba(palette.ink), hexToRgba(palette.inkDim), 0.45);
// Front cords crossing the ball render in this softer warm tone instead of the
// full cord gray, so the ball reads as one orange sphere seen through the net
// rather than shattering into gray-fenced fragments.
const NET_OVER_BALL: RGBA = mix(NET, hexToRgba(palette.orange), 0.4);
const ARC: RGBA = mix(BG, hexToRgba(palette.courtLine), 0.22); // faint court line

// Hoop rim: a shallow open ellipse near the top; the ball falls through it.
const RIM_CX = 16;
const RIM_CY = 9;
const RIM_RX = 11;
const RIM_RY = 4;
const RIM_T = 2;

// Net: a tapering lattice knotted to the hoop. The top row starts at the back
// arc's underside, so cords visibly hang off the back of the rim through the
// hoop window's flank gaps and emerge from under the ring's sides; the mesh is
// wider than the ball at its equator so the cords hug its flanks.
const NET_TOP = 8;
const NET_BOT = 25;
const NET_TOP_HW = 9.5;
const NET_BOT_HW = 6;

// Ball: the hero, mid-drop, its crown bulging up through the hoop's window.
// Sized so the window keeps open flanks beside the crown where the back-arc
// cords show.
const BALL_CX = 16;
const BALL_CY = 15;
const BALL_R = 7;

// The gleam sits just below the rim's front bar, on the ball's upper-left face.
const GLEAM_Y = 13;

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

/** Recolor a crescent along the ball's lower-right edge: pixels inside the main
 * disc but outside the same disc nudged up-left, the classic 8-bit ball shade. */
function shadeCrescent(c: Canvas): void {
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const dx = x + 0.5 - BALL_CX;
      const dy = y + 0.5 - BALL_CY;
      if (dx * dx + dy * dy > BALL_R * BALL_R) continue;
      const ox = dx + 1.7;
      const oy = dy + 1.7;
      const ir = BALL_R - 0.6;
      if (ox * ox + oy * oy <= ir * ir) continue;
      c.plot(x, y, BALL_SHADE);
    }
  }
}

/** Draw the ball: black outline, orange disc, edge shade, a small gleam, then
 * the four seams (center cross plus two curved side seams that hug the left and
 * right edges), all clipped to the disc so they never spill onto the outline. */
function drawBall(c: Canvas): void {
  c.disc(BALL_CX, BALL_CY, BALL_R + 1, OUTLINE);
  c.disc(BALL_CX, BALL_CY, BALL_R, BALL);
  shadeCrescent(c);
  // Small upper-left gleam for roundness: a 2x2 block, the pixel-art idiom.
  c.fillRect(BALL_CX - 3, GLEAM_Y, 2, 2, BALL_HI);

  // Seams run the full ball, so the threading stays continuous on the crown
  // poking through the hoop window; the rim's front bar occludes them mid-ball.
  const seams = new Canvas(LOGICAL, LOGICAL);
  seams.line(BALL_CX, BALL_CY - BALL_R, BALL_CX, BALL_CY + BALL_R, SEAM);
  seams.line(BALL_CX - BALL_R, BALL_CY, BALL_CX + BALL_R, BALL_CY, SEAM);
  const seamRx = BALL_R * 0.58;
  seams.ellipseArc(BALL_CX - BALL_R, BALL_CY, seamRx, BALL_R, SEAM, 'right');
  seams.ellipseArc(BALL_CX + BALL_R, BALL_CY, seamRx, BALL_R, SEAM, 'left');
  stampWithinDisc(c, seams, BALL_CX, BALL_CY, BALL_R);
}

// Net mesh resolution: columns of cells, each crossed by both diagonals, so
// adjacent cells share strands and the mesh reads as woven diamonds that taper
// downward into deliberate scallop points.
const NET_ROWS = 3;
const NET_COLS = 3;
// Everything below the rim's front bar is re-composited in front of the ball:
// the whole ball below the rim plane is inside the net, seen through the
// diamond holes. The rim front draws last and hides the junction, so the front
// cords read as hanging from the front lip.
const NET_FRONT_Y = 12;

/** Edge x of the net at vertical fraction `f` (0 at the rim, 1 at the bottom). */
function netEdgeX(f: number, sign: number): number {
  const hw = NET_TOP_HW + (NET_BOT_HW - NET_TOP_HW) * f;
  return RIM_CX + sign * hw;
}

/** Draw the net as a tapering lattice of diamonds between NET_TOP and NET_BOT:
 * each grid cell gets both diagonals, and shared cell edges weave continuous
 * strands. Drawn once, behind the ball, in the opaque cord color. */
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
  // Explicit edge cords tracing the taper, so the net has a firm silhouette
  // hanging off the rim instead of implied corners.
  c.line(netEdgeX(0, -1), NET_TOP, netEdgeX(1, -1), NET_BOT, NET);
  c.line(netEdgeX(0, 1), NET_TOP, netEdgeX(1, 1), NET_BOT, NET);
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

/** Stamp the net's opaque pixels from `yStart` down in front of the ball,
 * softening any cord pixel strictly inside the ball's face to the warm
 * NET_OVER_BALL tone so the sphere stays readable through the mesh. Cords
 * crossing the black outline ring stay full cord gray, so the net visibly
 * grabs the ball's silhouette. */
function compositeNetFront(dst: Canvas, net: Canvas, yStart: number): void {
  for (let y = yStart; y < net.h; y++) {
    for (let x = 0; x < net.w; x++) {
      if (net.data[(y * net.w + x) * 4 + 3] === 0) continue;
      const dx = x + 0.5 - BALL_CX;
      const dy = y + 0.5 - BALL_CY;
      dst.plot(x, y, dx * dx + dy * dy <= BALL_R * BALL_R ? NET_OVER_BALL : NET);
    }
  }
}

/** The rim ring with a lit top lip, so the hoop reads as a solid metal ring
 * instead of a flat blob. */
function buildRim(): Canvas {
  const rim = new Canvas(LOGICAL, LOGICAL);
  rim.ellipseRing(RIM_CX, RIM_CY, RIM_RX, RIM_RY, RIM_T, RIM);
  // Lit lip: recolor just the ring's topmost curve rows.
  for (let y = 0; y <= RIM_CY - 4; y++) {
    for (let x = 0; x < rim.w; x++) {
      if (rim.data[(y * rim.w + x) * 4 + 3] !== 0) rim.plot(x, y, RIM_HI);
    }
  }
  return rim;
}

/** Compose the full mark into a 32x32 canvas. Z-order, back to front: the rim's
 * back arc, the net hanging behind the ball (its knots on the back arc show in
 * the hoop window's flank gaps), the ball, the net's front cords over the whole
 * ball below the rim plane (the ball is inside the net), then the rim's front
 * arc over the ball's crown and the cord junctions. */
function composeMark(c: Canvas): void {
  const rim = buildRim();
  const net = new Canvas(LOGICAL, LOGICAL);
  drawNet(net);

  compositeBand(c, rim, 0, RIM_CY); // back of the rim, behind the ball
  c.composite(net, 0, 0); // net hanging behind the ball
  drawBall(c);
  compositeNetFront(c, net, NET_FRONT_Y); // front of the net, over the ball
  compositeBand(c, rim, RIM_CY, LOGICAL); // front of the rim, over the ball
}

/** The mark on a transparent field: the Android adaptive foreground and splash,
 * the iOS dark and tinted icons, and the base of the splash lockup. */
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

/** A flat ink glyph for the Android monochrome themed-icon layer: an open rim
 * floating above a seamed ball. The seams are punched clear so the ball still
 * reads as a basketball once the launcher tints the whole shape one color. */
export function buildSilhouette(): Canvas {
  const c = new Canvas(LOGICAL, LOGICAL);
  c.ellipseRing(16, 7, 10, 3, 2, INK);
  const cx = 16;
  const cy = 19;
  const r = 8;
  c.disc(cx, cy, r, INK);
  const punch = new Canvas(LOGICAL, LOGICAL);
  punch.line(cx, cy - r, cx, cy + r, INK);
  punch.line(cx - r, cy, cx + r, cy, INK);
  punch.ellipseArc(cx - r, cy, r * 0.58, r, INK, 'right');
  punch.ellipseArc(cx + r, cy, r * 0.58, r, INK, 'left');
  for (let y = 0; y < LOGICAL; y++) {
    for (let x = 0; x < LOGICAL; x++) {
      const i = (y * LOGICAL + x) * 4;
      if (punch.data[i + 3] === 0) continue;
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > r * r) continue;
      c.plot(x, y, TRANSPARENT);
    }
  }
  return c.toSilhouette(INK);
}

/** The opaque Android adaptive background: the navy field with a faint court arc
 * in the lower third, so the layered icon still reads as on a court. */
export function buildBackground(): Canvas {
  const c = new Canvas(LOGICAL, LOGICAL, BG);
  c.ellipseRing(16, 40, 15, 16, 1, ARC);
  return c;
}

// Splash lockup spacing, in logical pixels: breathing room around the content,
// air between the mark and the wordmark, and the gap between the two lines.
const SPLASH_PAD = 2;
const SPLASH_MARK_GAP = 4;
const SPLASH_LINE_GAP = 3;

/** The splash composition: the mark cropped to its drawn art, with the "PIXEL
 * HOOPS" wordmark tight beneath it ("PIXEL" in ink, "HOOPS" in orange, as on the
 * home screen). The canvas hugs the content, so the baked PNG carries no dead
 * padding and expo-splash-screen's imageWidth maps to visible logo, not air.
 * Transparent field; the plugin paints the navy backgroundColor behind. */
export function buildSplash(): Canvas {
  const mark = buildMark();
  const art = opaqueBounds(mark);
  const markW = art.x1 - art.x0 + 1;
  const markH = art.y1 - art.y0 + 1;
  const w = Math.max(markW, textWidth('PIXEL'), textWidth('HOOPS')) + SPLASH_PAD * 2;
  const h =
    SPLASH_PAD +
    markH +
    SPLASH_MARK_GAP +
    GLYPH_H +
    SPLASH_LINE_GAP +
    GLYPH_H +
    SPLASH_PAD;
  const c = new Canvas(w, h);
  c.composite(mark, Math.round((w - markW) / 2) - art.x0, SPLASH_PAD - art.y0);

  const pixelY = SPLASH_PAD + markH + SPLASH_MARK_GAP;
  const hoopsY = pixelY + GLYPH_H + SPLASH_LINE_GAP;
  drawText(c, 'PIXEL', Math.round((w - textWidth('PIXEL')) / 2), pixelY, INK);
  drawText(c, 'HOOPS', Math.round((w - textWidth('HOOPS')) / 2), hoopsY, BALL);
  return c;
}
