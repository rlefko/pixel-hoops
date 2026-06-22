import { describe, it, expect } from 'vitest';
import {
  parseHex,
  toHex,
  mix,
  luminance,
  contrastRatio,
  pickReadable,
} from '@/theme/color';

describe('parseHex', () => {
  it('parses 6-digit hex with and without #', () => {
    expect(parseHex('#FF8800')).toEqual({ r: 255, g: 136, b: 0 });
    expect(parseHex('ff8800')).toEqual({ r: 255, g: 136, b: 0 });
  });

  it('expands 3-digit shorthand', () => {
    expect(parseHex('#f80')).toEqual({ r: 255, g: 136, b: 0 });
  });

  it('returns null on malformed input', () => {
    expect(parseHex('#xyz')).toBeNull();
    expect(parseHex('#12345')).toBeNull();
    expect(parseHex('nope')).toBeNull();
  });
});

describe('toHex', () => {
  it('round-trips parseHex', () => {
    expect(toHex(parseHex('#1a2b3c')!)).toBe('#1a2b3c');
  });

  it('clamps out-of-range channels', () => {
    expect(toHex({ r: -10, g: 300, b: 128 })).toBe('#00ff80');
  });
});

describe('mix', () => {
  it('returns the endpoints at t=0 and t=1', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff');
  });

  it('returns mid-gray at the midpoint of black and white', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('clamps t outside [0,1]', () => {
    expect(mix('#000000', '#ffffff', 2)).toBe('#ffffff');
    expect(mix('#000000', '#ffffff', -1)).toBe('#000000');
  });

  it('falls back to a valid endpoint when one side is malformed', () => {
    expect(mix('nope', '#ffffff', 0.5)).toBe('#ffffff');
    expect(mix('#000000', 'nope', 0.5)).toBe('#000000');
  });
});

describe('luminance', () => {
  it('orders white > gray > black', () => {
    expect(luminance('#ffffff')).toBeGreaterThan(luminance('#808080'));
    expect(luminance('#808080')).toBeGreaterThan(luminance('#000000'));
  });

  it('treats malformed input as black', () => {
    expect(luminance('nope')).toBe(0);
  });
});

describe('contrastRatio', () => {
  it('is 21 for black vs white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('is 1 for identical colors', () => {
    expect(contrastRatio('#2d3142', '#2d3142')).toBeCloseTo(1, 5);
  });
});

describe('pickReadable', () => {
  it('returns the first candidate that clears the threshold', () => {
    // White reads clearly over a dark floor.
    expect(pickReadable('#2d3142', ['#ffffff', '#000000'], '#ff7a1a')).toBe(
      '#ffffff'
    );
  });

  it('falls back when no candidate clears and fallback reads better', () => {
    // A near-floor secondary (Bulls #2E2E2E over the floor #2D3142) is invisible;
    // the bright orange fallback must win.
    const picked = pickReadable('#2d3142', ['#2e2e2e'], '#ff7a1a');
    expect(picked).toBe('#ff7a1a');
  });

  it('prefers the higher-contrast candidate over a worse fallback', () => {
    // Light gray beats a fallback that is itself near the floor.
    const picked = pickReadable('#2d3142', ['#cccccc'], '#303442', 99);
    expect(picked).toBe('#cccccc');
  });
});
