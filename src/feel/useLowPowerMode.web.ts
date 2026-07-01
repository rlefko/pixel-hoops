/**
 * Web implementation of the Low Power Mode hook. There is no battery / low-power
 * API on web, so it is always `false`. Same signature as the native
 * `useLowPowerMode.ts`, so the app simply never enters the low-power path in the
 * browser (expo-battery's native listener does not exist on web and would throw).
 */
export function useLowPowerMode(): boolean {
  return false;
}
