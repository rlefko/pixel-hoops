import { createContext, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { PixelWipeOverlay, type PixelWipeHandle } from '@/components/fx';
import { type WipeConfig, type WipeVariant } from '@/feel';
import { palette } from '@/theme';

/** Arcade-flavored navigation: a drop-in for expo-router's push/replace/back
 *  that plays a pixel-dissolve wipe around each route change. */
export interface ArcadeRouter {
  push: (href: Href, variant?: WipeVariant) => void;
  replace: (href: Href, variant?: WipeVariant) => void;
  back: (variant?: WipeVariant) => void;
}

export const TransitionContext = createContext<ArcadeRouter | null>(null);

/**
 * Per-destination wipe identity: each screen gets its own accent color and label,
 * so navigation reads as a distinct, themed beat instead of one drab dark wipe.
 * Colors mirror the home menu tiles.
 */
const ROUTE_WIPE: Record<string, { color: string; label: string }> = {
  '/': { color: palette.gold, label: 'HOME' },
  '/locker': { color: palette.makeGreen, label: 'LOCKER ROOM' },
  '/arcade': { color: palette.flame, label: 'ARCADE' },
  '/roster': { color: palette.steelBlue, label: 'ROSTER' },
  '/hall-of-fame': { color: palette.gold, label: 'HALL OF FAME' },
  '/settings': { color: palette.inkDim, label: 'SETTINGS' },
};

function hrefToPath(href: Href): string {
  if (typeof href === 'string') return href.split('?')[0];
  // Object hrefs do not occur today; handle defensively.
  return (href as { pathname?: string }).pathname ?? '/';
}

/**
 * Build the wipe config for a navigation. The run variant is its own boot. A menu
 * navigation themes by destination and sweeps forward, while any return to home
 * (back, or replace('/')) mirrors backward with no label.
 */
function buildConfig(variant: WipeVariant, href: Href | null): WipeConfig {
  if (variant === 'run') {
    return { variant: 'run', color: palette.gold, label: 'GET READY', direction: 'forward' };
  }
  const path = href ? hrefToPath(href) : '/';
  const goingHome = path === '/';
  // Unknown route: gold accent, no label.
  const meta: { color: string; label?: string } = ROUTE_WIPE[path] ?? { color: palette.gold };
  return {
    variant: 'menu',
    color: meta.color,
    label: goingHome ? undefined : meta.label,
    direction: goingHome ? 'backward' : 'forward',
  };
}

/**
 * Wraps the navigator and turns every route change into an arcade pixel-dissolve:
 * cover the screen, run the real navigation while it is fully hidden, then reveal
 * the new screen. The native stack is set to `animation: 'none'`, so the only
 * motion the player sees is this wipe. Mounted at the root, above the Stack, so
 * the overlay paints over every screen and bleeds under the status bar.
 */
export function TransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const wipeRef = useRef<PixelWipeHandle>(null);
  // A plain ref (not state) so rapid double-taps are rejected synchronously,
  // before any re-render, and a stray throw can never strand navigation.
  const transitioning = useRef(false);

  const run = useCallback(async (action: () => void, config: WipeConfig) => {
    const wipe = wipeRef.current;
    if (!wipe) {
      action(); // overlay not mounted yet: never strand the navigation
      return;
    }
    if (transitioning.current) return;
    transitioning.current = true;
    try {
      await wipe.cover(config); // screen now fully covered
      action(); // the real router nav, invisible behind the cover
      await wipe.reveal(config); // new screen mosaics in
    } finally {
      transitioning.current = false;
    }
  }, []);

  const value = useMemo<ArcadeRouter>(
    () => ({
      push: (href, variant = 'menu') => run(() => router.push(href), buildConfig(variant, href)),
      replace: (href, variant = 'menu') =>
        run(() => router.replace(href), buildConfig(variant, href)),
      back: (variant = 'menu') => run(() => router.back(), buildConfig(variant, null)),
    }),
    [run, router]
  );

  return (
    <TransitionContext.Provider value={value}>
      <View style={styles.fill}>
        {children}
        <PixelWipeOverlay ref={wipeRef} />
      </View>
    </TransitionContext.Provider>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
