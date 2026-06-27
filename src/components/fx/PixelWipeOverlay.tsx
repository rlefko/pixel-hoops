import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
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

function clamp(value: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, value));
}

/**
 * One mosaic block. Opacity steps from clear to covered as `progress` passes this
 * cell's threshold. On menu wipes (`band`) the cell also lights up in the accent
 * as the wavefront passes, then settles dark, so the destination color sweeps
 * across; the `glow <= 0` early-out keeps the color cost to the thin moving band.
 */
function Cell({
  progress,
  threshold,
  left,
  top,
  size,
  baseColor,
  accent,
  band,
}: {
  progress: SharedValue<number>;
  threshold: number;
  left: number;
  top: number;
  size: number;
  baseColor: string;
  accent: string;
  band: boolean;
}) {
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const opacity = interpolate(p, [threshold, threshold + EDGE], [0, 1], Extrapolation.CLAMP);
    if (!band) return { opacity, backgroundColor: baseColor };
    const glow = Math.max(0, 1 - Math.abs(p - threshold) / BAND);
    return {
      opacity,
      backgroundColor: glow <= 0 ? baseColor : interpolateColor(glow, [0, 1], [baseColor, accent]),
    };
  });
  return <Animated.View style={[styles.cell, { left, top, width: size, height: size }, style]} />;
}

/**
 * The arcade pixel-dissolve overlay. A full-bleed grid of chunky blocks covers
 * the screen then clears block-by-block, hiding the instant native route cut
 * underneath. Menu wipes carry per-destination identity (a directional sweep of
 * the destination's accent color, an accent flash, and a label punch-in); the
 * `run` variant is the bigger power-up boot. Under reduced motion it collapses to
 * a single flat fade. Driven through its ref handle by the TransitionProvider.
 */
export const PixelWipeOverlay = forwardRef<PixelWipeHandle>((_props, ref) => {
  const { progress, active, config, cover, reveal } = usePixelWipe();
  const { reducedMotion } = useFeelSettings();
  const flashRef = useRef<FlashOverlayHandle>(null);
  const { width, height } = useWindowDimensions();

  const { variant, color, label, direction } = config;

  useImperativeHandle(ref, () => ({ cover, reveal }), [cover, reveal]);

  // Accent flash as the cover comes in, for both variants (FlashOverlay self-skips
  // reduced motion).
  useEffect(() => {
    if (active) flashRef.current?.flash(color, { peak: variant === 'run' ? 0.4 : 0.3 });
  }, [active, variant, color]);

  const grid = useMemo(() => fitGrid(width, height), [width, height]);
  const thresholds = useMemo(() => {
    const { cols, rows } = grid;
    // Seeded so the pattern is deterministic and tunable: menu is a directional
    // horizontal column sweep (forward and backward mirror each other), run is a
    // seeded "static" fill. The ceiling is clamped to 1 - EDGE so every cell
    // reaches full opacity by progress === 1, leaving no block partly clear.
    const rng = createRNG(`wipe:${variant}:${direction}:${cols}x${rows}`);
    return Array.from({ length: cols * rows }, (_, i) => {
      if (variant === 'menu') {
        const col = i % cols;
        const sweep = direction === 'forward' ? col / cols : 1 - col / cols;
        return clamp(sweep + (rng.next() - 0.5) * 0.06, 0, 1 - EDGE);
      }
      return clamp(rng.next(), 0, 1 - EDGE);
    });
  }, [grid, variant, direction]);

  // The reduced-motion fade and the label punch-in both ride `progress` directly.
  const progressStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  if (reducedMotion) {
    // Flat fade, lightly tinted toward the accent so identity survives; no grid.
    return (
      <Animated.View pointerEvents={active ? 'auto' : 'none'} style={StyleSheet.absoluteFill}>
        {active ? (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: mix(palette.bgDeep, color, 0.15) },
              progressStyle,
            ]}
          />
        ) : null}
      </Animated.View>
    );
  }

  const { cols, cell } = grid;
  const size = snapPx(cell) + 1; // +1 overlap kills sub-pixel seams between blocks
  const isRun = variant === 'run';
  const baseColor = isRun ? palette.bgPanel : palette.bgDeep;

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
              baseColor={baseColor}
              accent={color}
              band={!isRun}
            />
          ))}
          <Scanlines enabled spacing={3} />
          <FlashOverlay ref={flashRef} />
          {label ? (
            <Animated.View pointerEvents="none" style={[styles.center, progressStyle]}>
              <Callout text={label} color={color} textStyle={isRun ? undefined : styles.menuLabel} />
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
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(6),
  },
  menuLabel: { fontSize: FONT_SIZE.label },
});
