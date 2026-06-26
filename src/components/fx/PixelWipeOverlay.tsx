import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import { palette, snapPx, space } from '@/theme';
import { createRNG } from '@/game/rng';
import { usePixelWipe, useFeelSettings, type WipeVariant } from '@/feel';
import { Scanlines } from './Scanlines';
import { Callout } from './Callout';
import { FlashOverlay, type FlashOverlayHandle } from './FlashOverlay';

export type { WipeVariant };

/** Imperative handle: cover then reveal, each resolving when the step lands. */
export interface PixelWipeHandle {
  cover: (variant?: WipeVariant) => Promise<void>;
  reveal: (variant?: WipeVariant) => Promise<void>;
}

// Chunky target cell. Past the cap the grid grows the cell (never the count) so
// big screens and web stay bounded, mirroring MAX_PARTICLES / MAX_LINES.
const TARGET_CELL = space(10); // 40px
const MAX_CELLS = 240;
// A short ramp keeps each cell a hard-ish on/off (8-bit step) without tearing.
const EDGE = 0.08;

function fitGrid(width: number, height: number) {
  let cell = TARGET_CELL;
  if (Math.ceil(width / cell) * Math.ceil(height / cell) > MAX_CELLS) {
    // Snap the grown cell up to the 4px grid so edges stay crisp.
    cell = Math.ceil(Math.sqrt((width * height) / MAX_CELLS) / 4) * 4;
  }
  return { cell, cols: Math.ceil(width / cell), rows: Math.ceil(height / cell) };
}

function clamp(value: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, value));
}

/** One mosaic block: opacity steps from clear to covered as `progress` passes
 *  this cell's threshold, so the grid fills in as a staggered wavefront. */
function Cell({
  progress,
  threshold,
  left,
  top,
  size,
  color,
}: {
  progress: SharedValue<number>;
  threshold: number;
  left: number;
  top: number;
  size: number;
  color: string;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [threshold, threshold + EDGE],
      [0, 1],
      Extrapolation.CLAMP
    ),
  }));
  return (
    <Animated.View
      style={[styles.cell, { left, top, width: size, height: size, backgroundColor: color }, style]}
    />
  );
}

/**
 * The arcade pixel-dissolve overlay. A full-bleed grid of chunky blocks covers
 * the screen then clears block-by-block, hiding the instant native route cut
 * underneath. The `run` variant reads as a power-up (darker blocks, a gold
 * flash, a "GET READY" punch-in, a haptic). Under reduced motion it collapses to
 * a single flat fade. Driven through its ref handle by the TransitionProvider.
 */
export const PixelWipeOverlay = forwardRef<PixelWipeHandle>((_props, ref) => {
  const { progress, active, variant, cover, reveal } = usePixelWipe();
  const { reducedMotion } = useFeelSettings();
  const flashRef = useRef<FlashOverlayHandle>(null);
  const { width, height } = useWindowDimensions();

  useImperativeHandle(ref, () => ({ cover, reveal }), [cover, reveal]);

  // Power-up flash when the run cover comes in (FlashOverlay self-skips reduced motion).
  useEffect(() => {
    if (active && variant === 'run') flashRef.current?.flash(palette.gold, { peak: 0.4 });
  }, [active, variant]);

  const grid = useMemo(() => fitGrid(width, height), [width, height]);
  const thresholds = useMemo(() => {
    const { cols, rows } = grid;
    // Seeded so the dissolve is deterministic and tunable: menu is a diagonal
    // sweep with light jitter, run is a fully seeded "static" fill. The ceiling
    // is clamped to 1 - EDGE so every cell still reaches full opacity by
    // progress === 1, leaving no block partly clear at full cover.
    const rng = createRNG(`wipe:${variant}:${cols}x${rows}`);
    return Array.from({ length: cols * rows }, (_, i) => {
      if (variant === 'menu') {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const diag = (col + row) / (cols + rows);
        return clamp(diag + (rng.next() - 0.5) * 0.18, 0, 1 - EDGE);
      }
      return clamp(rng.next(), 0, 1 - EDGE);
    });
  }, [grid, variant]);

  // The reduced-motion fade and the run "GET READY" both ride `progress` directly.
  const progressStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  if (reducedMotion) {
    return (
      <Animated.View pointerEvents={active ? 'auto' : 'none'} style={StyleSheet.absoluteFill}>
        {active ? <Animated.View style={[StyleSheet.absoluteFill, styles.fade, progressStyle]} /> : null}
      </Animated.View>
    );
  }

  const { cols, cell } = grid;
  const size = snapPx(cell) + 1; // +1 overlap kills sub-pixel seams between blocks
  const cellColor = variant === 'run' ? palette.bgPanel : palette.bgDeep;

  return (
    <Animated.View pointerEvents={active ? 'auto' : 'none'} style={StyleSheet.absoluteFill}>
      {active ? (
        <>
          {thresholds.map((t, i) => (
            <Cell
              key={i}
              progress={progress}
              threshold={t}
              left={snapPx((i % cols) * cell)}
              top={snapPx(Math.floor(i / cols) * cell)}
              size={size}
              color={cellColor}
            />
          ))}
          <Scanlines enabled spacing={3} />
          <FlashOverlay ref={flashRef} />
          {variant === 'run' ? (
            <Animated.View pointerEvents="none" style={[styles.center, progressStyle]}>
              <Callout text="GET READY" color={palette.gold} />
            </Animated.View>
          ) : null}
        </>
      ) : null}
    </Animated.View>
  );
});

PixelWipeOverlay.displayName = 'PixelWipeOverlay';

const styles = StyleSheet.create({
  cell: { position: 'absolute' },
  fade: { backgroundColor: palette.bgDeep },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
