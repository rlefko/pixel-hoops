import { forwardRef, memo, useEffect, useImperativeHandle, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { palette } from '@/theme';
import { SIM_SPEED_FACTOR, scaled, useFeelSettings } from '@/feel';
import { SEAT_PITCH, SEAT_SIZE, crowdSeats, type CrowdSeat } from './pixelCrowdLayout';

/**
 * A band of pixel spectators, shared by the run map's stands and the watch's
 * court apron. Two modes, matching the two battery contracts:
 *
 * - `shimmer` (the map): the old CrowdBand's slow opacity wave — one worklet for
 *   the whole band, holding steady (no loop) under reduced motion, Arcade Extras
 *   off, or the host's idle `paused` flag.
 * - reactions (the watch): STATIC at rest (never a loop on the live watch); the
 *   imperative `react()` handle plays one-shots — a 2-frame whole-pixel bob with
 *   column-alternating phase, and on a cheer a few staggered single-pixel camera
 *   flashes on the accent seats. Pure atmosphere, so both no-op under reduced
 *   motion or with Arcade Extras off.
 *
 * Density is fullness (see pixelCrowdLayout): seats fill in deterministically as
 * the bracket climbs, they never reshuffle.
 */

export interface PixelCrowdHandle {
  react: (kind: 'bob' | 'cheer') => void;
}

interface PixelCrowdProps {
  /** Strip length in px along its axis. */
  length: number;
  rows?: number;
  /** 0..1 fullness. */
  density?: number;
  seed?: string | number;
  orientation?: 'horizontal' | 'vertical';
  /** Run the map's ambient shimmer loop (never set on the live watch). */
  shimmer?: boolean;
  /** Host idle gate for the shimmer loop. */
  paused?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** The bob steps through 4 frames; even frames rest, odd frames lift group A and
 * the interior even frame lifts group B, so columns alternate and both end down. */
const BOB_FRAMES = 4;
const BOB_MS = 500;
const FLASH_MS = 450;
/** Per-dot start offsets inside the cheer's 0..1 flash timeline. */
const FLASH_STAGGER = [0, 0.22, 0.45, 0.68];

function seatOffset(seat: CrowdSeat, vertical: boolean) {
  return vertical
    ? { left: seat.cross, top: seat.main }
    : { left: seat.main, top: seat.cross };
}

export const PixelCrowd = memo(
  forwardRef<PixelCrowdHandle, PixelCrowdProps>(function PixelCrowd(
    {
      length,
      rows = 1,
      density = 1,
      seed = 0,
      orientation = 'horizontal',
      shimmer = false,
      paused = false,
      style,
    },
    ref
  ) {
    const { reducedMotion, arcadeExtras, simSpeed } = useFeelSettings();
    const speed = SIM_SPEED_FACTOR[simSpeed];
    const vertical = orientation === 'vertical';

    const seats = useMemo(
      () => crowdSeats(length, rows, density, seed),
      [length, rows, density, seed]
    );
    // Camera-flash anchors: up to four accent seats spread along the strip
    // (accents are sparse, so fall back to evenly spaced seats when short).
    const flashSpots = useMemo(() => {
      const anchors = seats.filter((s) => s.accent);
      const pool = anchors.length >= 2 ? anchors : seats;
      const spots: CrowdSeat[] = [];
      const want = Math.min(FLASH_STAGGER.length, pool.length);
      for (let i = 0; i < want; i++) {
        spots.push(pool[Math.floor((i * (pool.length - 1)) / Math.max(1, want - 1))]);
      }
      return spots;
    }, [seats]);

    // The map's ambient shimmer: the old CrowdBand worklet, moved verbatim.
    // v=0.5 lands on the band's prior static opacity (~0.21).
    const v = useSharedValue(0.5);
    useEffect(() => {
      if (reducedMotion || !arcadeExtras || !shimmer || paused) {
        v.value = 0.5;
        return;
      }
      v.value = withRepeat(
        withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
        -1,
        true
      );
      return () => cancelAnimation(v);
    }, [reducedMotion, arcadeExtras, shimmer, paused, v]);
    const shimmerStyle = useAnimatedStyle(() => ({ opacity: 0.16 + 0.1 * v.value }));

    // Reaction one-shots. Both shared values idle at rest frames, so the
    // worklets below evaluate only while a reaction is actually playing.
    const bob = useSharedValue(0);
    const flash = useSharedValue(0);
    useImperativeHandle(
      ref,
      () => ({
        react: (kind) => {
          if (reducedMotion || !arcadeExtras) return;
          bob.value = 0;
          bob.value = withTiming(BOB_FRAMES, {
            duration: scaled(BOB_MS, speed),
            easing: Easing.linear,
          });
          if (kind === 'cheer') {
            flash.value = 0;
            flash.value = withTiming(1, {
              duration: scaled(FLASH_MS, speed),
              easing: Easing.linear,
            });
          }
        },
      }),
      [reducedMotion, arcadeExtras, speed, bob, flash]
    );
    const groupA = useAnimatedStyle(() => {
      const step = Math.floor(bob.value);
      return { transform: [{ translateY: step % 2 === 1 ? -1 : 0 }] };
    });
    const groupB = useAnimatedStyle(() => {
      const step = Math.floor(bob.value);
      return {
        transform: [{ translateY: step % 2 === 0 && step > 0 && step < BOB_FRAMES ? -1 : 0 }],
      };
    });

    const size = vertical
      ? { width: rows * SEAT_PITCH, height: length }
      : { width: length, height: rows * SEAT_PITCH };

    const renderSeats = (phase: 0 | 1) =>
      seats
        .filter((s) => s.phase === phase)
        .map((s, i) => (
          <View
            key={i}
            style={[styles.seat, seatOffset(s, vertical), { backgroundColor: s.color }]}
          />
        ));

    return (
      <Animated.View pointerEvents="none" style={[size, shimmerStyle, style]}>
        <Animated.View style={[StyleSheet.absoluteFill, groupA]}>{renderSeats(0)}</Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, groupB]}>{renderSeats(1)}</Animated.View>
        {flashSpots.map((s, i) => (
          <FlashDot key={i} progress={flash} start={FLASH_STAGGER[i]} spot={seatOffset(s, vertical)} />
        ))}
      </Animated.View>
    );
  })
);

function FlashDot({
  progress,
  start,
  spot,
}: {
  progress: SharedValue<number>;
  start: number;
  spot: { left: number; top: number };
}) {
  const dotStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [start, start + 0.08, start + 0.22],
      [0, 1, 0],
      Extrapolation.CLAMP
    ),
  }));
  return <Animated.View style={[styles.flashDot, spot, dotStyle]} />;
}

const styles = StyleSheet.create({
  seat: {
    position: 'absolute',
    width: SEAT_SIZE,
    height: SEAT_SIZE,
    borderRadius: 1,
  },
  flashDot: {
    position: 'absolute',
    width: 2,
    height: 2,
    backgroundColor: palette.ink,
  },
});
