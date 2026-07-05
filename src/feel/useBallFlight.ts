import { useCallback } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { useFeelSettings, SIM_SPEED_FACTOR } from './FeelSettingsContext';
import { scaled } from './timings';
import {
  arcPeakFor,
  arcPoint,
  flightDurationFor,
  resolveDurationFor,
  resolvePeakFor,
  type Pt,
  type ShotShape,
} from './ballPath';

/**
 * Animates a single ball view up the floor and into a shot. The ball can be
 * dribbled up (`carry`), fed to the shooter on an assist (`pass`), then arc to the
 * rim and resolve (drop through the net, clank off the iron, or get swatted). Spread
 * `ballStyle` onto an Animated.View and call `fire(...)` when a possession plays.
 * The arc peak and flight time scale with distance so a deep three lofts high and a
 * layup is a quick scoop. The ball hides itself when it lands. No-op under reduced
 * motion (the static held ball on the active sprite stays as the read), but
 * `onArrival` still fires so anything synced to the landing still resolves.
 *
 * With no `carry`/`pass` the fire is exactly the old single shot: the possession
 * theater rides in front of an unchanged shot.
 */

/** Default arc peaks for the pre-shot legs (a low dribble bounce, a flatter pass). */
const CARRY_PEAK = 8;
const PASS_PEAK = 14;

/** A pre-shot ball leg in court pixels. */
export interface BallLegPx {
  from: Pt;
  to: Pt;
  /** Unscaled duration; `fire` scales it by speed x timeScale. */
  ms: number;
  peak?: number;
}

interface FireConfig {
  /** The ball dribbled up the floor before the shot (optional). */
  carry?: BallLegPx;
  /** The assist pass that feeds the shooter (optional). */
  pass?: BallLegPx;
  /** Where the ball leaves the shooter. */
  origin: Pt;
  /** Leg endpoint: the rim center (shot/miss) or the contest point (block/loose). */
  target: Pt;
  /** Resolution endpoint: drop-through, carom-out, or deflection. */
  resolve: Pt;
  shape: ShotShape;
  /**
   * Stretches every leg (slow motion for the game-winner). The scheduler stretches
   * its gap by the same factor (see planDurationMs) so sync holds.
   */
  timeScale?: number;
  /** Fired the instant the ball reaches `target` (the shot lands), on the JS thread. */
  onArrival?: () => void;
}

export function useBallFlight() {
  // Shot + resolution legs (unchanged).
  const ox = useSharedValue(0);
  const oy = useSharedValue(0);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const rx = useSharedValue(0);
  const ry = useSharedValue(0);
  const peak1 = useSharedValue(0);
  const peak2 = useSharedValue(0);
  const p1 = useSharedValue(0); // shot leg progress 0..1
  const p2 = useSharedValue(0); // resolution leg progress 0..1
  const opacity = useSharedValue(0);
  // Pre-shot carry + pass legs.
  const cox = useSharedValue(0);
  const coy = useSharedValue(0);
  const ctx = useSharedValue(0);
  const cty = useSharedValue(0);
  const cpeak = useSharedValue(0);
  const cp = useSharedValue(0); // carry progress 0..1
  const pox = useSharedValue(0);
  const poy = useSharedValue(0);
  const ptx = useSharedValue(0);
  const pty = useSharedValue(0);
  const ppeak = useSharedValue(0);
  const pp = useSharedValue(0); // pass progress 0..1
  // The ball's rest position at t=0 (the first leg's start), so the pre-start
  // frame parks the ball where the first leg begins, not at the shot origin.
  const sx0 = useSharedValue(0);
  const sy0 = useSharedValue(0);
  const { reducedMotion, simSpeed } = useFeelSettings();

  const ballStyle = useAnimatedStyle(() => {
    const o = opacity.value;
    // Latest leg with progress wins (legs start in order, so this picks the current
    // leg): resolve -> shot -> pass -> carry, else the pre-start origin.
    if (p2.value > 0) {
      const pt = arcPoint(tx.value, rx.value, ty.value, ry.value, peak2.value, p2.value);
      return { opacity: o * (1 - p2.value), transform: [{ translateX: pt.x }, { translateY: pt.y }] };
    }
    if (p1.value > 0) {
      const pt = arcPoint(ox.value, tx.value, oy.value, ty.value, peak1.value, p1.value);
      return { opacity: o, transform: [{ translateX: pt.x }, { translateY: pt.y }] };
    }
    if (pp.value > 0) {
      const pt = arcPoint(pox.value, ptx.value, poy.value, pty.value, ppeak.value, pp.value);
      return { opacity: o, transform: [{ translateX: pt.x }, { translateY: pt.y }] };
    }
    if (cp.value > 0) {
      const pt = arcPoint(cox.value, ctx.value, coy.value, cty.value, cpeak.value, cp.value);
      return { opacity: o, transform: [{ translateX: pt.x }, { translateY: pt.y }] };
    }
    // Pre-start frame (all leg progresses still 0): park at the first leg's start.
    return { opacity: o, transform: [{ translateX: sx0.value }, { translateY: sy0.value }] };
  });

  // A short motion trail on the shot leg only: ghost dots that lag the ball and
  // fade with depth (a dribble/pass leaves no comet).
  const ghost = (lag: number, fade: number) => {
    'worklet';
    const t = Math.max(0, p1.value - lag);
    const pt = arcPoint(ox.value, tx.value, oy.value, ty.value, peak1.value, t);
    const visible = p2.value > 0 || p1.value <= lag ? 0 : 1;
    return { opacity: opacity.value * fade * visible, transform: [{ translateX: pt.x }, { translateY: pt.y }] };
  };
  const trail1 = useAnimatedStyle(() => ghost(0.05, 0.34));
  const trail2 = useAnimatedStyle(() => ghost(0.1, 0.22));
  const trail3 = useAnimatedStyle(() => ghost(0.15, 0.12));
  const trailStyles = [trail1, trail2, trail3];

  const fire = useCallback(
    (cfg: FireConfig) => {
      const cb = cfg.onArrival;
      if (reducedMotion) {
        cb?.();
        return;
      }
      const { carry, pass, origin, target, resolve, shape, timeScale = 1 } = cfg;
      const speed = SIM_SPEED_FACTOR[simSpeed];
      const dist = Math.hypot(target.x - origin.x, target.y - origin.y);
      const peak = arcPeakFor(dist, shape);
      const dur = scaled(flightDurationFor(dist, shape) * timeScale, speed);
      const resolveDur = scaled(resolveDurationFor(shape) * timeScale, speed);
      const carryDur = carry ? scaled(carry.ms * timeScale, speed) : 0;
      const passDur = pass ? scaled(pass.ms * timeScale, speed) : 0;
      const shotEase = shape === 'dunk' ? Easing.in(Easing.cubic) : Easing.out(Easing.quad);
      const resolveEase = shape === 'dunk' ? Easing.in(Easing.cubic) : Easing.in(Easing.quad);

      ox.value = origin.x;
      oy.value = origin.y;
      tx.value = target.x;
      ty.value = target.y;
      rx.value = resolve.x;
      ry.value = resolve.y;
      peak1.value = peak;
      peak2.value = resolvePeakFor(shape);
      if (carry) {
        cox.value = carry.from.x;
        coy.value = carry.from.y;
        ctx.value = carry.to.x;
        cty.value = carry.to.y;
        cpeak.value = carry.peak ?? CARRY_PEAK;
      }
      if (pass) {
        pox.value = pass.from.x;
        poy.value = pass.from.y;
        ptx.value = pass.to.x;
        pty.value = pass.to.y;
        ppeak.value = pass.peak ?? PASS_PEAK;
      }
      // Park the pre-start frame at the first leg's start: carry, else pass, else
      // the shot origin (so the ball never flashes at the rim end for one frame).
      const start = carry?.from ?? pass?.from ?? origin;
      sx0.value = start.x;
      sy0.value = start.y;
      opacity.value = 1;
      cp.value = 0;
      pp.value = 0;
      p1.value = 0;
      p2.value = 0;

      // Legs fire in order: carry -> pass -> shot(onArrival) -> resolve, each after
      // the previous via withDelay, so they never fight and stay in sync with the
      // sprite movement (which scales by the same speed x timeScale).
      if (carry) cp.value = withTiming(1, { duration: carryDur, easing: Easing.linear });
      if (pass) {
        pp.value = withDelay(
          carryDur,
          withTiming(1, { duration: passDur, easing: Easing.out(Easing.quad) })
        );
      }
      p1.value = withDelay(
        carryDur + passDur,
        withTiming(1, { duration: dur, easing: shotEase }, (finished) => {
          'worklet';
          if (finished && cb) runOnJS(cb)();
        })
      );
      p2.value = withDelay(
        carryDur + passDur + dur,
        withTiming(1, { duration: resolveDur, easing: resolveEase }, (done) => {
          'worklet';
          if (done) opacity.value = 0;
        })
      );
    },
    [
      reducedMotion,
      simSpeed,
      ox, oy, tx, ty, rx, ry, peak1, peak2, p1, p2, opacity,
      cox, coy, ctx, cty, cpeak, cp, pox, poy, ptx, pty, ppeak, pp, sx0, sy0,
    ]
  );

  return { ballStyle, trailStyles, fire };
}
