import { describe, it, expect } from 'vitest';
import { scaled } from '@/feel/timings';

// `scaled` is the single knob behind the playback-speed control: every event gap
// and animation duration runs through it, so the ball and the scheduler scale
// together. It is pure (no React Native), so it is safe to unit-test in Node.
describe('scaled', () => {
  it('returns the duration unchanged at 1x', () => {
    expect(scaled(260, 1)).toBe(260);
    expect(scaled(120, 1)).toBe(120);
  });

  it('divides by the speed factor and rounds to whole ms', () => {
    expect(scaled(260, 2)).toBe(130);
    expect(scaled(260, 1.6)).toBe(Math.round(260 / 1.6)); // 163
    expect(scaled(300, 2.5)).toBe(120);
  });

  it('floors at 60ms so the fastest speed never teleports', () => {
    expect(scaled(50, 1)).toBe(60);
    expect(scaled(120, 2.5)).toBe(60); // 48 -> floored
    expect(scaled(160, 2.5)).toBe(64); // above the floor, kept
  });

  it('is monotonic: a higher speed never produces a longer gap', () => {
    const ms = 600;
    expect(scaled(ms, 2.5)).toBeLessThanOrEqual(scaled(ms, 1.6));
    expect(scaled(ms, 1.6)).toBeLessThanOrEqual(scaled(ms, 1));
  });
});
