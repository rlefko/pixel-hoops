/**
 * Tiny pure pixel-art engine. A Canvas is a flat RGBA buffer plus a handful of
 * 8-bit drawing primitives (plot, fillRect, disc, ellipse, ring, line, composite).
 * It has NO jimp/Node/React imports and no randomness or clock, so it is fully
 * deterministic and type-checks under the app tsconfig, mirroring how src/audio's
 * synth is a pure engine separate from the wav encoder and the generator script.
 *
 * Art is authored on a small logical grid (a few dozen "big pixels"); the
 * generator (scripts/generate-icon.ts) copies a Canvas into jimp and upscales it
 * nearest-neighbor so the stored PNGs read as crisp square pixels, the same
 * pipeline as scripts/pixelate-logos.ts.
 */

/** A color as four 0..255 channels: red, green, blue, alpha. */
export type RGBA = readonly [number, number, number, number];

/** Fully transparent, used as the default fill and to clear pixels. */
export const TRANSPARENT: RGBA = [0, 0, 0, 0];

/** Parse a `#RGB` or `#RRGGBB` string into an opaque (or given-alpha) RGBA. */
export function hexToRgba(hex: string, alpha = 255): RGBA {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  if (full.length !== 6) {
    throw new Error(`hexToRgba expects #RGB or #RRGGBB, got "${hex}"`);
  }
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return [r, g, b, alpha];
}

/**
 * Linear blend from opaque `a` to opaque `b` by `t` in 0..1, returning an opaque
 * color. Lets the art pre-mix a softened tone (e.g. a faint court line over navy)
 * without using a sub-255 alpha, which would punch a hole in an opaque layer.
 */
export function mix(a: RGBA, b: RGBA, t: number): RGBA {
  const lerp = (x: number, y: number) => Math.round(x + (y - x) * t);
  return [lerp(a[0], b[0]), lerp(a[1], b[1]), lerp(a[2], b[2]), 255];
}

export class Canvas {
  readonly w: number;
  readonly h: number;
  /** RGBA, row-major, length w * h * 4. Same layout as a jimp bitmap. */
  readonly data: Uint8ClampedArray;

  constructor(w: number, h: number, fill: RGBA = TRANSPARENT) {
    this.w = w;
    this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
    if (fill[3] !== 0) this.fillRect(0, 0, w, h, fill);
  }

  /** Overwrite a single pixel (alpha and all). Out-of-bounds writes are ignored. */
  plot(x: number, y: number, c: RGBA): void {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return;
    const i = (yi * this.w + xi) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = c[3];
  }

  /** Fill the whole canvas with one color. */
  fill(c: RGBA): void {
    this.fillRect(0, 0, this.w, this.h, c);
  }

  fillRect(x: number, y: number, w: number, h: number, c: RGBA): void {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) this.plot(xx, yy, c);
    }
  }

  /**
   * Filled disc of radius `r` centered at (cx, cy). Each logical pixel is sampled
   * at its center (+0.5) against r^2 so the silhouette steps in chunky 8-bit
   * blocks rather than anti-aliasing, matching BasketballIcon's r16 disc.
   */
  disc(cx: number, cy: number, r: number, c: RGBA): void {
    this.ellipse(cx, cy, r, r, c);
  }

  /** Filled axis-aligned ellipse with radii (rx, ry) centered at (cx, cy). */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGBA): void {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.plot(x, y, c);
      }
    }
  }

  /**
   * Ellipse ring: pixels inside the (rx, ry) ellipse but outside the one shrunk
   * by `thickness`. Used for the open hoop rim.
   */
  ellipseRing(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    thickness: number,
    c: RGBA
  ): void {
    const ix = Math.max(0.001, rx - thickness);
    const iy = Math.max(0.001, ry - thickness);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const ox = (x + 0.5 - cx) / rx;
        const oy = (y + 0.5 - cy) / ry;
        if (ox * ox + oy * oy > 1) continue;
        const nx = (x + 0.5 - cx) / ix;
        const ny = (y + 0.5 - cy) / iy;
        if (nx * nx + ny * ny <= 1) continue;
        this.plot(x, y, c);
      }
    }
  }

  /**
   * Trace a thin vertical half-ellipse: one pixel per row on the +x ('right') or
   * -x ('left') flank of the ellipse. The basketball's curved side seams are each
   * an arc like this, centered on a ball edge so only the inward-bulging half
   * lands on the ball (matching BasketballIcon's `A 9 16` side-seam paths).
   */
  ellipseArc(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    c: RGBA,
    side: 'left' | 'right'
  ): void {
    const dir = side === 'right' ? 1 : -1;
    for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++) {
      const t = (y + 0.5 - cy) / ry;
      if (t < -1 || t > 1) continue;
      this.plot(cx + dir * rx * Math.sqrt(1 - t * t), y, c);
    }
  }

  /** Bresenham line from (x0, y0) to (x1, y1). Used for seams and net strands. */
  line(x0: number, y0: number, x1: number, y1: number, c: RGBA): void {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const xEnd = Math.round(x1);
    const yEnd = Math.round(y1);
    const dx = Math.abs(xEnd - x);
    const dy = -Math.abs(yEnd - y);
    const sx = x < xEnd ? 1 : -1;
    const sy = y < yEnd ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.plot(x, y, c);
      if (x === xEnd && y === yEnd) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  /**
   * Straight-alpha source-over composite of another canvas onto this one at
   * (dx, dy). A translucent source reads correctly over both an opaque base (the
   * result stays fully opaque, so the icon master keeps no transparency) and a
   * transparent base (the source color is preserved at its own alpha).
   */
  composite(src: Canvas, dx: number, dy: number): void {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const si = (y * src.w + x) * 4;
        const sa = src.data[si + 3];
        if (sa === 0) continue;
        const tx = dx + x;
        const ty = dy + y;
        if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) continue;
        if (sa === 255) {
          this.plot(tx, ty, [
            src.data[si],
            src.data[si + 1],
            src.data[si + 2],
            255,
          ]);
          continue;
        }
        const ti = (ty * this.w + tx) * 4;
        const sA = sa / 255;
        const dA = this.data[ti + 3] / 255;
        const outA = sA + dA * (1 - sA);
        if (outA <= 0) continue;
        const inv = 1 / outA;
        for (let k = 0; k < 3; k++) {
          this.data[ti + k] =
            (src.data[si + k] * sA + this.data[ti + k] * dA * (1 - sA)) * inv;
        }
        this.data[ti + 3] = Math.round(outA * 255);
      }
    }
  }

  /**
   * A new canvas where every non-transparent pixel becomes `c` at full alpha and
   * everything else stays clear: a flat single-color silhouette for the Android
   * monochrome (themed) icon layer.
   */
  toSilhouette(c: RGBA): Canvas {
    const out = new Canvas(this.w, this.h);
    for (let i = 0; i < this.data.length; i += 4) {
      if (this.data[i + 3] === 0) continue;
      out.data[i] = c[0];
      out.data[i + 1] = c[1];
      out.data[i + 2] = c[2];
      out.data[i + 3] = 255;
    }
    return out;
  }
}
