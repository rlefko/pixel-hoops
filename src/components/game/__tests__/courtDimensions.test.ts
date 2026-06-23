import { describe, it, expect } from 'vitest';
import {
  COURT,
  LANE,
  FT_CIRCLE,
  THREE,
  RIM_CENTER_FRACTION_X,
  RIM_CENTER_FRACTION_Y,
} from '@/components/game/courtDimensions';
import { rimCenterPx } from '@/components/game/courtGeometry';

describe('courtDimensions', () => {
  it('uses the official 94 x 50 court', () => {
    expect(COURT.length).toBe(94);
    expect(COURT.width).toBe(50);
  });

  it('places the rim 5.25 ft from the baseline, centered', () => {
    expect(RIM_CENTER_FRACTION_X).toBe(0.5);
    expect(RIM_CENTER_FRACTION_Y).toBeCloseTo(5.25 / 94, 5);
    expect(RIM_CENTER_FRACTION_Y).toBeCloseTo(0.05585, 4);
  });

  it('lays the 16 ft lane symmetrically in the 50 ft width', () => {
    expect(LANE.x / COURT.width).toBeCloseTo(0.34, 5);
    expect((LANE.x + LANE.w) / COURT.width).toBeCloseTo(0.66, 5);
  });

  it('centers the free-throw circle on the 19 ft line', () => {
    expect(FT_CIRCLE.cy / COURT.length).toBeCloseTo(0.2021, 4);
  });

  it('joins the three-point corners to the arc at the exact geometry', () => {
    // The straight corner (22 ft from the basket) meets the 23.75 ft arc here.
    expect(THREE.cornerTopY).toBeCloseTo(14.198, 2);
    // The far corner mirrors the near one across the 50 ft width.
    expect(THREE.cornerXFar).toBe(COURT.width - THREE.cornerX);
    // The arc apex sits 23.75 ft past the rim.
    expect(THREE.apexY).toBe(29);
  });
});

describe('rimCenterPx', () => {
  it('targets the drawn rim and mirrors top and bottom', () => {
    const width = 500;
    const height = 940;
    const home = rimCenterPx('home', width, height);
    const away = rimCenterPx('away', width, height);
    // Home attacks the top rim, 5.25 ft from the top baseline.
    expect(home.x).toBe(width / 2);
    expect(home.y).toBeCloseTo(height * RIM_CENTER_FRACTION_Y, 5);
    // The two rims are mirror images about the center line.
    expect(away.x).toBe(home.x);
    expect(home.y + away.y).toBeCloseTo(height, 5);
  });

  it('scales with the court height (no fixed pixel offset)', () => {
    const tall = rimCenterPx('home', 500, 1880);
    const short = rimCenterPx('home', 500, 940);
    expect(tall.y).toBeCloseTo(short.y * 2, 5);
  });
});
