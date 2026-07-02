import { describe, it, expect } from 'vitest';
import {
  hexToRgba,
  opaqueBounds,
  toGrayscale,
  type Canvas,
  type RGBA,
} from '@/art/pixelCanvas';
import {
  buildMaster,
  buildMark,
  buildSilhouette,
  buildBackground,
  buildSplash,
  LOGICAL,
} from '@/art/iconArt';
import { palette } from '@/theme/palette';

// FNV-1a over the raw RGBA buffer: a cheap fingerprint to prove the art is a pure
// function of its constants (same input -> same bytes), mirroring the byte-stable
// guarantee the audio synth relies on.
function fingerprint(c: Canvas): number {
  let h = 0x811c9dc5;
  for (const b of c.data) {
    h ^= b;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function hasColor(c: Canvas, [r, g, b]: RGBA): boolean {
  for (let i = 0; i < c.data.length; i += 4) {
    if (
      c.data[i] === r &&
      c.data[i + 1] === g &&
      c.data[i + 2] === b &&
      c.data[i + 3] === 255
    ) {
      return true;
    }
  }
  return false;
}

function isFullyOpaque(c: Canvas): boolean {
  for (let i = 3; i < c.data.length; i += 4) {
    if (c.data[i] !== 255) return false;
  }
  return true;
}

function hasTransparent(c: Canvas): boolean {
  for (let i = 3; i < c.data.length; i += 4) {
    if (c.data[i] === 0) return true;
  }
  return false;
}

const BG = hexToRgba(palette.bgDeep);
const ORANGE = hexToRgba(palette.orange);
const RIM = hexToRgba(palette.epicRed);
const INK = hexToRgba(palette.ink);

describe('iconArt', () => {
  it('renders deterministically (same bytes every call)', () => {
    for (const build of [
      buildMaster,
      buildMark,
      buildSilhouette,
      buildBackground,
      buildSplash,
    ]) {
      expect(fingerprint(build())).toBe(fingerprint(build()));
    }
  });

  it('master is a 32x32 fully opaque icon on the navy field', () => {
    const c = buildMaster();
    expect([c.w, c.h]).toEqual([LOGICAL, LOGICAL]);
    expect(isFullyOpaque(c)).toBe(true);
    expect(hasColor(c, BG)).toBe(true); // background shows
    expect(hasColor(c, ORANGE)).toBe(true); // the ball
    expect(hasColor(c, RIM)).toBe(true); // the hoop rim
  });

  it('mark is transparent-backed with drawn pixels', () => {
    const c = buildMark();
    expect([c.w, c.h]).toEqual([LOGICAL, LOGICAL]);
    expect(hasTransparent(c)).toBe(true);
    expect(hasColor(c, ORANGE)).toBe(true);
  });

  it('mark art stays within 13px of center (Android splash circle safety)', () => {
    // The baker insets the mark to 75% of the Android splash canvas; that is
    // only mask-safe (192dp visible circle of 288dp) while every opaque pixel
    // sits within radius 13 of the 32-grid center. See generate-icon.ts.
    const c = buildMark();
    for (let y = 0; y < c.h; y++) {
      for (let x = 0; x < c.w; x++) {
        if (c.data[(y * c.w + x) * 4 + 3] === 0) continue;
        const dx = x + 0.5 - LOGICAL / 2;
        const dy = y + 0.5 - LOGICAL / 2;
        expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(13);
      }
    }
  });

  it('background is fully opaque (Android requires it)', () => {
    expect(isFullyOpaque(buildBackground())).toBe(true);
  });

  it('silhouette is a single ink color over transparency', () => {
    const c = buildSilhouette();
    expect(hasTransparent(c)).toBe(true);
    for (let i = 0; i < c.data.length; i += 4) {
      if (c.data[i + 3] === 0) continue;
      expect([c.data[i], c.data[i + 1], c.data[i + 2], c.data[i + 3]]).toEqual([
        ...INK.slice(0, 3),
        255,
      ]);
    }
  });

  it('splash carries the two-tone wordmark with no dead padding', () => {
    const c = buildSplash();
    expect(hasColor(c, INK)).toBe(true); // "PIXEL"
    expect(hasColor(c, ORANGE)).toBe(true); // "HOOPS" + ball
    // The canvas hugs its content so expo-splash-screen's imageWidth maps to
    // visible logo: at most the authored 2px of breathing room on every side.
    const b = opaqueBounds(c);
    expect(b.x0).toBeLessThanOrEqual(2);
    expect(b.y0).toBeLessThanOrEqual(2);
    expect(c.w - 1 - b.x1).toBeLessThanOrEqual(2);
    expect(c.h - 1 - b.y1).toBeLessThanOrEqual(2);
  });

  it('grayscale mark (iOS tinted icon) is neutral and alpha-preserving', () => {
    const mark = buildMark();
    const c = toGrayscale(mark);
    let sawGray = false;
    for (let i = 0; i < c.data.length; i += 4) {
      expect(c.data[i + 3]).toBe(mark.data[i + 3]);
      if (c.data[i + 3] === 0) continue;
      expect(c.data[i]).toBe(c.data[i + 1]);
      expect(c.data[i + 1]).toBe(c.data[i + 2]);
      sawGray = true;
    }
    expect(sawGray).toBe(true);
  });
});
