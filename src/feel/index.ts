export { DUR, SHAKE_PX, scaled, type ShakeIntensity } from './timings';
export { haptics, setHapticsEnabled } from './haptics';
export {
  sfx,
  setSoundEnabled,
  setSoundVolume,
  type TapVariant,
  type WhooshDirection,
} from './audio';
export {
  playMusicContext,
  setGameEnergy,
  setMusicVolume,
  type MusicContext,
} from './music';
export {
  FeelSettingsProvider,
  useFeelSettings,
  SIM_SPEED_FACTOR,
  SIM_SPEED_ORDER,
  type FeelSettings,
  type SimSpeed,
} from './FeelSettingsContext';
export { useScreenShake } from './useScreenShake';
export { usePop } from './usePop';
export { useGlowPulse, useBobPulse, useScalePulse } from './usePulse';
export { useStaggerIn } from './useStaggerIn';
export { useLiveChip } from './useLiveChip';
export { useIdle, HUB_IDLE_MS } from './useIdle';
export { useHubBackdrop } from './useHubBackdrop';
export { useFlash } from './useFlash';
export { useCountUp } from './useCountUp';
export { useBallFlight } from './useBallFlight';
export { useStagedReveal } from './useStagedReveal';
export {
  usePixelWipe,
  type WipeVariant,
  type WipeConfig,
} from './usePixelWipe';
