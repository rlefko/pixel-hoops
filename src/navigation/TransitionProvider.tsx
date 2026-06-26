import { createContext, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { PixelWipeOverlay, type PixelWipeHandle, type WipeVariant } from '@/components/fx';

/** Arcade-flavored navigation: a drop-in for expo-router's push/replace/back
 *  that plays a pixel-dissolve wipe around each route change. */
export interface ArcadeRouter {
  push: (href: Href, variant?: WipeVariant) => void;
  replace: (href: Href, variant?: WipeVariant) => void;
  back: (variant?: WipeVariant) => void;
}

export const TransitionContext = createContext<ArcadeRouter | null>(null);

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

  const run = useCallback(async (action: () => void, variant: WipeVariant) => {
    const wipe = wipeRef.current;
    if (!wipe) {
      action(); // overlay not mounted yet: never strand the navigation
      return;
    }
    if (transitioning.current) return;
    transitioning.current = true;
    try {
      await wipe.cover(variant); // screen now fully covered
      action(); // the real router nav, invisible behind the cover
      await wipe.reveal(variant); // new screen mosaics in
    } finally {
      transitioning.current = false;
    }
  }, []);

  const value = useMemo<ArcadeRouter>(
    () => ({
      push: (href, variant = 'menu') => run(() => router.push(href), variant),
      replace: (href, variant = 'menu') => run(() => router.replace(href), variant),
      back: (variant = 'menu') => run(() => router.back(), variant),
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
