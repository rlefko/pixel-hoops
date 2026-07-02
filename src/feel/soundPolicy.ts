import type { SfxName } from '@/audio/sfxManifest'; // type-only: erased, keeps node tests RN-free

/**
 * Pure sound-effect gating policy, kept free of React Native and expo-audio so it
 * can be unit-tested under vitest's node environment and reasoned about in one place.
 *
 * Sound is effectively on only when the player has it on AND the device is not in
 * Low Power Mode (iOS) / battery saver (Android). The Low Power gate mirrors the
 * Reduce Motion behavior added in PR #90: the app calms itself when the battery is
 * low. The `hydrated` gate keeps boot honest: until persisted settings load, we do
 * not activate the audio engine (so a player who turned sound off never pays the
 * cost of spinning it up first).
 */
export function isSoundEffective(
  hydrated: boolean,
  soundEnabled: boolean,
  lowPowerMode: boolean
): boolean {
  return hydrated && soundEnabled && !lowPowerMode;
}

/** Same policy for background music: on only once hydrated, enabled, and not in Low Power. */
export function isMusicEffective(
  hydrated: boolean,
  musicEnabled: boolean,
  lowPowerMode: boolean
): boolean {
  return hydrated && musicEnabled && !lowPowerMode;
}

/**
 * Cooldown per rapid-fire cue, in ms; cues not listed play ungated. Taps and toggles
 * guard against machine-gunning at 45ms. Count ticks breathe at 80ms so a tally's
 * climb (capped at 600ms in useCountUp) sings ~8 notes, matching TickCounter's
 * 8-step pitch ladder, and each skipped note also skips its native audio calls.
 */
export const RAPID_CUE_COOLDOWN_MS: Partial<Record<SfxName, number>> = {
  tapPrimary: 45,
  tapSecondary: 45,
  toggle: 45,
  tick: 80,
};
