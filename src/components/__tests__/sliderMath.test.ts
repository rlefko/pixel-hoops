import { describe, it, expect } from 'vitest';
import { clamp01, snapToStep } from '../sliderMath';

describe('clamp01', () => {
  it('clamps below 0 and above 1, and passes mid-range through', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(0.3)).toBe(0.3);
  });
});

describe('snapToStep', () => {
  it('snaps to the nearest step multiple', () => {
    expect(snapToStep(0.07, 0.05)).toBeCloseTo(0.05);
    expect(snapToStep(0.08, 0.05)).toBeCloseTo(0.1);
    expect(snapToStep(0.5, 0.1)).toBeCloseTo(0.5);
  });

  it('clamps the result into 0..1', () => {
    expect(snapToStep(-1, 0.05)).toBe(0);
    expect(snapToStep(2, 0.05)).toBe(1);
  });

  it('returns the clamped value untouched when step is non-positive', () => {
    expect(snapToStep(0.42, 0)).toBe(0.42);
    expect(snapToStep(0.42, -0.1)).toBe(0.42);
  });
});
