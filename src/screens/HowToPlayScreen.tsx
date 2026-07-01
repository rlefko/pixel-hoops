import { StyleSheet, View } from 'react-native';
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
import { LineupShapeCard } from '@/components/howtoplay/LineupShapeCard';
import { CenterBurst } from '@/components/howtoplay/CenterBurst';
import type { Position } from '@/types/roster';
import type { MapNodeType } from '@/types/run-map';
import type { PlayerClass } from '@/game/ratings';
import { COPIES_TO_OWN } from '@/game/collection';

const POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
const NODES: MapNodeType[] = ['game', 'elite', 'recruit', 'boost', 'training', 'rest', 'boss'];
const LADDER: PlayerClass[] = ['C', 'B', 'A', 'S', 'S+'];

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

/**
 * The How to Play modal: an arcade attract-mode card that reads top to bottom as
 * the real roguelike loop (draft, set your five, watch, win, grow), teaching it
 * with icon-led, color-coded panels instead of walls of text, and closing on a
 * glowing "LET'S HOOP" button that dismisses to the menu where NEW RUN lives.
 */
export default function HowToPlayScreen() {
  const router = useRouter();

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

      {/* The loop */}
      <InfoPanel title="THE LOOP" accent={palette.gold}>
        <LoopStrip
          beats={[
            { word: 'DRAFT', color: palette.steelBlue, icon: <RecruitIcon size={12} color={palette.steelBlue} /> },
            { word: 'SET', color: palette.gold, icon: <BasketballIcon size={12} color={palette.gold} /> },
            { word: 'WATCH', color: palette.orange, icon: <JoystickIcon size={12} color={palette.orange} /> },
            { word: 'WIN', color: palette.gold, icon: <CrownIcon size={12} color={palette.gold} /> },
            { word: 'GROW', color: REWARD_CHROME, icon: <StarIcon size={12} color={REWARD_CHROME} /> },
          ]}
        />
      </InfoPanel>

      {/* Build your five */}
      <InfoPanel
        icon={<RecruitIcon size={16} color={palette.steelBlue} />}
        title="BUILD YOUR FIVE"
        accent={palette.steelBlue}
        body="Draft a rotation from your collection under a point budget, so you cannot run five aces. Slot one player at each spot: PG SG SF PF C, plus up to three on the bench. Ratings win games. Fit wins more."
      >
        <View style={styles.centerRow}>
          {POSITIONS.map((p, i) => (
            <TagChip key={p} label={p} color={POSITION_COLOR[p]} size="micro" glowDelayMs={i * 120} />
          ))}
          <TagChip label="+3 BENCH" color={palette.inkDim} size="micro" />
        </View>
        <View style={styles.noteRow}>
          <CoinIcon size={12} color={palette.gold} />
          <MonoText style={styles.note}>A point budget keeps you from fielding five aces.</MonoText>
        </View>
      </InfoPanel>

      {/* Your lineup is the plan */}
      <InfoPanel
        icon={<WhistleIcon size={16} color={palette.classMagenta} />}
        title="NO PLAYBOOK MENU"
        accent={palette.classMagenta}
        body="There is no game-plan screen. Your five sets the style for you. Load up on guards and you run fast and rain threes. Stack bigs and you slow it down and pound the paint. A balanced five plays it even. Want a different game? Change your five."
      >
        <View style={styles.shapeRow}>
          <LineupShapeCard
            title="GUARD-HEAVY"
            positions={['PG', 'SG', 'PG']}
            tags={[
              { label: 'FAST', color: palette.makeGreenLt },
              { label: 'THREES', color: palette.gold },
            ]}
            pulseDurationMs={700}
          />
          <View style={styles.divider} />
          <LineupShapeCard
            title="BIG-HEAVY"
            positions={['PF', 'C', 'C']}
            tags={[
              { label: 'SLOW', color: palette.orange },
              { label: 'PAINT', color: palette.missRedLt },
            ]}
            pulseDurationMs={1700}
          />
        </View>
        <View style={styles.noteRow}>
          <WhistleIcon size={12} color={palette.inkDim} />
          <MonoText style={styles.note}>A coach can override the tempo and focus.</MonoText>
        </View>
      </InfoPanel>

      {/* Chase synergies */}
      <InfoPanel
        icon={<FlameIcon size={16} color={SYNERGY_CHROME} />}
        title="CHASE SYNERGIES"
        accent={SYNERGY_CHROME}
        body="The right shapes unlock bonuses, and a run never spells them out. Two guards push the pace. Two bigs wall up the paint. One of every position plays clutch. Three of a kind concentrates the attack. Find the combos that fit your squad."
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

      {/* Watch it play */}
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

      {/* How players enter the collection */}
      <InfoPanel
        icon={<LockerIcon size={16} color={palette.steelBlue} />}
        title="SCOUT & COLLECT"
        accent={palette.steelBlue}
        body="Owning a player takes copies. Commons sign on the first; a rare S-star takes six. Win runs and scout the arcade to collect them, chase the legends, and overflow copies pay out coins."
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
        <MonoText style={styles.note}>
          Copies come from run recruits and arcade scouting.
        </MonoText>
      </InfoPanel>

      {/* The run map and power systems */}
      <InfoPanel
        icon={<BoostIcon size={16} color={REWARD_CHROME} />}
        title="POWER UP"
        accent={REWARD_CHROME}
        body="A run spans seven branching maps, each ending in a boss with a free rest before it. Pick your path: recruit a player, grab gear, train a stat, draft a team boost, or rest. Then stack four systems that compound: items (one per player), boosts (draft one of three each map, hold up to five, banish ones you don't want), abilities (signature and equippable), and one coach per run."
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

      {/* Climb the ladder */}
      <InfoPanel
        icon={<CrownIcon size={16} color={palette.gold} />}
        title="CLIMB THE LADDER"
        accent={palette.gold}
        body="Pick a difficulty. Easy and medium forgive a loss or two; hard and insane forgive none. Then climb the class ladder from C to S+, where clearing a rung unlocks a tougher next run and its Championship Bounty. Your power and the challenge rise together."
      >
        <View style={styles.ladderRow}>
          {LADDER.map((c, i) => (
            <TagChip key={c} label={c} color={CLASS_COLOR[c]} size="small" glowDelayMs={i * 150} />
          ))}
          <CrownIcon size={14} color={palette.gold} />
        </View>
        <MonoText style={[styles.note, styles.timeoutLine]}>
          TIMEOUTS: EASY 2 / MED 1 / HARD 0 / INSANE 0
        </MonoText>
      </InfoPanel>

      {/* Championship bounties: the reward for climbing */}
      <InfoPanel
        icon={<StarIcon size={16} color={REWARD_CHROME} />}
        title="CHAMPIONSHIP BOUNTIES"
        accent={REWARD_CHROME}
        body="Clear a rung you have never beaten and claim its Championship Bounty, a one-time reward that climbs up and to the right: coins, then guaranteed stars, then abilities, then a guaranteed legend, and the Grandmaster crest for taking S+ on insane. A harder run also pays more coins and richer recruits."
      >
        <View style={styles.ladderRow}>
          <TagChip label="COINS" color={palette.gold} size="micro" icon={<CoinIcon size={12} color={palette.gold} />} glowDelayMs={0} />
          <TagChip label="STARS" color={palette.steelBlue} size="micro" icon={<RecruitIcon size={12} color={palette.steelBlue} />} glowDelayMs={120} />
          <TagChip label="ABILITIES" color={SYNERGY_CHROME} size="micro" icon={<StarIcon size={12} color={SYNERGY_CHROME} />} glowDelayMs={240} />
          <TagChip label="LEGENDS" color={palette.gold} size="micro" icon={<CrownIcon size={12} color={palette.gold} />} glowDelayMs={360} />
        </View>
        <MonoText style={styles.note}>
          Harder difficulty, bigger bounty. Every clear stamps a crest: 20 to collect.
        </MonoText>
      </InfoPanel>

      {/* No run is wasted */}
      <InfoPanel
        icon={<CoinIcon size={16} color={palette.makeGreen} />}
        title="NO RUN IS WASTED"
        accent={palette.makeGreen}
        body="Lose and the run ends, but your coins, training, collection, and ladder progress all bank. Only run recruits ride on the win. Drop a buzzer-beater in the fourth? Shake it off. Run it back."
      >
        <View style={styles.centerRow}>
          <TagChip label="COINS" color={palette.gold} size="micro" icon={<CoinIcon size={12} color={palette.gold} />} />
          <TagChip label="TRAINING" color={palette.makeGreenLt} size="micro" icon={<DumbbellIcon size={12} color={palette.makeGreenLt} />} />
          <TagChip label="COLLECTION" color={palette.steelBlue} size="micro" icon={<LockerIcon size={12} color={palette.steelBlue} />} />
          <TagChip label="LADDER" color={REWARD_CHROME} size="micro" icon={<StarIcon size={12} color={REWARD_CHROME} />} />
        </View>
        <View style={styles.noteRow}>
          <RecruitIcon size={12} color={palette.inkDim} />
          <MonoText style={styles.note}>Run recruits are kept only on a clear.</MonoText>
        </View>
        <Callout text="SO CLOSE..." color={palette.flame} textStyle={styles.callout} style={styles.soClose} />
      </InfoPanel>

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
  crest: { flexDirection: 'row', gap: space(4), marginTop: space(3) },

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

  // Lineup shapes
  shapeRow: { flexDirection: 'row', alignItems: 'flex-start' },
  divider: {
    width: BORDER.chunk,
    alignSelf: 'stretch',
    backgroundColor: palette.gridLine,
    marginHorizontal: space(2),
  },

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
  timeoutLine: { marginTop: space(3), textAlign: 'center' },

  // Closing
  soClose: { marginTop: space(3), alignItems: 'center' },
  ctaWrap: { position: 'relative', width: '100%', marginTop: space(2) },
});
