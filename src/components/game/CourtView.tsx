import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withDelay,
  withRepeat,
  cancelAnimation,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { Text } from '@/components/StyledText';
import {
  SvgCourt,
  PixelPlayer,
  Pop,
  BallFlight,
  RimRipple,
  ParticleBurst,
  type BurstVariant,
} from '@/components/fx';
import { ApronCrowd, type ApronCrowdHandle } from '@/components/game/ApronCrowd';
import { jerseyNumber, skinIndexFor } from '@/components/game/jersey';
import { spotPercent, spotPx, rimCenterPx } from '@/components/game/courtGeometry';
import { COURT } from '@/components/game/courtDimensions';
import { idleBobFor, DUNK } from '@/components/game/possession';
import {
  spriteKey,
  fracToPx,
  type PossessionPlan,
  type Waypoint,
} from '@/components/game/choreography';
import { useFeelSettings, useBobPulse, useGlowPulse, scaled, SIM_SPEED_FACTOR } from '@/feel';
import type { ArenaTier } from '@/game/arena-tier';
import type { CrowdPulsePlan } from '@/game/crowd-pulse';
import { palette, FONT, FONT_SIZE } from '@/theme';
import { courtThemeFor } from '@/theme/courtTheme';
import { useCourtTheme } from '@/hooks/useCourtTheme';
import { POSITIONS, type Position, type RosterPlayer } from '@/types/roster';
import { isMadeShot, type SimEvent, type SimTeamSide } from '@/types/sim';
import type { Team } from '@/types/team';

/**
 * The visual heart of the sim: ten procedural pixel players on the court, five
 * per side in a real formation. They breathe on the floor; the shooter drives or
 * rises and a defender contests; the ball arcs into a real hoop and the make or
 * miss flourish lands when it arrives. Sits behind the play-by-play ticker (see
 * PlayByPlayFeed).
 */

interface CourtViewProps {
  homeTeam: Team;
  awayTeam: Team;
  /** The play currently being shown, or null before tip-off. */
  current: SimEvent | null;
  /** The possession plan driving the floor movement and the ball path. */
  plan?: PossessionPlan | null;
  /** `${side}-${position}` keys of players who are currently on fire. */
  hotKeys?: string[];
  /** `${side}-${position}` keys of players heating up (the warm tease tier). */
  warmKeys?: string[];
  /** The landed scorer just hit three straight: fire the ignite burst. */
  ignite?: boolean;
  /** The current play is the game-deciding shot: slow-mo flight + court zoom. */
  cinema?: boolean;
  /** The arena's stakes tier; elite and up seat a crowd in the apron. */
  arenaTier?: ArenaTier;
  /** The precomputed crowd plan (one stable Map per timeline): picks whether a
   * home arrival stirs the apron crowd's cheer (big/peak beats) or just a bob.
   * Routine games pay nothing for it — no ApronCrowd mounts, so the ref stays
   * null and the lookup is dead. */
  crowdPlan?: Map<number, CrowdPulsePlan>;
  /** Fired when the ball reaches the rim (synced make/miss feedback). */
  onArrival?: (e: SimEvent) => void;
}

/**
 * The player in a court slot. The slot is the lineup array index, NOT the
 * player's intrinsic position. Slot `i` (POSITIONS[i]) maps to the static
 * starter `players[i]`, but with in-game rotation the player on the floor there
 * changes, so when an event is in play we resolve the slot to whoever the sim
 * says is on the floor (by name, across starters and bench). This keeps the
 * highlighted scorer's sprite correct after a substitution; falls back to the
 * starter before tip-off or if the name is unknown.
 */
function playerAt(
  team: Team,
  position: Position,
  side: SimTeamSide,
  current: SimEvent | null,
  roster: Map<string, RosterPlayer>
): RosterPlayer | undefined {
  const starter = team.lineup.players[POSITIONS.indexOf(position)];
  const onCourtName = current?.onCourt[side]?.[position];
  if (!onCourtName) return starter;
  // Resolve through a prebuilt name -> player map (memoized once per team) rather
  // than rebuilding a combined starters+bench array on every sprite, every event.
  // Falls back to the starter before tip-off or on an unknown name.
  return roster.get(onCourtName) ?? starter;
}

/**
 * A name -> player lookup across a team's starters and bench, built once per team
 * and reused for every sprite/event. Starters win over the bench on the (not
 * expected) name clash, matching the prior first-match `.find` over the combined
 * `[...starters, ...bench]` list.
 */
function rosterByName(team: Team): Map<string, RosterPlayer> {
  const map = new Map<string, RosterPlayer>();
  // Bench first, then starters, so a starter overwrites the (not expected) name
  // clash and wins, matching the prior first-match `.find` over starters+bench.
  for (const rp of team.bench) map.set(rp.player.name, rp);
  for (const rp of team.lineup.players) map.set(rp.player.name, rp);
  return map;
}

interface Burst {
  origin: { x: number; y: number };
  variant: BurstVariant;
  count?: number;
  color?: string;
}

/**
 * The particle burst (if any) for a landed event, positioned in court px. Routine
 * makes stay quiet (a small team-tinted spark); confetti and debris are reserved
 * for threes, dunks, and-ones, and the game-winner.
 */
function burstFor(
  e: SimEvent | null,
  plan: PossessionPlan | null | undefined,
  homeTeam: Team,
  awayTeam: Team,
  width: number,
  height: number
): Burst | null {
  if (!e || width === 0 || height === 0) return null;
  const side = e.team;
  const rim = rimCenterPx(side, width, height);
  if (e.result === 'block' || e.result === 'steal') {
    return {
      // The contested shot happens at the shooter's spot; with a plan that's the
      // advanced spot they ran to, else the sprite's static base.
      origin: plan
        ? fracToPx(plan.igniteFrac, width, height)
        : spotPx(side, e.scorerPosition, width, height, null),
      variant: 'cool',
      count: e.result === 'block' ? 6 : 5,
    };
  }
  if (!isMadeShot(e)) return null; // misses and turnovers: no burst
  if (e.callout === 'BUZZER BEATER!') {
    return { origin: rim, variant: 'confetti', count: 16 };
  }
  if (e.action === 'three' || e.result === 'and-one') {
    return { origin: rim, variant: 'confetti', count: 14 };
  }
  if (e.action === 'dunk') return { origin: rim, variant: 'debris', count: 14 };
  return {
    origin: rim,
    variant: 'spark',
    count: 5,
    color: side === 'home' ? homeTeam.colorHex : awayTeam.colorHex,
  };
}

/** Cumulative time fractions of the dunk beats, for interpolating the sequence. */
const DUNK_TOTAL = DUNK.gather + DUNK.leap + DUNK.slam + DUNK.hang + DUNK.recover;
const DUNK_KF = [
  0,
  DUNK.gather / DUNK_TOTAL,
  (DUNK.gather + DUNK.leap) / DUNK_TOTAL,
  (DUNK.gather + DUNK.leap + DUNK.slam) / DUNK_TOTAL,
  (DUNK.gather + DUNK.leap + DUNK.slam + DUNK.hang) / DUNK_TOTAL,
  1,
];

/** A sprite's hot-hand tier: on fire pulses, warm is the steady half-lit tease. */
type HeatTier = 'none' | 'warm' | 'fire';

/** Run-cycle hop (finite, possession-scoped: never an idle loop on the floor). */
const STRIDE_MS = 200;
const STRIDE_HOP = 2;

/** Per-sprite pixel keyframes for this possession, resolved from the plan waypoints. */
interface MovePath {
  times: number[]; // normalized 0..1
  xs: number[];
  ys: number[];
  baseX: number;
  baseY: number;
}

const SpriteAt = memo(function SpriteAt({
  side,
  position,
  team,
  roster,
  current,
  width,
  height,
  heat,
  waypoints,
  isDunker,
  preShotMs,
  totalMs,
  timeScale,
}: {
  side: SimTeamSide;
  position: Position;
  team: Team;
  roster: Map<string, RosterPlayer>;
  current: SimEvent | null;
  width: number;
  height: number;
  heat: HeatTier;
  /** This sprite's fractional path this possession, or undefined if it holds. */
  waypoints?: Waypoint[];
  /** True when this sprite throws down the dunk (drives the slam squash). */
  isDunker: boolean;
  preShotMs: number;
  totalMs: number;
  timeScale: number;
}) {
  const { reducedMotion, simSpeed } = useFeelSettings();
  const speed = SIM_SPEED_FACTOR[simSpeed];
  const rp = playerAt(team, position, side, current, roster);

  const active =
    current != null && current.team === side && current.scorerPosition === position;
  const seq = current?.seq ?? -1;

  // Stable base: static percent placement avoids a pre-layout jump. The plan's
  // travel rides on top of this as a transform, so the SVG never re-renders.
  const { left, top } = spotPercent(side, position, null);

  // Idle breathe, detuned per sprite so the floor undulates instead of marching.
  const bob = useMemo(() => idleBobFor(side, position), [side, position]);
  const bobStyle = useBobPulse(bob.durationMs, {
    delayMs: bob.delayMs,
    bobAmplitude: bob.bobAmplitude,
  });

  // Possession travel: run the plan's waypoints. Resolve the fractions to px once
  // per possession; only the shared progress value animates on the UI thread.
  const path = useMemo<MovePath | null>(() => {
    if (!waypoints || waypoints.length < 2 || width === 0 || height === 0) return null;
    const total = waypoints[waypoints.length - 1].atMs || 1;
    const pts = waypoints.map((w) => fracToPx(w.frac, width, height));
    return {
      times: waypoints.map((w) => w.atMs / total),
      xs: pts.map((p) => p.x),
      ys: pts.map((p) => p.y),
      baseX: pts[0].x,
      baseY: pts[0].y,
    };
  }, [waypoints, width, height]);
  const moves = path != null;

  const t = useSharedValue(0);
  // Keyed on the possession (seq), not on speed/totalMs: like the ball's lastSeq
  // guard, a mid-possession speed or mode toggle does not restart the run in
  // flight (it would jump sprites back to base while the ball kept flying); the
  // new pacing takes effect on the next possession.
  useEffect(() => {
    if (reducedMotion || !moves) {
      t.value = 0;
      return;
    }
    t.value = 0;
    t.value = withTiming(1, {
      duration: scaled(totalMs * timeScale, speed),
      easing: Easing.linear,
    });
    return () => cancelAnimation(t);
  }, [seq, reducedMotion, moves, t]);
  const posStyle = useAnimatedStyle(() => {
    if (!path) return {};
    const x = interpolate(t.value, path.times, path.xs) - path.baseX;
    const y = interpolate(t.value, path.times, path.ys) - path.baseY;
    return { transform: [{ translateX: Math.round(x) }, { translateY: Math.round(y) }] };
  });

  // Run tell: a small vertical hop while this sprite travels. Finite (a fixed
  // number of cycles sized to the possession), so it self-terminates and never
  // becomes an always-on loop; idle sprites never run it.
  const stride = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion || !moves) {
      stride.value = 0;
      return;
    }
    const dur = scaled(totalMs * timeScale, speed);
    const hop = scaled(STRIDE_MS, speed);
    const cycles = Math.max(2, Math.round(dur / hop));
    stride.value = 0;
    stride.value = withRepeat(
      withSequence(
        withTiming(1, { duration: Math.round(hop / 2), easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: Math.round(hop / 2), easing: Easing.in(Easing.quad) })
      ),
      cycles,
      false
    );
    return () => cancelAnimation(stride);
    // Keyed on the possession (seq), matching the travel effect above.
  }, [seq, reducedMotion, moves, stride]);
  const strideStyle = useAnimatedStyle(() => {
    if (!moves) return {};
    return { transform: [{ translateY: -Math.round(STRIDE_HOP * stride.value) }] };
  });

  // The dunk squash overlay, timed to the slam: gather, leap, slam (the ball
  // arrives), hang, recover. Delayed to the shot beat so it lands with the ball;
  // the travel to the rim is the plan's waypoints, so this is scale/lift only.
  const dunk = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion || !isDunker) {
      dunk.value = 0;
      return;
    }
    dunk.value = 0;
    dunk.value = withDelay(
      scaled(preShotMs * timeScale, speed),
      withTiming(1, { duration: scaled(DUNK_TOTAL * timeScale, speed), easing: Easing.linear })
    );
    return () => cancelAnimation(dunk);
    // Keyed on the possession (seq), matching the travel effect above.
  }, [seq, isDunker, reducedMotion, dunk]);
  const dunkStyle = useAnimatedStyle(() => {
    const p = dunk.value;
    const lift = interpolate(p, DUNK_KF, [0, 0, -DUNK.lift, 0, 0, 0]);
    const sx = interpolate(p, DUNK_KF, [1, 1.08, 0.88, 1.16, 1.1, 1]);
    const sy = interpolate(p, DUNK_KF, [1, 0.86, 1.22, 0.82, 0.88, 1]);
    return { transform: [{ translateY: Math.round(lift) }, { scaleX: sx }, { scaleY: sy }] };
  });

  // On-fire aura: a flame glow behind a hot scorer (NBA Jam). Steady under reduced
  // motion. Paused (no loop) unless this sprite is actually on fire, so the other
  // nine sprites don't run an unread shared-value loop every frame of the watch.
  // A warm (two straight) sprite wears a steady half-lit aura instead: the tease
  // that the next make ignites, with no loop at all.
  const glowStyle = useGlowPulse(560, { paused: heat !== 'fire' });

  if (!rp) return null;
  const inner = (
    <>
      {heat !== 'none' ? (
        <Animated.View
          pointerEvents="none"
          style={heat === 'fire' ? [styles.aura, glowStyle] : [styles.aura, styles.auraWarm]}
        />
      ) : null}
      <PixelPlayer
        color={team.colorHex}
        accent={team.accentHex}
        number={rp.jerseyNumber ?? jerseyNumber(rp.player.name)}
        skinIndex={skinIndexFor(rp.player.name)}
        active={active}
      />
      {/* Under reduced motion the ball doesn't fly, so the active sprite holds it. */}
      {active && reducedMotion ? <View style={styles.ball} /> : null}
    </>
  );

  return (
    <View style={[styles.sprite, { left, top }]}>
      <Animated.View style={posStyle}>
        <Animated.View style={strideStyle}>
          <Animated.View style={bobStyle}>
            <Animated.View style={dunkStyle}>
              {isDunker ? (
                inner
              ) : (
                <Pop trigger={active ? current!.seq : `idle-${side}-${position}`}>
                  {inner}
                </Pop>
              )}
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </View>
  );
});

// Stable empty default so a non-hot frame doesn't hand CourtView a fresh array and
// defeat its memo (the busy case passes the memoized hotKeys from the feed).
const NO_HOT_KEYS: string[] = [];

function CourtViewImpl({
  homeTeam,
  awayTeam,
  current,
  plan,
  hotKeys = NO_HOT_KEYS,
  warmKeys = NO_HOT_KEYS,
  ignite = false,
  cinema = false,
  arenaTier = 'routine',
  crowdPlan,
  onArrival,
}: CourtViewProps) {
  const { reducedMotion, simSpeed, arcadeExtras } = useFeelSettings();
  // Every game is hosted in the opponent's arena, so the floor takes their colors,
  // tinted over the player's unlocked home-court theme.
  const courtBase = useCourtTheme();
  const theme = useMemo(
    () => courtThemeFor(awayTeam.colorHex, awayTeam.accentHex, courtBase),
    [awayTeam.colorHex, awayTeam.accentHex, courtBase]
  );

  // Name -> player lookups, built once per team so each sprite resolves its
  // on-court player without rebuilding a combined starters+bench array per event.
  const homeRoster = useMemo(() => rosterByName(homeTeam), [homeTeam]);
  const awayRoster = useMemo(() => rosterByName(awayTeam), [awayTeam]);

  // Aspect-lock the floor to the true 50:94 court inside the available space, so
  // feet map to pixels uniformly on both axes (circles stay round, and every
  // fractional player/ball coordinate lands on the drawn markings). The leftover
  // space reads as a dark out-of-bounds apron.
  const [avail, setAvail] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) =>
    setAvail({
      width: e.nativeEvent.layout.width,
      height: e.nativeEvent.layout.height,
    });
  const scale = Math.min(avail.width / COURT.width, avail.height / COURT.length);
  const size = { width: COURT.width * scale, height: COURT.length * scale };

  // The landed event: drives the rim flourish and particles so they fire when
  // the ball arrives, not when the play is first revealed.
  const [arrival, setArrival] = useState<SimEvent | null>(null);
  // The apron crowd (mounted only on elite+ games; the ref stays null on routine
  // games, so the whole per-event cost there is this null check). Honest crowd:
  // it reacts only to the HOME side — silence on opponent plays is the read.
  const crowdRef = useRef<ApronCrowdHandle>(null);
  const handleArrival = useCallback(
    (e: SimEvent) => {
      setArrival(e);
      if (crowdRef.current && e.team === 'home') {
        const plan = crowdPlan?.get(e.seq);
        if (plan && plan.tier !== 'small') crowdRef.current.react('cheer');
        else if (isMadeShot(e)) crowdRef.current.react('bob');
      }
      onArrival?.(e);
    },
    [onArrival, crowdPlan]
  );

  const burst = useMemo(
    () => burstFor(arrival, plan, homeTeam, awayTeam, size.width, size.height),
    [arrival, plan, homeTeam, awayTeam, size.width, size.height]
  );

  // The ignite moment (a scorer's third straight make) fires a flame spark at the
  // shooter's shot spot, layered over the rim burst so the milestone is felt.
  const igniteOrigin = useMemo(
    () =>
      ignite && arrival && size.width > 0
        ? plan
          ? fracToPx(plan.igniteFrac, size.width, size.height)
          : spotPx(arrival.team, arrival.scorerPosition, size.width, size.height, null)
        : null,
    [ignite, arrival, plan, size.width, size.height]
  );

  // The shooter entered this possession already on fire: the ball flies flaming.
  const ballHot =
    current != null && hotKeys.includes(`${current.team}-${current.scorerPosition}`);

  // The broadcast camera: a single transform on the court box (translate + scale)
  // that follows the ball, pushes into the attacking half for a half-court set,
  // leans on the shot, and pulls back on the rebound/reset. Everything inside the
  // box rides along registered (it's all placed by court fraction). Subsumes the
  // old game-winner cinema zoom (the `cinema` prop drives a hotter zoom in the plan).
  const currentSeq = current?.seq ?? -1;
  const camPath = useMemo(() => {
    const cam = plan?.camera;
    if (!cam || cam.keys.length === 0 || size.width === 0 || size.height === 0) return null;
    const total = cam.keys[cam.keys.length - 1].atMs || 1;
    return {
      times: cam.keys.map((k) => k.atMs / total),
      sx: cam.keys.map((k) => k.zoom),
      tx: cam.keys.map((k) => -(k.center.x - 0.5) * size.width * k.zoom),
      ty: cam.keys.map((k) => -(k.center.y - 0.5) * size.height * k.zoom),
    };
  }, [plan?.camera, size.width, size.height]);
  // Read the (identity-stable-per-possession) camera inputs through a ref so the
  // driver keys ONLY on seq: a mid-possession speed/mode toggle must not restart
  // the pan while the ball keeps flying (matches the sprite travel effects).
  const camInputs = useRef({ camPath, dur: 0 });
  camInputs.current = {
    camPath,
    dur: scaled((plan?.totalMs ?? 0) * (plan?.timeScale ?? 1), SIM_SPEED_FACTOR[simSpeed]),
  };
  const camP = useSharedValue(0);
  useEffect(() => {
    const { camPath: cp, dur } = camInputs.current;
    if (reducedMotion || !cp || currentSeq < 0) {
      camP.value = 0;
      return;
    }
    camP.value = 0;
    camP.value = withTiming(1, { duration: dur, easing: Easing.inOut(Easing.quad) });
    return () => cancelAnimation(camP);
  }, [currentSeq, reducedMotion, camP]);
  const camStyle = useAnimatedStyle(() => {
    // Reduced motion (or no plan) holds the fixed wide view (identity).
    if (reducedMotion || !camPath) return {};
    return {
      transform: [
        { translateX: Math.round(interpolate(camP.value, camPath.times, camPath.tx)) },
        { translateY: Math.round(interpolate(camP.value, camPath.times, camPath.ty)) },
        { scale: interpolate(camP.value, camPath.times, camPath.sx) },
      ],
    };
  });

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      {arenaTier !== 'routine' && arcadeExtras && avail.width > 0 ? (
        <ApronCrowd
          ref={crowdRef}
          availWidth={avail.width}
          availHeight={avail.height}
          courtWidth={size.width}
          courtHeight={size.height}
          tier={arenaTier}
          seed={awayTeam.name}
        />
      ) : null}
      <Animated.View
        style={[styles.courtBox, { width: size.width, height: size.height }, camStyle]}
      >
        <SvgCourt
          floorColor={theme.floorColor}
          lineColor={theme.lineColor}
          accentColor={theme.accentColor}
        />
        {/* The opponent's name painted on their own side of the floor (the top
            half they defend), outlined in the player's team color so it reads
            against the opponent-themed court. The player's squad plays the bottom. */}
        <Text
          style={[
            styles.courtTeamName,
            {
              color: theme.lineColor,
              top: Math.round(size.height * 0.012),
              textShadowColor: homeTeam.colorHex,
            },
          ]}
          numberOfLines={1}
        >
          {awayTeam.name.toUpperCase()}
        </Text>
        {(['away', 'home'] as SimTeamSide[]).map((side) =>
          POSITIONS.map((position) => {
            const key = spriteKey(side, position);
            return (
              <SpriteAt
                key={key}
                side={side}
                position={position}
                team={side === 'home' ? homeTeam : awayTeam}
                roster={side === 'home' ? homeRoster : awayRoster}
                current={current}
                width={size.width}
                height={size.height}
                heat={
                  hotKeys.includes(key)
                    ? 'fire'
                    : warmKeys.includes(key)
                      ? 'warm'
                      : 'none'
                }
                waypoints={plan?.movers[key]}
                isDunker={plan?.dunk === true && plan.shooterKey === key}
                preShotMs={plan?.preShotMs ?? 0}
                totalMs={plan?.totalMs ?? 0}
                timeScale={plan?.timeScale ?? 1}
              />
            );
          })
        )}
        <BallFlight
          event={current}
          plan={plan}
          width={size.width}
          height={size.height}
          hot={ballHot}
          cinema={cinema}
          onArrival={handleArrival}
        />
        <RimRipple
          event={arrival}
          width={size.width}
          height={size.height}
          color={theme.accentColor}
        />
        <ParticleBurst
          origin={burst?.origin ?? null}
          variant={burst?.variant ?? 'spark'}
          count={burst?.count}
          color={burst?.color}
          trigger={burst ? arrival?.seq : null}
        />
        <ParticleBurst
          origin={igniteOrigin}
          variant="spark"
          count={8}
          color={palette.flame}
          trigger={igniteOrigin ? arrival?.seq : null}
        />
      </Animated.View>
    </View>
  );
}

/**
 * Memoized so the court subtree skips re-render when the feed re-renders without a
 * new play (a ball arrival, a speed/highlights toggle): only a changed `current` or
 * `hotKeys` re-renders the ten sprites. SpriteAt is memoized in turn so an arrival
 * that only flips the hot aura re-renders just the sprites whose hot flag changed.
 */
export const CourtView = memo(CourtViewImpl);

const SPRITE_W = 30;

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // Clip the camera-zoomed floor to the court boundary so the panned-away half
    // and apron never overpaint the ticker.
    overflow: 'hidden',
    // The out-of-bounds apron framing the aspect-locked court.
    backgroundColor: palette.bgDeep,
  },
  courtBox: {
    position: 'relative',
  },
  courtTeamName: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
    opacity: 0.85,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
  },
  sprite: {
    position: 'absolute',
    width: SPRITE_W,
    // Center the sprite on its court spot (left/top set per sprite).
    marginLeft: -SPRITE_W / 2,
    marginTop: -SPRITE_W * 0.75,
    alignItems: 'center',
  },
  aura: {
    position: 'absolute',
    top: -4,
    left: -4,
    width: SPRITE_W + 8,
    height: SPRITE_W * 1.5 + 8,
    borderRadius: 4,
    backgroundColor: palette.flame,
  },
  auraWarm: {
    opacity: 0.5,
  },
  ball: {
    position: 'absolute',
    right: -6,
    top: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.orange,
    borderWidth: 1,
    borderColor: palette.courtLine,
  },
});
