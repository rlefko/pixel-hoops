import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  interpolate,
  interpolateColor,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import { palette, snapPx, space, FONT_SIZE } from '@/theme';
import { mix } from '@/theme/color';
import { createRNG } from '@/game/rng';
import { usePixelWipe, useFeelSettings, type WipeConfig } from '@/feel';
import { Scanlines } from './Scanlines';
import { Callout } from './Callout';
import { FlashOverlay, type FlashOverlayHandle } from './FlashOverlay';

/** Imperative handle: cover then reveal, each resolving when the step lands. */
export interface PixelWipeHandle {
  cover: (config?: WipeConfig) => Promise<void>;
  reveal: (config?: WipeConfig) => Promise<void>;
}

// Chunky target cell. Past the cap the grid grows the cell (never the count) so
// big screens and web stay bounded, mirroring MAX_PARTICLES / MAX_LINES.
const TARGET_CELL = space(10); // 40px
const MAX_CELLS = 240;
// A short ramp keeps each cell a hard-ish on/off (8-bit step) without tearing.
const EDGE = 0.08;
// Width of the traveling accent glow band on menu wipes (in progress units).
const BAND = 0.2;

function fitGrid(width: number, height: number) {
  let cell = TARGET_CELL;
  if (Math.ceil(width / cell) * Math.ceil(height / cell) > MAX_CELLS) {
    // Snap the grown cell up to the 4px grid so edges stay crisp.
    cell = Math.ceil(Math.sqrt((width * height) / MAX_CELLS) / 4) * 4;
  }
  return { cell, cols: Math.ceil(width / cell), rows: Math.ceil(height / cell) };
}

/**
 * One mosaic block, mounted once and driven entirely by shared values so a
 * transition never re-renders it. The worklet derives this cell's threshold from
 * `dir`/`runFlag`, steps opacity as `progress` passes it, and (on menu wipes)
 * lights the cell in the accent as the wavefront passes, then settles to the base
 * color. The `glow <= 0` early-out keeps the color cost to the thin moving band.
 */
function Cell({
  progress,
  accent,
  base,
  runFlag,
  dir,
  colNorm,
  jitter,
  randThresh,
  left,
  top,
  size,
}: {
  progress: SharedValue<number>;
  accent: SharedValue<string>;
  base: SharedValue<string>;
  runFlag: SharedValue<number>;
  dir: SharedValue<number>;
  colNorm: number;
  jitter: number;
  randThresh: number;
  left: number;
  top: number;
  size: number;
}) {
  const style = useAnimatedStyle(() => {
    const isRun = runFlag.value === 1;
    // Run is a seeded "static" fill; menu is a directional column sweep that
    // mirrors on backward navigation. Clamp inline (worklet-safe) so every cell
    // still reaches full opacity by progress === 1.
    let t = isRun ? randThresh : (dir.value === 1 ? colNorm : 1 - colNorm) + jitter;
    t = Math.max(0, Math.min(1 - EDGE, t));
    const p = progress.value;
    const opacity = interpolate(p, [t, t + EDGE], [0, 1], Extrapolation.CLAMP);
    if (isRun) return { opacity, backgroundColor: base.value };
    const glow = Math.max(0, 1 - Math.abs(p - t) / BAND);
    return {
      opacity,
      backgroundColor:
        glow <= 0 ? base.value : interpolateColor(glow, [0, 1], [base.value, accent.value]),
    };
  });
  return <Animated.View style={[styles.cell, { left, top, width: size, height: size }, style]} />;
}

/**
 * Persistent CRT scanlines for the cover, faded in with `progress` so they cost
 * nothing at rest. Memoized on the stable `progress` ref so the overlay's
 * per-transition re-renders never reconcile the line views underneath.
 */
const WipeScanlines = memo(function WipeScanlines({
  progress,
}: {
  progress: SharedValue<number>;
}) {
  const opacity = useAnimatedStyle(() => ({ opacity: progress.value }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, opacity]}>
      <Scanlines enabled spacing={3} />
    </Animated.View>
  );
});

/**
 * The arcade pixel-dissolve overlay. A full-bleed grid of chunky blocks covers
 * the screen then clears block-by-block, hiding the instant native route cut
 * underneath. The grid stays mounted permanently and is driven by shared values,
 * so a transition mounts nothing and the wipe starts immediately. Menu wipes
 * carry per-destination identity (a directional accent sweep, a flash, a label);
 * the `run` variant is the bigger power-up boot. Under reduced motion it collapses
 * to a single flat fade. Driven through its ref handle by the TransitionProvider.
 */
export const PixelWipeOverlay = forwardRef<PixelWipeHandle>((_props, ref) => {
  const { progress, accent, base, runFlag, dir, active, meta, cover, reveal } = usePixelWipe();
  const { reducedMotion } = useFeelSettings();
  const flashRef = useRef<FlashOverlayHandle>(null);
  const { width, height } = useWindowDimensions();

  useImperativeHandle(ref, () => ({ cover, reveal }), [cover, reveal]);

  // Accent flash as the cover comes in, for both variants (FlashOverlay self-skips
  // reduced motion). `meta` is a fresh object each cover, so this fires once per
  // wipe when `active` flips true.
  useEffect(() => {
    if (active) flashRef.current?.flash(meta.color, { peak: meta.isRun ? 0.4 : 0.3 });
  }, [active, meta]);

  const grid = useMemo(() => fitGrid(width, height), [width, height]);

  // Persistent, memoized cell grid: mounted once per screen size and never
  // reconciled on a transition (the parent's active/meta re-renders reuse this
  // same element array). Per-cell randomness is seeded by size alone so it is
  // stable across transitions; direction and variant are applied at runtime in
  // the worklet from shared values.
  const cellEls = useMemo(() => {
    const { cols, rows, cell } = grid;
    const rng = createRNG(`wipe:${cols}x${rows}`);
    const size = snapPx(cell) + 1; // +1 overlap kills sub-pixel seams between blocks
    return Array.from({ length: cols * rows }, (_, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const jitter = (rng.next() - 0.5) * 0.06;
      const randThresh = rng.next();
      return (
        <Cell
          key={i}
          progress={progress}
          accent={accent}
          base={base}
          runFlag={runFlag}
          dir={dir}
          colNorm={col / cols}
          jitter={jitter}
          randThresh={randThresh}
          left={snapPx(col * cell)}
          top={snapPx(row * cell)}
          size={size}
        />
      );
    });
  }, [grid, progress, accent, base, runFlag, dir]);

  // The reduced-motion fade and the label both ride `progress`.
  const progressStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  if (reducedMotion) {
    // Flat fade, lightly tinted toward the accent so identity survives; no grid.
    return (
      <Animated.View pointerEvents={active ? 'auto' : 'none'} style={StyleSheet.absoluteFill}>
        {active ? (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: mix(palette.bgDeep, meta.color, 0.15) },
              progressStyle,
            ]}
          />
        ) : null}
      </Animated.View>
    );
  }

  return (
    <Animated.View pointerEvents={active ? 'auto' : 'none'} style={StyleSheet.absoluteFill}>
      {cellEls}
      <WipeScanlines progress={progress} />
      <FlashOverlay ref={flashRef} />
      {meta.label ? (
        <Animated.View pointerEvents="none" style={[styles.center, progressStyle]}>
          <Callout
            text={meta.label}
            color={meta.color}
            textStyle={meta.isRun ? undefined : styles.menuLabel}
          />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
});

PixelWipeOverlay.displayName = 'PixelWipeOverlay';

const styles = StyleSheet.create({
  cell: { position: 'absolute' },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(6),
  },
  menuLabel: { fontSize: FONT_SIZE.label },
});
