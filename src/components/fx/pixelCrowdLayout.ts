import { hashSeed } from '@/game/rng';
import { palette } from '@/theme/palette';

/**
 * Seat layout math for PixelCrowd, kept pure (this module must not import
 * react-native — it is unit-tested in node, the courtDimensions convention).
 *
 * Density is FULLNESS: a seat exists when its hash falls UNDER the density
 * bar, and because the bar only rises with density the packed late-run crowd
 * is a strict superset of the sparse early crowd (for the same seed) — seats
 * fill in as the bracket climbs, they never reshuffle. Colors cycle the
 * hue-shifted silhouette trio (never pure black) so adjacent seats never
 * match, with sparse gold accents that double as the camera-flash anchors.
 */

export const SEAT_SIZE = 5;
/** Center-to-center seat spacing; preserves the old CrowdBand's floor(width/8). */
export const SEAT_PITCH = 8;
/** Fraction of seats wearing the bright accent (also the camera-flash spots). */
const ACCENT_RATE = 0.04;

export const CROWD_COLORS = [palette.inkDim, palette.steelBlue, palette.orange];

export interface CrowdSeat {
  /** px offset along the strip axis. */
  main: number;
  /** px offset across rows (row 0 is the front row). */
  cross: number;
  color: string;
  /** Bob group: alternating columns move on opposite frames. */
  phase: 0 | 1;
  /** Bright gold seat (a shirt, a sign): the camera-flash anchor. */
  accent: boolean;
}

export function seatCount(lengthPx: number): number {
  return Math.max(0, Math.floor(lengthPx / SEAT_PITCH));
}

/** Deterministic 0..1 hash over the shared FNV-1a (src/game/rng.ts), stable
 * across sessions and platforms. */
function hash01(seed: string | number, i: number): number {
  return hashSeed(`${seed}:${i}`) / 4294967296;
}

export function crowdSeats(
  lengthPx: number,
  rows: number,
  density: number,
  seed: string | number
): CrowdSeat[] {
  const perRow = seatCount(lengthPx);
  const seats: CrowdSeat[] = [];
  for (let row = 0; row < rows; row++) {
    for (let i = 0; i < perRow; i++) {
      // Disjoint hash stream per row (safe: a row would need a ~32k-px strip
      // before its seat indexes reached the next row's stream).
      const idx = row * 4096 + i;
      if (hash01(`${seed}:p`, idx) >= density) continue;
      const accent = hash01(`${seed}:a`, idx) < ACCENT_RATE;
      seats.push({
        main: i * SEAT_PITCH,
        cross: row * SEAT_PITCH,
        // Row offset keeps vertical neighbors mismatched too.
        color: accent ? palette.gold : CROWD_COLORS[(i + row) % CROWD_COLORS.length],
        phase: (i % 2) as 0 | 1,
        accent,
      });
    }
  }
  return seats;
}

/** How full the map's arena sits at this bracket depth: 60% on map one, packed
 * at the final. Legible escalation on the cheapest possible channel. */
export function crowdDensityFor(mapIndex: number, totalMaps: number): number {
  if (totalMaps <= 1) return 1;
  const t = Math.min(1, Math.max(0, mapIndex / (totalMaps - 1)));
  return 0.6 + 0.4 * t;
}
