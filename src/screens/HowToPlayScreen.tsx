import { useRef } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type ScrollView } from 'react-native';
import Animated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { MenuButton } from '@/components/MenuButton';
import { DisplayText, MonoText } from '@/components/StyledText';
import { Callout, Counter, Pop } from '@/components/fx';
import { useBobPulse, useIdle, HUB_IDLE_MS } from '@/feel';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import {
  BasketballIcon,
  BoostIcon,
  CoinIcon,
  CrownIcon,
  DumbbellIcon,
  FavorIcon,
  FlameIcon,
  GearIcon,
  JoystickIcon,
  LockerIcon,
  NodeIcon,
  RecruitIcon,
  StarIcon,
  WhistleIcon,
} from '@/components/run/PixelIcons';
import { NODE_META } from '@/components/run/node-meta';
import { POSITION_COLOR } from '@/components/game/positionColor';
import { CLASS_COLOR } from '@/components/run/class-ui';
import { REWARD_CHROME, SYNERGY_CHROME } from '@/components/run/rarity-ui';
import { LegendaryHalo } from '@/components/run/reward-fx';
import { InfoPanel } from '@/components/howtoplay/InfoPanel';
import { TagChip } from '@/components/howtoplay/TagChip';
import { PositionPips } from '@/components/howtoplay/PositionPips';
import { LoopStrip } from '@/components/howtoplay/LoopStrip';
import { CenterBurst } from '@/components/howtoplay/CenterBurst';
import type { Position } from '@/types/roster';
import type { MapNodeType } from '@/types/run-map';
import type { PlayerClass } from '@/game/ratings';
import type { HandbookSection } from '@/navigation';
import { COPIES_TO_OWN } from '@/game/collection';
import { MAX_DRAFT_ROTATION, draftPoints } from '@/game/draft';
import { classCost } from '@/game/classes';
import { DIFFICULTIES, difficultyMods, type Difficulty } from '@/game/difficulty-mode';
import {
  FAVOR_CHAMPION_BONUS,
  FAVOR_PER_COPY,
  FAVOR_WIN_POINTS,
  favorConvertible,
} from '@/game/favor';

const POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
const NODES: MapNodeType[] = ['game', 'elite', 'recruit', 'boost', 'training', 'rest', 'boss'];
const LADDER: PlayerClass[] = ['C', 'B', 'A', 'S', 'S+'];
const BENCH_SPOTS = MAX_DRAFT_ROTATION - 5;

const DIFF_LABEL: Record<Difficulty, string> = {
  easy: 'EASY',
  medium: 'MED',
  hard: 'HARD',
  insane: 'INSANE',
};

// Every number below is read from the game modules so the handbook can never
// drift from the rules it teaches.
const BUDGET_LINE = `BUDGET: ${DIFFICULTIES.map(d => `${DIFF_LABEL[d]} ${draftPoints(d)}`).join(' / ')}`;
const TIMEOUT_LINE = `TIMEOUTS: ${DIFFICULTIES.map(d => `${DIFF_LABEL[d]} ${difficultyMods(d).secondChances}`).join(' / ')}`;
const FAVOR_RATE_LINE = `FAVOR PER COPY: ${LADDER.filter(favorConvertible)
  .map(c => `${c} ${FAVOR_PER_COPY[c]}`)
  .join(' / ')}`;

const COST_CHIPS = [
  { label: 'BELOW LADDER', sub: `${classCost('C', 'B')} PTS`, color: palette.makeGreenLt },
  { label: 'AT LADDER', sub: `${classCost('B', 'B')} PT`, color: palette.steelBlue },
  { label: 'ONE ABOVE', sub: `${classCost('A', 'B')} PTS`, color: palette.orange },
  { label: 'LEGENDS', sub: `${classCost('S+', 'C', true)} PTS`, color: palette.gold },
  { label: 'HIGHER', sub: 'BARRED', color: palette.missRedLt },
];

const FAVOR_CHIPS = [
  { label: 'WIN', sub: `+${FAVOR_WIN_POINTS.game}`, color: palette.makeGreenLt },
  { label: 'ELITE', sub: `+${FAVOR_WIN_POINTS.elite}`, color: palette.steelBlue },
  { label: 'BOSS', sub: `+${FAVOR_WIN_POINTS.boss}`, color: palette.orange },
  { label: 'TITLE', sub: `+${FAVOR_CHAMPION_BONUS}`, color: palette.gold },
];

interface Synergy {
  name: string;
  shape: Position[];
  effect: string;
  effectColor: string;
}

const SYNERGIES: Synergy[] = [
  { name: 'BACKCOURT SPEED', shape: ['PG', 'SG'], effect: 'PACE', effectColor: palette.makeGreenLt },
  { name: 'TWIN TOWERS', shape: ['PF', 'C'], effect: 'DEFENSE', effectColor: palette.steelBlue },
  { name: 'POSITIONLESS', shape: ['PG', 'SG', 'SF', 'PF', 'C'], effect: 'CLUTCH', effectColor: palette.gold },
  { name: 'SPECIALISTS', shape: ['SG', 'SG', 'SG'], effect: 'OFFENSE', effectColor: palette.orange },
];

interface HowToPlayScreenProps {
  /** Deep-link anchor: open scrolled to this panel. Missing or invalid opens at the top. */
  initialSection?: HandbookSection;
}

/**
 * The How to Play handbook: an arcade attract-mode card that reads top to bottom as
 * the real roguelike loop (draft, watch, run the map, own, climb, bank), teaching it
 * with icon-led, color-coded panels instead of walls of text. Every panel is a named
 * anchor so MoreLink chips around the app can deep-link straight to a section, and
 * the page closes on a glowing "LET'S HOOP" button that dismisses to the menu where
 * NEW RUN lives.
 */
export default function HowToPlayScreen({ initialSection }: HowToPlayScreenProps) {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const jumped = useRef(false);

  // Deep-link jump: each anchored panel reports its content-relative y on layout.
  // Per the performance conventions, never animated-scroll a screen the player is
  // about to tap; land in position instantly (the RunMapView precedent).
  const anchorTo = (id: HandbookSection) => (e: LayoutChangeEvent) => {
    if (id !== initialSection || jumped.current) return;
    jumped.current = true;
    scrollRef.current?.scrollTo({
      y: Math.max(0, e.nativeEvent.layout.y - space(2)),
      animated: false,
    });
  };

  // A few looping accents on the always-visible hero (the rest of the page's juice
  // rides on per-component pops, glows, and bursts). All hold lit under reduced motion,
  // and settle after 30s of no touch so the always-on hero never drains battery on an
  // open help screen.
  const { idle, bump } = useIdle(HUB_IDLE_MS);
  const bob0 = useBobPulse(1100, { delayMs: 0, paused: idle });
  const bob1 = useBobPulse(1100, { delayMs: 150, paused: idle });
  const bob2 = useBobPulse(1100, { delayMs: 300, paused: idle });

  return (
    <Screen
      scroll
      scanlines
      scrollRef={scrollRef}
      onBack={() => router.back()}
      backLabel="CLOSE"
      contentContainerStyle={styles.content}
      onTouchStart={bump}
    >
      {/* Hero marquee */}
      <View style={styles.hero}>
        <MonoText style={styles.kicker}>PIXEL HOOPS</MonoText>
        <View style={styles.marquee}>
          <LegendaryHalo visible paused={idle} style={styles.heroHalo} />
          <Pop popOnMount>
            <DisplayText style={styles.title}>HOW TO PLAY</DisplayText>
          </Pop>
        </View>
        <MonoText style={styles.thesis}>
          Build a squad. Set your five. Watch them ball. Win to climb. One more run.
        </MonoText>
        <View style={styles.loop}>
          <LoopStrip
            beats={[
              { word: 'DRAFT', color: palette.steelBlue, icon: <RecruitIcon size={12} color={palette.steelBlue} /> },
              { word: 'SET', color: palette.gold, icon: <BasketballIcon size={12} color={palette.gold} /> },
              { word: 'WATCH', color: palette.orange, icon: <JoystickIcon size={12} color={palette.orange} /> },
              { word: 'WIN', color: palette.gold, icon: <CrownIcon size={12} color={palette.gold} /> },
              { word: 'GROW', color: REWARD_CHROME, icon: <StarIcon size={12} color={REWARD_CHROME} /> },
            ]}
          />
        </View>
        <View style={styles.crest}>
          <Animated.View style={bob0}>
            <JoystickIcon size={20} color={palette.orange} />
          </Animated.View>
          <Animated.View style={bob1}>
            <BasketballIcon size={20} color={palette.gold} />
          </Animated.View>
          <Animated.View style={bob2}>
            <CrownIcon size={20} color={palette.classMagenta} />
          </Animated.View>
        </View>
      </View>

      {/* Draft your five */}
      <View style={styles.anchor} onLayout={anchorTo('draft')}>
        <InfoPanel
          icon={<RecruitIcon size={16} color={palette.steelBlue} />}
          title="DRAFT YOUR FIVE"
          accent={palette.steelBlue}
          body={`Draft a rotation from your collection under a point budget. One player per spot, PG SG SF PF C, plus up to ${BENCH_SPOTS} on the bench. There is no playbook menu: your five is the game plan. Guards push pace and rain threes. Bigs slow it down and own the paint.`}
        >
          <View style={styles.centerRow}>
            {POSITIONS.map((p, i) => (
              <TagChip key={p} label={p} color={POSITION_COLOR[p]} size="micro" glowDelayMs={i * 120} />
            ))}
            <TagChip label={`+${BENCH_SPOTS} BENCH`} color={palette.inkDim} size="micro" />
          </View>
          <View style={[styles.ladderRow, styles.rowGap]}>
            {COST_CHIPS.map((c, i) => (
              <TagChip key={c.label} label={c.label} color={c.color} size="micro" sub={c.sub} glowDelayMs={i * 120} />
            ))}
          </View>
          <MonoText style={[styles.note, styles.stackNote]}>{BUDGET_LINE}</MonoText>
          <View style={styles.noteRow}>
            <WhistleIcon size={12} color={palette.inkDim} />
            <MonoText style={styles.note}>A coach can override the tempo and focus.</MonoText>
          </View>
        </InfoPanel>
      </View>

      {/* Chase synergies */}
      <View style={styles.anchor} onLayout={anchorTo('synergies')}>
        <InfoPanel
          icon={<FlameIcon size={16} color={SYNERGY_CHROME} />}
          title="CHASE SYNERGIES"
          accent={SYNERGY_CHROME}
          body="The right shapes unlock bonuses, and a run never spells them out. Two guards push the pace. Two bigs wall up the paint. One of every position plays clutch. Three of a kind concentrates the attack. When your five fits a set, matching boosts glow at the draft."
        >
          <View style={styles.synergyGrid}>
            {SYNERGIES.map((s, i) => (
              <View key={s.name} style={styles.synergyCell}>
                <PositionPips positions={s.shape} size={9} />
                <TagChip
                  label={s.name}
                  color={SYNERGY_CHROME}
                  sub={s.effect}
                  subColor={s.effectColor}
                  size="micro"
                  glowDelayMs={i * 150}
                />
              </View>
            ))}
          </View>
        </InfoPanel>
      </View>

      {/* Watch it play */}
      <View style={styles.anchor} onLayout={anchorTo('watch')}>
        <InfoPanel
          icon={<JoystickIcon size={16} color={palette.orange} />}
          title="WATCH IT PLAY"
          accent={palette.orange}
          body="No timing, no taps, all strategy. Scout both teams first: identity, tempo, and projected top scorer, so you can counter with your five. Then it auto-sims four quarters in about thirty seconds, deterministic and loud, with shakes, flashes, and a count-up scoreboard. Outscore them to advance."
        >
          <View style={styles.scoreboard}>
            <CenterBurst variant="spark" color={palette.gold} />
            <View style={styles.scoreSide}>
              <MonoText style={styles.scoreLabel}>YOU</MonoText>
              <Counter value={58} style={[styles.scoreNum, { color: palette.makeGreen }]} />
            </View>
            <BasketballIcon size={16} color={palette.courtLine} />
            <View style={styles.scoreSide}>
              <MonoText style={styles.scoreLabel}>OPP</MonoText>
              <DisplayText style={[styles.scoreNum, { color: palette.missRed }]}>54</DisplayText>
            </View>
            <View style={styles.qtag}>
              <MonoText style={styles.qtext}>Q4</MonoText>
            </View>
          </View>
          <View style={styles.watchTags}>
            <TagChip
              label="SCOUT FIRST"
              color={palette.steelBlue}
              icon={<WhistleIcon size={12} color={palette.steelBlue} />}
              size="micro"
            />
            <Callout text="BUCKET!" color={palette.gold} textStyle={styles.callout} />
          </View>
        </InfoPanel>
      </View>

      {/* Run the map */}
      <View style={styles.anchor} onLayout={anchorTo('map')}>
        <InfoPanel
          icon={<BoostIcon size={16} color={REWARD_CHROME} />}
          title="RUN THE MAP"
          accent={REWARD_CHROME}
          body="A run spans seven branching maps, each ending in a boss with a free rest before it. Pick your path: recruit a player, grab gear, train a stat, draft a team boost, or rest. Four systems stack for the run: items (one per player), boosts (hold up to five, banish the duds), abilities, and one coach. Run recruits sign for this run only: clear the run to keep them."
        >
          <View style={styles.nodeRow}>
            {NODES.map(t => (
              <View key={t} style={styles.nodeItem}>
                <NodeIcon type={t} size={16} color={NODE_META[t].color} />
                <MonoText style={[styles.nodeLabel, { color: NODE_META[t].color }]}>
                  {NODE_META[t].label}
                </MonoText>
              </View>
            ))}
          </View>
          <View style={styles.powerGrid}>
            <CenterBurst variant="spark" color={REWARD_CHROME} />
            <TagChip label="ITEMS" color={palette.rarePurple} size="micro" sub="GEAR, 1 EACH" icon={<GearIcon size={12} color={palette.rarePurple} />} />
            <TagChip label="BOOSTS" color={REWARD_CHROME} size="micro" sub="TEAM BUFFS" icon={<BoostIcon size={12} color={REWARD_CHROME} />} />
            <TagChip label="ABILITIES" color={SYNERGY_CHROME} size="micro" sub="SIGNATURE" icon={<StarIcon size={12} color={SYNERGY_CHROME} />} />
            <TagChip label="COACHES" color={palette.gold} size="micro" sub="1 PER RUN" icon={<WhistleIcon size={12} color={palette.gold} />} />
          </View>
        </InfoPanel>
      </View>

      {/* Own the roster */}
      <View style={styles.anchor} onLayout={anchorTo('favor')}>
        <InfoPanel
          icon={<LockerIcon size={16} color={palette.steelBlue} />}
          title="OWN THE ROSTER"
          accent={palette.steelBlue}
          body={`Owning a player takes copies. Commons sign on the first; a rare S star takes ${COPIES_TO_OWN.S}. Copies come from run recruits, arcade scouts, and favor: an un-owned player banks favor for every game they win in your five, and it converts to copies when the run ends. Favor survives a lost run. Extra copies of an owned player pay out coins.`}
        >
          <View style={styles.ladderRow}>
            {(['C', 'B', 'A', 'S'] as PlayerClass[]).map((c, i) => (
              <TagChip
                key={c}
                label={c}
                color={CLASS_COLOR[c]}
                size="micro"
                sub={`${COPIES_TO_OWN[c]}x`}
                glowDelayMs={i * 150}
              />
            ))}
            <TagChip
              label="LEGEND"
              color={palette.gold}
              size="micro"
              sub="RARE"
              icon={<StarIcon size={12} color={palette.gold} />}
              glowDelayMs={600}
            />
          </View>
          <View style={[styles.ladderRow, styles.rowGap]}>
            {FAVOR_CHIPS.map((c, i) => (
              <TagChip
                key={c.label}
                label={c.label}
                color={c.color}
                size="micro"
                sub={c.sub}
                icon={<FavorIcon size={12} color={c.color} />}
                glowDelayMs={i * 120}
              />
            ))}
          </View>
          <MonoText style={[styles.note, styles.stackNote]}>{FAVOR_RATE_LINE}</MonoText>
          <MonoText style={[styles.note, styles.stackNote]}>
            Legends never convert. Their favor steers the legend reveal and the scout machines instead.
          </MonoText>
        </InfoPanel>
      </View>

      {/* Climb the ladder */}
      <View style={styles.anchor} onLayout={anchorTo('ladder')}>
        <InfoPanel
          icon={<CrownIcon size={16} color={palette.gold} />}
          title="CLIMB THE LADDER"
          accent={palette.gold}
          body="Pick a difficulty, then climb the classes from C to S+. Clear a class anywhere and it opens everywhere, so the 20-cell grid is yours to attack in any order. The first clear of a cell pays a one-time Championship Bounty, climbing from coins to stars to abilities to a guaranteed legend, with the Grandmaster crest for S+ on insane. Harder pays more, every time: richer purses, rarer drops, and recruits bank extra copies on a clear."
        >
          <View style={styles.ladderRow}>
            {LADDER.map((c, i) => (
              <TagChip key={c} label={c} color={CLASS_COLOR[c]} size="small" glowDelayMs={i * 150} />
            ))}
            <CrownIcon size={14} color={palette.gold} />
          </View>
          <View style={[styles.ladderRow, styles.rowGap]}>
            <TagChip label="COINS" color={palette.gold} size="micro" icon={<CoinIcon size={12} color={palette.gold} />} glowDelayMs={0} />
            <TagChip label="STARS" color={palette.steelBlue} size="micro" icon={<RecruitIcon size={12} color={palette.steelBlue} />} glowDelayMs={120} />
            <TagChip label="ABILITIES" color={SYNERGY_CHROME} size="micro" icon={<StarIcon size={12} color={SYNERGY_CHROME} />} glowDelayMs={240} />
            <TagChip label="LEGENDS" color={palette.gold} size="micro" icon={<CrownIcon size={12} color={palette.gold} />} glowDelayMs={360} />
          </View>
          <View style={[styles.ladderRow, styles.rowGap]}>
            <TagChip label="MEDIUM" color={palette.steelBlue} size="micro" sub={`x${difficultyMods('medium').copiesMul} COPIES`} glowDelayMs={0} />
            <TagChip label="HARD" color={palette.orange} size="micro" sub={`x${difficultyMods('hard').copiesMul} COPIES`} glowDelayMs={150} />
            <TagChip label="INSANE" color={palette.missRedLt} size="micro" sub={`x${difficultyMods('insane').copiesMul} COPIES`} glowDelayMs={300} />
            <TagChip
              label="LEGENDS"
              color={palette.gold}
              size="micro"
              sub="SIGNINGS"
              icon={<CrownIcon size={12} color={palette.gold} />}
              glowDelayMs={450}
            />
          </View>
          <MonoText style={[styles.note, styles.stackNote]}>{TIMEOUT_LINE}</MonoText>
          <MonoText style={[styles.note, styles.stackNote]}>
            Beat the legend, sign the legend: hard and insane S ladders only.
          </MonoText>
          <MonoText style={[styles.note, styles.stackNote]}>
            One grid cell is spotlighted daily for a bonus purse, and weekly goals count every win, even in lost runs. No streaks, no timers: resting costs nothing.
          </MonoText>
        </InfoPanel>
      </View>

      {/* No run is wasted */}
      <View style={styles.anchor} onLayout={anchorTo('bank')}>
        <InfoPanel
          icon={<CoinIcon size={16} color={palette.makeGreen} />}
          title="NO RUN IS WASTED"
          accent={palette.makeGreen}
          body="Lose and the run ends, but your coins, training, favor, collection, and ladder progress all bank. Only run recruits ride on the win. Drop a buzzer-beater in the fourth? Shake it off. Run it back."
        >
          <View style={styles.centerRow}>
            <TagChip label="COINS" color={palette.gold} size="micro" icon={<CoinIcon size={12} color={palette.gold} />} />
            <TagChip label="TRAINING" color={palette.makeGreenLt} size="micro" icon={<DumbbellIcon size={12} color={palette.makeGreenLt} />} />
            <TagChip label="FAVOR" color={palette.steelBlue} size="micro" icon={<FavorIcon size={12} color={palette.steelBlue} />} />
            <TagChip label="COLLECTION" color={palette.steelBlue} size="micro" icon={<LockerIcon size={12} color={palette.steelBlue} />} />
            <TagChip label="LADDER" color={REWARD_CHROME} size="micro" icon={<StarIcon size={12} color={REWARD_CHROME} />} />
          </View>
          <View style={styles.noteRow}>
            <RecruitIcon size={12} color={palette.inkDim} />
            <MonoText style={styles.note}>Run recruits are kept only on a clear.</MonoText>
          </View>
          <Callout text="SO CLOSE..." color={palette.flame} textStyle={styles.callout} style={styles.soClose} />
        </InfoPanel>
      </View>

      {/* Closing call to action */}
      <View style={styles.ctaWrap}>
        <CenterBurst variant="confetti" />
        <MenuButton
          label="LET'S HOOP"
          variant="hero"
          color={palette.gold}
          attract
          icon={<BasketballIcon size={20} color={palette.gold} />}
          onPress={() => router.back()}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space(5),
    paddingBottom: space(8),
    alignItems: 'center',
  },

  // Hero
  hero: { alignItems: 'center', marginTop: space(2), marginBottom: space(5) },
  kicker: {
    color: palette.inkDim,
    fontSize: FONT_SIZE.small,
    letterSpacing: 3,
    marginBottom: space(2),
  },
  marquee: {
    position: 'relative',
    borderWidth: BORDER.chunkier,
    borderColor: palette.gold,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.gold + '14',
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroHalo: { top: -6, left: -6, right: -6, bottom: -6 },
  title: {
    fontSize: FONT_SIZE.h2,
    color: palette.gold,
    letterSpacing: 2,
    textAlign: 'center',
  },
  thesis: {
    color: palette.ink,
    opacity: 0.8,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: space(3),
    paddingHorizontal: space(2),
  },
  loop: { alignSelf: 'stretch', marginTop: space(3) },
  crest: { flexDirection: 'row', gap: space(4), marginTop: space(3) },

  // Anchored panels must be DIRECT children of the scroll content so their
  // onLayout y is content-relative (the deep-link jump scrolls to it).
  anchor: { width: '100%' },

  // Shared inline visuals
  centerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space(2),
    justifyContent: 'center',
    alignItems: 'center',
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    marginTop: space(3),
    justifyContent: 'center',
  },
  note: { color: palette.inkDim, fontSize: FONT_SIZE.small, letterSpacing: 0.5, flexShrink: 1 },
  rowGap: { marginTop: space(3) },
  stackNote: { marginTop: space(3), textAlign: 'center' },

  // Synergies
  synergyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(3), justifyContent: 'center' },
  synergyCell: { width: '44%', alignItems: 'center', gap: space(2) },

  // Scoreboard
  scoreboard: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(3),
    paddingVertical: space(3),
  },
  scoreSide: { alignItems: 'center' },
  scoreLabel: { color: palette.inkDim, fontSize: FONT_SIZE.micro, letterSpacing: 1 },
  scoreNum: { fontFamily: FONT.display, fontSize: FONT_SIZE.h3 },
  qtag: {
    borderWidth: BORDER.thin,
    borderColor: palette.inkDim,
    borderRadius: RADIUS.chip,
    paddingHorizontal: space(1.5),
    paddingVertical: space(0.5),
  },
  qtext: { color: palette.inkDim, fontSize: FONT_SIZE.micro, letterSpacing: 1 },
  watchTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space(3),
    justifyContent: 'center',
    marginTop: space(3),
  },
  callout: { fontSize: FONT_SIZE.label },

  // Run map and power systems
  nodeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space(3), justifyContent: 'center' },
  nodeItem: { alignItems: 'center', gap: space(1), width: 56 },
  nodeLabel: { fontSize: FONT_SIZE.micro, letterSpacing: 0.5 },
  powerGrid: {
    position: 'relative',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space(2),
    justifyContent: 'center',
    marginTop: space(3),
  },

  // Ladder
  ladderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space(2),
    justifyContent: 'center',
  },

  // Closing
  soClose: { marginTop: space(3), alignItems: 'center' },
  ctaWrap: { position: 'relative', width: '100%', marginTop: space(2) },
});
