/**
 * iOS Low Power Mode / Android battery saver hook (native), re-exported from
 * expo-battery. The web build resolves the sibling `useLowPowerMode.web.ts`
 * instead (Metro platform resolution), so expo-battery is never touched on web,
 * where its native event subscription (`ExpoBattery.addListener`) does not exist
 * and throws.
 */
export { useLowPowerMode } from 'expo-battery';
