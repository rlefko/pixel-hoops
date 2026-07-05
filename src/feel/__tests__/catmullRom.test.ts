import { describe, it, expect } from 'vitest';
import { catmullRom } from '../catmullRom';
import type { Pt } from '../ballPath';

describe('catmullRom', () => {
  it('passes through the endpoints', () => {
    const ctrl: Pt[] = [
      { x: 0, y: 0 },
      { x: 1, y: 2 },
      { x: 3, y: 1 },
      { x: 4, y: 4 },
    ];
    expect(catmullRom(ctrl, 0)).toEqual(ctrl[0]);
    expect(catmullRom(ctrl, 1)).toEqual(ctrl[3]);
  });

  it('is a straight lerp for two points', () => {
    const ctrl: Pt[] = [{ x: 0, y: 0 }, { x: 10, y: 20 }];
    expect(catmullRom(ctrl, 0.5)).toEqual({ x: 5, y: 10 });
  });

  it('handles degenerate inputs without NaN', () => {
    expect(catmullRom([], 0.5)).toEqual({ x: 0, y: 0 });
    expect(catmullRom([{ x: 2, y: 3 }], 0.7)).toEqual({ x: 2, y: 3 });
    const dup: Pt[] = [{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 1 }];
    const p = catmullRom(dup, 0.5);
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });

  it('clamps t outside [0,1]', () => {
    const ctrl: Pt[] = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }];
    expect(catmullRom(ctrl, -1)).toEqual(ctrl[0]);
    expect(catmullRom(ctrl, 2)).toEqual(ctrl[2]);
  });
});
