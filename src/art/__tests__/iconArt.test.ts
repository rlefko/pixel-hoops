import { describe, it, expect } from 'vitest';
import { hexToRgba, type Canvas, type RGBA } from '@/art/pixelCanvas';
import {
  buildMaster,
  buildMark,
  buildSilhouette,
  buildBackground,
  buildSplash,
  LOGICAL,
  SPLASH_W,
  SPLASH_H,
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

  it('splash carries the two-tone wordmark', () => {
    const c = buildSplash();
    expect([c.w, c.h]).toEqual([SPLASH_W, SPLASH_H]);
    expect(hasColor(c, INK)).toBe(true); // "PIXEL"
    expect(hasColor(c, ORANGE)).toBe(true); // "HOOPS" + ball
  });
});
