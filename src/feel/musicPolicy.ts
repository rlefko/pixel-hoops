import type { MusicName } from '@/audio/musicManifest';

/**
 * Pure music-bed selection policy, kept free of React Native and expo-audio so it can
 * be unit-tested under vitest's node environment (mirrors ./soundPolicy). ./music owns
 * the players and fades; this module owns the decisions: which bed a declared context
 * targets, and which beds that target needs resident.
 */

export type MusicContext = 'menu' | 'run';

export const MENU_TRACK: MusicName = 'menuTheme';
export const RUN_THEMES: MusicName[] = ['runThemeA', 'runThemeB'];
export const ENERGY_TRACK: MusicName = 'gameEnergy';

export function isRunTheme(name: MusicName | null): boolean {
  return name === 'runThemeA' || name === 'runThemeB';
}

/**
 * Pick the bed a declared context should play. 'run' keeps the current run theme if one
 * is already playing (stable within a run) or picks the next rotating theme on entry, so
 * a long session alternates themes. Rotation advances only when a new run theme is picked.
 */
export function resolveMusicTarget(
  ctx: MusicContext,
  current: MusicName | null,
  rotation: number
): { target: MusicName; nextRotation: number } {
  if (ctx === 'menu') return { target: MENU_TRACK, nextRotation: rotation };
  if (isRunTheme(current)) return { target: current as MusicName, nextRotation: rotation };
  return { target: RUN_THEMES[rotation % RUN_THEMES.length], nextRotation: rotation + 1 };
}

/** The beds a target needs resident: run themes carry the game-energy layer with them. */
export function bedsFor(target: MusicName): MusicName[] {
  return isRunTheme(target) ? [target, ENERGY_TRACK] : [target];
}
