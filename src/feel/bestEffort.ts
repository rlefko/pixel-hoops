import { Platform } from 'react-native';

/**
 * Shared primitives for the "feel" side effects (haptics, sound). Both are
 * intentionally inert on web (so the web build stays green) and best-effort: a
 * failed buzz or blip must never surface to the player or break the call site.
 */

/** True on web, where the native feel modules are deliberately no-ops. */
export const IS_WEB = Platform.OS === 'web';

/** Run a side effect, swallowing any failure. Feel effects are always best-effort. */
export function bestEffort(fn: () => void): void {
  try {
    fn();
  } catch {
    /* feel is best-effort */
  }
}
