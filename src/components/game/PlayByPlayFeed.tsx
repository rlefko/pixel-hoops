import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/StyledText';
import {
  ShakeView,
  type ShakeViewHandle,
  FlashOverlay,
  type FlashOverlayHandle,
  CrowdPulse,
  type CrowdPulseHandle,
  Scanlines,
  Counter,
  Callout,
  CrunchVignette,
  Pop,
} from '@/components/fx';
import { CourtView } from '@/components/game/CourtView';
import { eventGapMs } from '@/components/game/possession';
import { computeCrowdPulses, type CrowdPulsePlan } from '@/game/crowd-pulse';
import { computeMomentum, type MomentumInfo } from '@/game/momentum';
import { computeHotState } from '@/game/streaks';
import {
  haptics,
  sfx,
  useFeelSettings,
  useGlowPulse,
  SIM_SPEED_FACTOR,
  SIM_SPEED_ORDER,
} from '@/feel';
import { palette, FONT, FONT_SIZE, space, BORDER, RADIUS } from '@/theme';
import { pickReadable } from '@/theme/color';
import { isMadeShot, type SimEvent } from '@/types/sim';
import type { Team } from '@/types/team';

/**
 * The "watch the sim" centerpiece. Replays a precomputed SimEvent timeline at a
 * snappy, event-weighted cadence: misses blow by, makes land, big plays shake
 * the court, flash, buzz, and pop an arcade callout. Skippable at any time
 * (honors the instant-restart pillar).
 */

const VISIBLE_ROWS = 3;
/** A quarter's chapter marker stays up for this many events of the new quarter. */
const QUARTER_NOTE_EVENTS = 3;

function colorForEvent(e: SimEvent): string {
  if (e.result === 'and-one') return palette.gold;
  if (e.result === 'block' || e.result === 'steal') return palette.steelBlue;
  if (e.result === 'score')
    return e.action === 'three' ? palette.gold : palette.makeGreen;
  return palette.missRed;
}

const isWinner = (e: SimEvent): boolean => e.callout === 'BUZZER BEATER!';

/** The edge-pulse color for a planned crowd beat: gold for the walk-off, the
 * scorer's color for a big play, the NEW leader's color on a lead change, and
 * the chapter marker's steel blue on a quarter break. */
function pulseColorFor(
  plan: CrowdPulsePlan,
  e: SimEvent,
  m: MomentumInfo | undefined,
  homeTeam: Team,
  awayTeam: Team
): string {
  switch (plan.kind) {
    case 'winner':
      return palette.gold;
    case 'bigPlay':
      return e.team === 'home' ? homeTeam.colorHex : awayTeam.colorHex;
    case 'leadChange':
      return (m?.margin ?? 0) > 0 ? homeTeam.colorHex : awayTeam.colorHex;
    case 'quarterBreak':
      return palette.steelBlue;
  }
}

/**
 * Playback-rate (and thus pitch) for a made-shot sound. A golden-ratio walk off the
 * event seq nudges consecutive makes ~±0.7 semitone so back-to-back buckets never
 * sound identical, and a hot streak audibly climbs (the NBA-Jam "heating up" fantasy).
 */
function pitchFor(e: SimEvent, hot: { heating: boolean; igniting: boolean } | undefined): number {
  const frac = (e.seq * 0.618) % 1; // seq is a non-negative sequence index, so frac in [0, 1)
  let rate = 0.96 + frac * 0.08;
  if (hot?.igniting) rate *= 1.12;
  else if (hot?.heating) rate *= 1.06;
  return rate;
}

/**
 * A team's name on a chip filled with its own secondary color. The text color is
 * auto-picked for a readable contrast (at least 3:1) against that chip: the
 * team's primary when it clears the bar, else the most legible of warm white /
 * near-black, so even teams whose primary is dark stay readable on the dark HUD.
 */
function TeamChip({ team }: { team: Team }) {
  const textColor = pickReadable(
    team.accentHex,
    [team.colorHex, palette.ink, palette.bgDeep],
    palette.ink,
    3
  );
  return (
    <View style={[styles.teamChip, { backgroundColor: team.accentHex }]}>
      <Text style={[styles.team, { color: textColor }]} numberOfLines={1}>
        {team.name}
      </Text>
    </View>
  );
}

interface PlayByPlayFeedProps {
  timeline: SimEvent[];
  homeTeam: Team;
  awayTeam: Team;
  onComplete: () => void;
}

export function PlayByPlayFeed({
  timeline,
  homeTeam,
  awayTeam,
  onComplete,
}: PlayByPlayFeedProps) {
  const { reducedMotion, simSpeed, highlightsOnly, arcadeExtras, update } = useFeelSettings();
  const insets = useSafeAreaInsets();
  const speed = SIM_SPEED_FACTOR[simSpeed];
  const [cursor, setCursor] = useState(-1);
  const [skipped, setSkipped] = useState(false);
  // Pops the score bug when the lead flips (seq of the flipping event).
  const [leadPopSeq, setLeadPopSeq] = useState(0);
  // The most recently landed event drives the HUD score, callout, and feedback,
  // so the bucket counts and the celebration land *with* the ball, not when the
  // play is first revealed.
  const [landed, setLanded] = useState<SimEvent | null>(null);
  const shakeRef = useRef<ShakeViewHandle>(null);
  const flashRef = useRef<FlashOverlayHandle>(null);
  const crowdPulseRef = useRef<CrowdPulseHandle>(null);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  // Latest pacing, read by the one-shot completion timer without being a dep (so
  // toggling speed/highlights on the final beat can't clear and strand it).
  const pacingRef = useRef({ reducedMotion, speed, highlightsOnly });
  pacingRef.current = { reducedMotion, speed, highlightsOnly };

  const current = cursor >= 0 ? timeline[cursor] : null;
  const homeScore = landed ? landed.homeScore : 0;
  const awayScore = landed ? landed.awayScore : 0;

  // NBA-Jam hot hand, derived once from the timeline (presentation only).
  const hotState = useMemo(() => computeHotState(timeline), [timeline]);

  // The game's narrative, derived once from the timeline beside the hot hand
  // (presentation only, no sim changes): per-event momentum (runs, lead changes,
  // crunch, the clincher), the one beat where crunch begins ("CRUNCH TIME!"),
  // the events that get game-winner cinema (the buzzer-beater or the clincher;
  // at most one per game), the quarter chapter markers ("END Q1 · 18-12",
  // riding the first QUARTER_NOTE_EVENTS events of the new quarter), and the
  // crowd plan (which beats pulse the edges / stir the apron crowd, budget-capped
  // in computeCrowdPulses). Purely derived, so there are no timers to clean up.
  const { momentum, crunchStartSeq, cinemaSeqs, quarterNotes, crowdPlan } = useMemo(() => {
    const momentum = computeMomentum(timeline);
    let crunchStartSeq = -1;
    const cinemaSeqs = new Set<number>();
    const quarterNotes = new Map<number, { text: string; first: boolean }>();
    for (let i = 0; i < timeline.length; i++) {
      const e = timeline[i];
      const m = momentum.get(e.seq);
      if (crunchStartSeq < 0 && m?.crunch) crunchStartSeq = e.seq;
      if (isWinner(e) || m?.clincher) cinemaSeqs.add(e.seq);
      const prev = i > 0 ? timeline[i - 1] : undefined;
      if (prev && e.quarter > prev.quarter) {
        const text = `END Q${prev.quarter} · ${prev.homeScore}-${prev.awayScore}`;
        for (let j = i; j < Math.min(i + QUARTER_NOTE_EVENTS, timeline.length); j++) {
          if (timeline[j].quarter !== e.quarter) break;
          quarterNotes.set(timeline[j].seq, { text, first: j === i });
        }
      }
    }
    const crowdPlan = computeCrowdPulses(timeline, momentum);
    return { momentum, crunchStartSeq, cinemaSeqs, quarterNotes, crowdPlan };
  }, [timeline]);

  // Outcome feedback, tiered so routine plays stay quiet and only special moments
  // pop. Fired when the ball reaches the rim (see CourtView onArrival).
  const applyOutcomeJuice = useCallback(
    (e: SimEvent) => {
      if (e.result === 'block') {
        shakeRef.current?.shake('medium');
        haptics.medium();
        sfx.block();
        return;
      }
      if (e.result === 'steal') {
        shakeRef.current?.shake('light');
        haptics.light();
        sfx.steal();
        return;
      }
      if (!isMadeShot(e)) {
        // Misses/turnovers stay visually quiet; a soft rim clank only on a plain miss,
        // and only outside highlights mode so the condensed watch keeps its punch.
        if (e.result === 'miss' && !pacingRef.current.highlightsOnly) sfx.miss();
        return;
      }

      const hot = hotState.get(e.seq);

      if (isWinner(e)) {
        shakeRef.current?.shake('heavy');
        flashRef.current?.flash(palette.gold, { peak: 0.3 });
        haptics.bigPlay();
        sfx.buzzerBeater();
        return;
      }
      if (e.result === 'and-one') {
        shakeRef.current?.shake('light');
        flashRef.current?.flash(palette.gold, { peak: 0.22 });
        haptics.success();
        sfx.andOne();
        return;
      }
      if (e.action === 'three') {
        shakeRef.current?.shake('light');
        // The ignite make (third straight) lands a heavier pulse: the milestone
        // is felt, not just read off the callout.
        if (hot?.igniting) haptics.medium();
        else haptics.light();
        sfx.three(pitchFor(e, hot));
        return;
      }
      if (e.action === 'dunk') {
        // The slam hits hard: heavy rattle and a triple-burst, below only the winner.
        shakeRef.current?.shake('heavy');
        haptics.bigPlay();
        sfx.dunk();
        return;
      }
      if (e.isBigPlay) {
        // A clutch bucket (the sim flags it) earns a small bump over a routine make.
        shakeRef.current?.shake('light');
        haptics.medium();
        sfx.make(pitchFor(e, hot));
        return;
      }
      if (hot?.igniting) haptics.medium(); // the ignite make lands heavier
      else haptics.selection(); // routine make: a clean tick, the net swish carries it
      // Routine makes whip by silently in highlights mode so big plays stand out.
      if (!pacingRef.current.highlightsOnly) sfx.make(pitchFor(e, hot));
    },
    [hotState]
  );

  // Narrative feedback layered after the play's own outcome juice: the clincher,
  // crunch time opening, lead changes, run milestones, quarter breaks. All ride
  // the landed event's existing gap; none of them add a millisecond to the watch.
  const applyNarrativeJuice = useCallback(
    (e: SimEvent) => {
      if (isWinner(e)) return; // the buzzer-beater stack owns the whole beat
      const m = momentum.get(e.seq);
      const qn = quarterNotes.get(e.seq);
      if (qn?.first && !pacingRef.current.highlightsOnly) {
        haptics.selection();
        sfx.tap('secondary');
      }
      if (!m) return;
      if (m.clincher) {
        // The game-sealing bucket: a medium beat one rung under the buzzer-beater.
        shakeRef.current?.shake('medium');
        flashRef.current?.flash(palette.gold, { peak: 0.2 });
        haptics.success();
        return;
      }
      if (e.seq === crunchStartSeq) haptics.medium();
      if (m.leadChange) {
        setLeadPopSeq(e.seq);
        const leaderColor = m.margin > 0 ? homeTeam.colorHex : awayTeam.colorHex;
        // Broadcast score-bug behavior: the frame tints toward the new leader,
        // a touch brighter in crunch. Well under the 0.3 buzzer-beater peak.
        flashRef.current?.flash(leaderColor, { peak: m.crunch ? 0.16 : 0.1 });
        haptics.light();
      } else if (m.crunch && isMadeShot(e)) {
        const scorerColor = e.team === 'home' ? homeTeam.colorHex : awayTeam.colorHex;
        flashRef.current?.flash(scorerColor, { peak: 0.1 });
      }
      if (m.runMilestone != null && !hotState.get(e.seq)?.igniting) {
        haptics.light();
        sfx.whoosh('forward');
      }
    },
    [momentum, quarterNotes, crunchStartSeq, hotState, homeTeam, awayTeam]
  );

  // The planned crowd beat (edge pulse), landing with the same arrival as the
  // play's own juice. Quarter breaks stay silent in highlights mode, matching
  // the chapter markers they accompany.
  const applyCrowdBeat = useCallback(
    (e: SimEvent) => {
      const plan = crowdPlan.get(e.seq);
      if (!plan) return;
      if (plan.kind === 'quarterBreak' && pacingRef.current.highlightsOnly) return;
      crowdPulseRef.current?.pulse(
        plan.tier,
        pulseColorFor(plan, e, momentum.get(e.seq), homeTeam, awayTeam)
      );
    },
    [crowdPlan, momentum, homeTeam, awayTeam]
  );

  const handleArrival = useCallback(
    (e: SimEvent) => {
      setLanded(e);
      applyOutcomeJuice(e);
      applyNarrativeJuice(e);
      applyCrowdBeat(e);
    },
    [applyOutcomeJuice, applyNarrativeJuice, applyCrowdBeat]
  );

  // Scheduler: reveal the next event after a possession-length delay so the ball
  // always lands before the next play. Assumes a non-empty timeline.
  useEffect(() => {
    if (skipped || timeline.length === 0 || cursor >= timeline.length - 1)
      return;
    const nextIdx = cursor + 1;
    // Show the current event for its OWN duration before advancing (the first
    // event reveals immediately). Pacing by the next event would cut a peak
    // short when a routine play follows, notably in highlights mode.
    const gap =
      cursor < 0
        ? 0
        : eventGapMs(
            timeline[cursor],
            reducedMotion,
            speed,
            highlightsOnly,
            cinemaSeqs.has(timeline[cursor].seq)
          );
    const timer = setTimeout(() => setCursor(nextIdx), gap);
    return () => clearTimeout(timer);
  }, [cursor, timeline, skipped, reducedMotion, speed, highlightsOnly, cinemaSeqs]);

  // Fire onComplete once the timeline finishes, after the final ball has had time
  // to land and celebrate (so the game-winner isn't cut off by the transition).
  // Keyed on cursor/timeline only; the latest onComplete is read through a ref so
  // a re-render mid-beat can't clear the pending timer.
  useEffect(() => {
    if (completedRef.current || timeline.length === 0 || cursor < timeline.length - 1)
      return;
    completedRef.current = true;
    const last = timeline[timeline.length - 1];
    const p = pacingRef.current;
    const timer = setTimeout(
      () => onCompleteRef.current(),
      eventGapMs(last, p.reducedMotion, p.speed, p.highlightsOnly, cinemaSeqs.has(last.seq))
    );
    return () => clearTimeout(timer);
  }, [cursor, timeline, cinemaSeqs]);

  const skip = useCallback(() => {
    // Jump to the final beat; its ball still arcs and lands the payoff via
    // onArrival (the game-winner), so the skip pays off.
    setSkipped(true);
    setCursor(timeline.length - 1);
  }, [timeline]);

  // In-replay pacing controls (persisted): cycle speed, toggle highlights.
  const cycleSpeed = useCallback(() => {
    const i = SIM_SPEED_ORDER.indexOf(simSpeed);
    update({ simSpeed: SIM_SPEED_ORDER[(i + 1) % SIM_SPEED_ORDER.length] });
  }, [simSpeed, update]);
  const toggleHighlights = useCallback(() => {
    update({ highlightsOnly: !highlightsOnly });
  }, [highlightsOnly, update]);

  const start = Math.max(0, cursor - VISIBLE_ROWS + 1);
  const rows = cursor >= 0 ? timeline.slice(start, cursor + 1) : [];

  // The callout slot speaks with one voice at a time, loudest story first:
  // clincher > streak milestone > the play's own big-play callout > crunch time
  // opening > scoring-run banner > a routine substitution. Subs are derived
  // purely from the landed event (no timers touched), so a fresh body checking
  // in gets a quiet steel-blue "SUB: X IN" only when nothing louder is happening.
  const landedHot = landed ? hotState.get(landed.seq) : undefined;
  const landedMomentum = landed ? momentum.get(landed.seq) : undefined;
  const callout = (() => {
    if (landedMomentum?.clincher) return { text: 'CLINCHER!', color: palette.gold };
    if (landedHot?.igniting) return { text: 'ON FIRE!', color: palette.flame };
    if (landedHot?.heating) return { text: 'HEATING UP!', color: palette.flame };
    if (landed?.isBigPlay && landed.callout)
      return { text: landed.callout, color: colorForEvent(landed) };
    if (landed && landed.seq === crunchStartSeq)
      return { text: 'CRUNCH TIME!', color: palette.gold };
    if (landedMomentum?.runMilestone != null && landedMomentum.runTeam)
      return {
        text: `${landedMomentum.runPts}-0 RUN`,
        color:
          landedMomentum.runTeam === 'home' ? palette.makeGreenLt : palette.missRedLt,
      };
    const sub = landed?.subs?.[0];
    if (sub) return { text: `SUB: ${sub.inName} IN`, color: palette.steelBlue };
    return null;
  })();

  // The chapter marker riding the first events of a new quarter.
  const quarterNote =
    landed && !highlightsOnly ? quarterNotes.get(landed.seq) : undefined;

  // Crunch-time dressing: while the finish is live, the score bug wears a gold
  // breathing underline and the court a faint gold frame. Both unmount outside
  // crunch, so blowouts never pay for them.
  const crunchLive = landedMomentum?.crunch === true;
  const crunchGlow = useGlowPulse(900, { paused: !crunchLive });

  return (
    <View style={styles.wrap}>
      <View style={[styles.hud, { paddingTop: insets.top + space(2) }]}>
        {/* The player's squad is billed first (left) even though they're the
            visitor; the opponent second. Each name rides a chip in its own
            secondary color, and each chip stays matched to that team's score. */}
        {/* The score bug pops when the lead flips (leadPopSeq advances). */}
        <Pop trigger={leadPopSeq} style={styles.scoreRow}>
          <View style={styles.teamCol}>
            <TeamChip team={homeTeam} />
          </View>
          <Counter value={homeScore} style={styles.score} />
          <Text style={styles.dash}>-</Text>
          <Counter value={awayScore} style={styles.score} />
          <View style={styles.teamCol}>
            <TeamChip team={awayTeam} />
          </View>
        </Pop>
        {crunchLive ? <Animated.View style={[styles.crunchBar, crunchGlow]} /> : null}
      </View>

      <ShakeView ref={shakeRef} style={styles.courtWrap}>
        <CourtView
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          current={current}
          hotKeys={landedHot?.hotKeys}
          warmKeys={landedHot?.warmKeys}
          ignite={landedHot?.igniting ?? false}
          cinema={current != null && cinemaSeqs.has(current.seq)}
          onArrival={handleArrival}
        />
        <View style={styles.feed}>
          {rows.map((e) => (
            <Text
              key={e.seq}
              style={[
                styles.feedLine,
                {
                  color:
                    e.team === 'home' ? palette.makeGreenLt : palette.missRedLt,
                  opacity: e === current ? 1 : 0.45,
                },
              ]}
              numberOfLines={1}
            >
              {e.clock} {e.text}
            </Text>
          ))}
        </View>
        {callout ? (
          <Callout text={callout.text} color={callout.color} style={styles.callout} />
        ) : null}
        {quarterNote ? (
          <Callout
            text={quarterNote.text}
            color={palette.steelBlue}
            style={styles.quarterNote}
            textStyle={styles.quarterNoteText}
          />
        ) : null}
        {crunchLive && arcadeExtras ? <CrunchVignette /> : null}
        {/* Always mounted, gated inside pulse() (the FlashOverlay convention). */}
        <CrowdPulse ref={crowdPulseRef} />
        <Scanlines />
        <FlashOverlay ref={flashRef} />
      </ShakeView>

      <View style={[styles.controls, { paddingBottom: insets.bottom }]}>
        <Pressable style={styles.control} onPress={cycleSpeed}>
          <Text style={styles.controlLabel}>{`${SIM_SPEED_FACTOR[simSpeed]}x`}</Text>
        </Pressable>
        <Pressable style={styles.control} onPress={toggleHighlights}>
          <Text style={[styles.controlLabel, highlightsOnly && styles.controlOn]}>
            {highlightsOnly ? 'HIGHLIGHTS' : 'FULL GAME'}
          </Text>
        </Pressable>
        <Pressable style={styles.control} onPress={skip} disabled={skipped}>
          <Text style={styles.skipText}>{skipped ? 'FINISHING...' : 'SKIP >>'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  hud: {
    paddingHorizontal: space(3),
    paddingVertical: space(2),
    alignItems: 'center',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teamCol: {
    maxWidth: 96,
    alignItems: 'center',
  },
  team: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
  },
  teamChip: {
    paddingHorizontal: space(1),
    paddingVertical: space(0.5),
    borderRadius: RADIUS.chip,
  },
  score: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h2,
    color: palette.ink,
    marginHorizontal: space(2),
  },
  dash: {
    fontSize: FONT_SIZE.h3,
    color: palette.inkDim,
  },
  courtWrap: {
    flex: 1,
    margin: space(3),
    overflow: 'hidden',
    borderRadius: RADIUS.chip,
  },
  feed: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    padding: space(3),
  },
  feedLine: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    marginTop: space(1),
    // Keep the ticker legible where it overlaps the sprites on the floor.
    textShadowColor: palette.bgPanel,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  callout: {
    position: 'absolute',
    top: '38%',
    left: 0,
    right: 0,
  },
  quarterNote: {
    position: 'absolute',
    top: '10%',
    left: 0,
    right: 0,
  },
  quarterNoteText: {
    fontSize: FONT_SIZE.small,
  },
  crunchBar: {
    marginTop: space(1),
    width: 96,
    height: 3,
    backgroundColor: palette.gold,
  },
  controls: {
    flexDirection: 'row',
    borderTopWidth: BORDER.thin,
    borderTopColor: palette.bgPanel,
  },
  control: {
    flex: 1,
    paddingVertical: space(3),
    alignItems: 'center',
  },
  controlLabel: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
  },
  controlOn: {
    color: palette.gold,
  },
  skipText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.gold,
  },
});
