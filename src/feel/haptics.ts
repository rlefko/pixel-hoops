import * as Haptics from 'expo-haptics';
import { IS_WEB, bestEffort } from './bestEffort';

/**
 * Semantic haptics wrapper. Call sites use intent names (success, bigPlay, ...)
 * instead of raw expo-haptics. Globally disablable (driven by FeelSettings) and
 * a no-op on web so the web build stays green. Best-effort: failures are
 * swallowed.
 */

let enabled = true;

/** Toggle all haptics (wired to FeelSettings.hapticsEnabled). */
export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

function guard(fn: () => void): void {
  if (!enabled || IS_WEB) return;
  bestEffort(fn);
}

export const haptics = {
  light: () => guard(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: () => guard(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  heavy: () => guard(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  selection: () => guard(() => Haptics.selectionAsync()),
  success: () => guard(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => guard(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => guard(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  /** Triple-burst rhythm for big plays (dunk, three, block, steal). */
  bigPlay: () => {
    guard(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
    setTimeout(() => guard(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)), 60);
    setTimeout(() => guard(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)), 120);
  },
};
