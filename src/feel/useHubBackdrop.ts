import { useIdle, HUB_IDLE_MS } from './useIdle';

/**
 * The hub-screen arcade ambience bundle: the idle tracker plus the three <Screen> props
 * that mount the drifting court backdrop and CRT vignette and wake them on touch. Packaged
 * so the gated trio (backdrop + its idle pause + the touch-wake) always travels together:
 * a screen can never mount the backdrop while forgetting to quiet it on idle. Spread
 * `screenProps` onto <Screen>; read `idle` for any extra attract loop on the same screen
 * (e.g. the home title glow/bob), and `bump` if you need to wake manually.
 */
export function useHubBackdrop() {
  const { idle, bump } = useIdle(HUB_IDLE_MS);
  return {
    idle,
    bump,
    screenProps: {
      backdrop: true,
      backdropPaused: idle,
      vignette: true,
      onTouchStart: bump,
    },
  } as const;
}
