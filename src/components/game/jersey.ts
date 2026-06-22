import { hashSeed } from '@/game/rng';

/** Stable per-player cosmetics (jersey number, skin tone) derived from a name. */

/** A stable jersey number in [0, 54] for a player name (fakes have no real #). */
export function jerseyNumber(name: string): number {
  return hashSeed(name) % 55;
}

/** A stable skin-tone index for a player name (PixelPlayer wraps it modulo). */
export function skinIndexFor(name: string): number {
  return hashSeed(name);
}
