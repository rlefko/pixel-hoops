import { describe, it, expect } from 'vitest';
import {
  crowdDensityFor,
  crowdSeats,
  seatCount,
  SEAT_PITCH,
} from '@/components/fx/pixelCrowdLayout';
import { palette } from '@/theme/palette';

describe('seatCount', () => {
  it('preserves the old CrowdBand parity: one seat per 8px', () => {
    expect(seatCount(320)).toBe(Math.floor(320 / 8));
    expect(seatCount(0)).toBe(0);
    expect(seatCount(-10)).toBe(0);
  });
});

describe('crowdSeats', () => {
  it('fills every seat at density 1 and none at density 0', () => {
    expect(crowdSeats(320, 1, 1, 'seed')).toHaveLength(seatCount(320));
    expect(crowdSeats(320, 1, 0, 'seed')).toHaveLength(0);
  });

  it('is monotone in density: crowds fill in, they never reshuffle', () => {
    const seed = 'run-42';
    const sparse = crowdSeats(400, 2, 0.6, seed);
    const packed = crowdSeats(400, 2, 0.9, seed);
    const packedKeys = new Set(packed.map((s) => `${s.main}:${s.cross}`));
    for (const s of sparse) {
      expect(packedKeys.has(`${s.main}:${s.cross}`)).toBe(true);
    }
    expect(packed.length).toBeGreaterThan(sparse.length);
  });

  it('doubles the seat pool with a second row and offsets it by the pitch', () => {
    const one = crowdSeats(320, 1, 1, 'seed');
    const two = crowdSeats(320, 2, 1, 'seed');
    expect(two).toHaveLength(one.length * 2);
    expect(new Set(two.map((s) => s.cross))).toEqual(new Set([0, SEAT_PITCH]));
  });

  it('never seats two adjacent non-accent neighbors in the same color', () => {
    const seats = crowdSeats(800, 2, 1, 'seed');
    const byRow = new Map<number, typeof seats>();
    for (const s of seats) {
      const row = byRow.get(s.cross) ?? [];
      row.push(s);
      byRow.set(s.cross, row);
    }
    for (const row of byRow.values()) {
      row.sort((a, b) => a.main - b.main);
      for (let i = 1; i < row.length; i++) {
        if (row[i].accent || row[i - 1].accent) continue;
        expect(row[i].color).not.toBe(row[i - 1].color);
      }
    }
  });

  it('keeps gold accents sparse and alternates bob phases by column', () => {
    const seats = crowdSeats(800, 2, 1, 'seed');
    const accents = seats.filter((s) => s.accent);
    expect(accents.length / seats.length).toBeLessThan(0.1);
    for (const s of accents) expect(s.color).toBe(palette.gold);
    for (const s of seats) expect(s.phase).toBe(((s.main / SEAT_PITCH) % 2) as 0 | 1);
  });

  it('is deterministic for a seed and different across seeds', () => {
    const a = crowdSeats(400, 1, 0.7, 'alpha');
    const b = crowdSeats(400, 1, 0.7, 'alpha');
    const c = crowdSeats(400, 1, 0.7, 'omega');
    expect(a).toEqual(b);
    expect(a.map((s) => s.main).join()).not.toBe(c.map((s) => s.main).join());
  });
});

describe('crowdDensityFor', () => {
  it('starts at 60% and packs the final map', () => {
    expect(crowdDensityFor(0, 7)).toBeCloseTo(0.6);
    expect(crowdDensityFor(6, 7)).toBe(1);
  });

  it('is monotone and clamped', () => {
    let prev = 0;
    for (let i = 0; i < 7; i++) {
      const d = crowdDensityFor(i, 7);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
    expect(crowdDensityFor(99, 7)).toBe(1);
    expect(crowdDensityFor(-1, 7)).toBeCloseTo(0.6);
    expect(crowdDensityFor(0, 1)).toBe(1);
  });
});
