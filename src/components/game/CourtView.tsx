import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withDelay,
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
import {
  idleBobFor,
  moveOffsetFor,
  roleFor,
  MOVE,
  DUNK,
  WINNER_TIME_SCALE,
} from '@/components/game/possession';
import { useFeelSettings, useBobPulse, useGlowPulse, scaled, SIM_SPEED_FACTOR } from '@/feel';
import { FLIGHT_DURATION_MAX } from '@/feel/useBallFlight';
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
      // The defender/ball is at the player's stable base, so pass null to match.
      origin: spotPx(side, e.scorerPosition, width, height, null),
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

// Game-winner cinema: the court leans in this much while the deciding ball hangs,
// holds through the impact, then snaps back.
const CINEMA_ZOOM = 1.05;
const CINEMA_HOLD_MS = 300;
const CINEMA_SNAP_BACK_MS = 120;

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

const SpriteAt = memo(function SpriteAt({
  side,
  position,
  team,
  roster,
  current,
  width,
  height,
  heat,
}: {
  side: SimTeamSide;
  position: Position;
  team: Team;
  roster: Map<string, RosterPlayer>;
  current: SimEvent | null;
  width: number;
  height: number;
  heat: HeatTier;
}) {
  const { reducedMotion, simSpeed } = useFeelSettings();
  const speed = SIM_SPEED_FACTOR[simSpeed];
  const rp = playerAt(team, position, side, current, roster);

  const role = roleFor(current, side, position);
  const active =
    current != null && current.team === side && current.scorerPosition === position;
  const isDunker = role === 'dunker';
  const seq = current?.seq ?? -1;

  // Stable base: the floor holds a fixed defensive set and does NOT reposition
  // per possession (that read as jumpy). The ball flight and the active
  // shooter/driver/dunker carry the possession. Static percent placement avoids
  // a pre-layout jump.
  const { left, top } = spotPercent(side, position, null);

  // Idle breathe, detuned per sprite so the floor undulates instead of marching.
  const bob = useMemo(() => idleBobFor(side, position), [side, position]);
  const bobStyle = useBobPulse(bob.durationMs, {
    delayMs: bob.delayMs,
    bobAmplitude: bob.bobAmplitude,
  });

  // Possession motion: a driver steps to the rim, a defender leans in, a jumper
  // shooter rises. The dunker owns its own travel (below), so it skips this.
  const offset = useMemo(
    () => moveOffsetFor(current, side, position, width, height),
    [current, side, position, width, height]
  );
  const move = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion || isDunker || (offset.dx === 0 && offset.dy === 0)) {
      move.value = 0;
      return;
    }
    move.value = 0;
    move.value = withSequence(
      withTiming(1, { duration: scaled(MOVE.out, speed), easing: Easing.out(Easing.cubic) }),
      withDelay(
        scaled(MOVE.hold, speed),
        withTiming(0, { duration: scaled(MOVE.back, speed), easing: Easing.out(Easing.quad) })
      )
    );
  }, [seq, offset.dx, offset.dy, reducedMotion, isDunker, speed, move]);
  const moveStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offset.dx * move.value },
      { translateY: offset.dy * move.value },
    ],
  }));

  // The dunk: gather (squash), leap (stretch up toward the rim), slam (squash
  // down, the ball arrives), hang, recover. One progress value drives it all.
  const dunk = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion || !isDunker) {
      dunk.value = 0;
      return;
    }
    dunk.value = 0;
    dunk.value = withTiming(1, { duration: scaled(DUNK_TOTAL, speed), easing: Easing.linear });
    return () => cancelAnimation(dunk);
  }, [seq, isDunker, reducedMotion, speed, dunk]);
  const dunkStyle = useAnimatedStyle(() => {
    const p = dunk.value;
    // Values per beat: rest, gather (squash), leap (stretch up), slam (squash
    // down), hang, recover.
    const travel = interpolate(p, DUNK_KF, [0, 0.4, 1, 1, 1, 0]);
    const lift = interpolate(p, DUNK_KF, [0, 0, -DUNK.lift, 0, 0, 0]);
    const sx = interpolate(p, DUNK_KF, [1, 1.08, 0.88, 1.16, 1.1, 1]);
    const sy = interpolate(p, DUNK_KF, [1, 0.86, 1.22, 0.82, 0.88, 1]);
    return {
      transform: [
        { translateX: Math.round(offset.dx * travel) },
        { translateY: Math.round(offset.dy * travel + lift) },
        { scaleX: sx },
        { scaleY: sy },
      ],
    };
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
      <Animated.View style={moveStyle}>
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
    () => burstFor(arrival, homeTeam, awayTeam, size.width, size.height),
    [arrival, homeTeam, awayTeam, size.width, size.height]
  );

  // The ignite moment (a scorer's third straight make) fires a flame spark at the
  // shooter, layered over the rim burst so the milestone is felt, not just read.
  const igniteOrigin = useMemo(
    () =>
      ignite && arrival && size.width > 0
        ? spotPx(arrival.team, arrival.scorerPosition, size.width, size.height, null)
        : null,
    [ignite, arrival, size.width, size.height]
  );

  // The shooter entered this possession already on fire: the ball flies flaming.
  const ballHot =
    current != null && hotKeys.includes(`${current.team}-${current.scorerPosition}`);

  // Game-winner cinema: the court leans in 5% while the deciding ball hangs in
  // slow motion, holds through the impact, then snaps back. Transform-only, and
  // only ever on this one event per game.
  const currentSeq = current?.seq ?? -1;
  const zoom = useSharedValue(1);
  useEffect(() => {
    if (!cinema || reducedMotion || currentSeq < 0) {
      zoom.value = 1;
      return;
    }
    const speed = SIM_SPEED_FACTOR[simSpeed];
    zoom.value = withSequence(
      withTiming(CINEMA_ZOOM, {
        duration: scaled(FLIGHT_DURATION_MAX * WINNER_TIME_SCALE, speed),
        easing: Easing.out(Easing.quad),
      }),
      withDelay(
        scaled(CINEMA_HOLD_MS, speed),
        withTiming(1, {
          duration: scaled(CINEMA_SNAP_BACK_MS, speed),
          easing: Easing.out(Easing.quad),
        })
      )
    );
    return () => cancelAnimation(zoom);
  }, [cinema, currentSeq, reducedMotion, simSpeed, zoom]);
  const zoomStyle = useAnimatedStyle(() => ({ transform: [{ scale: zoom.value }] }));

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
        style={[styles.courtBox, { width: size.width, height: size.height }, zoomStyle]}
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
          POSITIONS.map((position) => (
            <SpriteAt
              key={`${side}-${position}`}
              side={side}
              position={position}
              team={side === 'home' ? homeTeam : awayTeam}
              roster={side === 'home' ? homeRoster : awayRoster}
              current={current}
              width={size.width}
              height={size.height}
              heat={
                hotKeys.includes(`${side}-${position}`)
                  ? 'fire'
                  : warmKeys.includes(`${side}-${position}`)
                    ? 'warm'
                    : 'none'
              }
            />
          ))
        )}
        <BallFlight
          event={current}
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
