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
