import { createContext, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { PixelWipeOverlay, type PixelWipeHandle } from '@/components/fx';
import { sfx, type WipeConfig, type WipeVariant } from '@/feel';
import { palette } from '@/theme';
import { formatSlowTransition, type TransitionMarks } from './transition-timing';

/** Arcade-flavored navigation: a drop-in for expo-router's push/replace/back
 *  that plays a pixel-dissolve wipe around each route change. `ceremony` runs the
 *  same wipe around an in-screen action (no route change): the stake-themed
 *  tip-off into a boss or championship game. A ceremony action may return a
 *  promise declaring "the destination is not settled yet"; the cover then holds
 *  (capped) until it resolves, so a multi-commit cascade (the auto-skipped
 *  championship) reveals its real destination, not a mid-cascade placeholder.
 *  The returned promise resolves when the reveal completes, so the destination
 *  can anchor its celebration beats to the moment it is actually visible. */
export interface ArcadeRouter {
  push: (href: Href, variant?: WipeVariant) => void;
  replace: (href: Href, variant?: WipeVariant) => void;
  back: (variant?: WipeVariant) => void;
  ceremony: (config: WipeConfig, action: () => void | Promise<void>) => Promise<void>;
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
  '/coaches': { color: palette.chrome, label: 'COACHES' },
  '/settings': { color: palette.inkDim, label: 'SETTINGS' },
};

function hrefToPath(href: Href): string {
  if (typeof href === 'string') return href.split('?')[0];
  // Object hrefs do not occur today; handle defensively.
  return (href as { pathname?: string }).pathname ?? '/';
}

/**
 * Resolves after the next frame paints. The action's React commit flushes in a
 * scheduled task that runs BEFORE the next frame's rAF, so a heavy destination
 * mount (an elite tip-off's game screen, a dense hub) delays that frame and the
 * first rAF fires only once the commit has landed; the second gives the mount a
 * frame to paint. Waiting here keeps the reveal from racing the commit and
 * dissolving over the outgoing screen while the UI thread stalls mid-animation.
 */
function afterCommit(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/**
 * Cap on a ceremony's settlement hold. afterCommit only ever covers ONE commit, so a
 * ceremony whose action cascades through several (the auto-skipped championship)
 * declares settlement with a promise instead; the cap guarantees a broken waiter can
 * never strand the cover. Hitting it is a bug (dev-warned), not a designed beat.
 */
const SETTLE_CAP_MS = 1500;

/** Await the ceremony's settlement, resolving (never rejecting) at the cap. The timer
 * exists only on this path (plain push/replace/back never allocate one) and is
 * cleared the moment the action wins the race. */
function holdUntilSettled(settled: Promise<void>): Promise<void> {
  return new Promise((resolve) => {
    const cap = setTimeout(() => {
      if (__DEV__) console.warn(`[nav] ceremony settle capped at ${SETTLE_CAP_MS}ms`);
      resolve();
    }, SETTLE_CAP_MS);
    const done = () => {
      clearTimeout(cap);
      resolve();
    };
    settled.then(done, done); // a rejected waiter must also never strand the cover
  });
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

  const run = useCallback(
    async (action: () => void | Promise<void>, config: WipeConfig, label: string) => {
      const wipe = wipeRef.current;
      if (!wipe) {
        void action(); // overlay not mounted yet: never strand the navigation
        return;
      }
      if (transitioning.current) return;
      transitioning.current = true;
      // Dev-only dwell tracer (see transition-timing.ts). Marks exist only on this
      // full path, so the !wipe fallback and rejected double-taps never log garbage.
      const marks: TransitionMarks | null = __DEV__
        ? { coverStart: performance.now(), covered: 0, actionDone: 0, held: 0, painted: 0, revealed: 0 }
        : null;
      sfx.whoosh(config.direction); // sweep matches the wipe direction (forward vs return)
      try {
        await wipe.cover(config); // screen now fully covered
        if (marks) marks.covered = performance.now();
        const settled = action(); // the real router nav, invisible behind the cover
        if (marks) marks.actionDone = performance.now();
        // A ceremony may declare "not settled yet": hold the (capped) cover through
        // its cascade so the reveal lands on the real destination. Plain navigations
        // return undefined and skip straight through.
        if (settled && typeof settled.then === 'function') await holdUntilSettled(settled);
        if (marks) marks.held = performance.now();
        await afterCommit(); // hold the cover until the destination's commit paints
        if (marks) marks.painted = performance.now();
        await wipe.reveal(config); // new screen mosaics in
        if (marks) {
          marks.revealed = performance.now();
          const msg = formatSlowTransition(label, marks);
          if (msg) console.warn(msg);
        }
      } finally {
        transitioning.current = false;
      }
    },
    []
  );

  const value = useMemo<ArcadeRouter>(
    () => ({
      push: (href, variant = 'menu') =>
        run(() => router.push(href), buildConfig(variant, href), hrefToPath(href)),
      replace: (href, variant = 'menu') =>
        run(() => router.replace(href), buildConfig(variant, href), hrefToPath(href)),
      back: (variant = 'menu') => run(() => router.back(), buildConfig(variant, null), 'back'),
      ceremony: (config, action) =>
        run(action, config, `ceremony:${config.label ?? config.variant}`),
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
