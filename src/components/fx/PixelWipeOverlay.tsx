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

/**
 * Cover opacity for the scanlines, label, and reduced-motion fade: peaks at full
 * cover (progress 1) and is zero at both ends of the 0 -> 2 sweep.
 */
function coverFraction(progress: number) {
  'worklet';
  return Math.max(0, 1 - Math.abs(progress - 1));
}

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
 * transition never re-renders it. One continuous sweep covers then uncovers in a
 * single direction: the leading edge covers this cell as `progress` passes its
 * sweep coordinate (0 -> 1), the trailing edge uncovers it a full sweep later
 * (1 -> 2). On menu wipes the cell lights up in the accent as either edge passes;
 * the `glow <= 0` early-out keeps the color cost to the thin moving band.
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
    // Sweep coordinate x in [0, 1-EDGE]: run is a seeded "static" position, menu
    // is the column position (mirrored on backward navigation). Clamp inline
    // (worklet-safe) so the trailing edge still clears every cell by progress 2.
    let x = isRun ? randThresh : (dir.value === 1 ? colNorm : 1 - colNorm) + jitter;
    x = Math.max(0, Math.min(1 - EDGE, x));
    const p = progress.value;
    const coverIn = interpolate(p, [x, x + EDGE], [0, 1], Extrapolation.CLAMP);
    const coverOut = interpolate(p, [x + 1, x + 1 + EDGE], [1, 0], Extrapolation.CLAMP);
    const opacity = coverIn * coverOut;
    if (isRun) return { opacity, backgroundColor: base.value };
    // Accent glow on whichever edge (covering or uncovering) is passing this cell.
    const glow = Math.max(
      Math.max(0, 1 - Math.abs(p - x) / BAND),
      Math.max(0, 1 - Math.abs(p - (x + 1)) / BAND)
    );
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
  const opacity = useAnimatedStyle(() => ({ opacity: coverFraction(progress.value) }));
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

  // Cover opacity for the label and the reduced-motion fade.
  const coverStyle = useAnimatedStyle(() => ({ opacity: coverFraction(progress.value) }));

  if (reducedMotion) {
    // Flat fade, lightly tinted toward the accent so identity survives; no grid.
    return (
      <Animated.View pointerEvents={active ? 'auto' : 'none'} style={StyleSheet.absoluteFill}>
        {active ? (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: mix(palette.bgDeep, meta.color, 0.15) },
              coverStyle,
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
        <Animated.View pointerEvents="none" style={[styles.center, coverStyle]}>
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
