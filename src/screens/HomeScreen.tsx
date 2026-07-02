import { type ReactNode } from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useArcadeRouter } from '@/navigation';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { CoinPill } from '@/components/CoinPill';
import { MenuButton } from '@/components/MenuButton';
import {
  BasketballIcon,
  CrownIcon,
  FlameIcon,
  GearIcon,
  HelpIcon,
  JoystickIcon,
  LockIcon,
  LockerIcon,
  RecruitIcon,
  StarIcon,
  WhistleIcon,
} from '@/components/run/PixelIcons';
import { FreeAgentRevealView } from '@/components/run/FreeAgentRevealView';
import { CLASS_COLOR } from '@/components/run/class-ui';
import { haptics, sfx, useGlowPulse, useBobPulse, useHubBackdrop } from '@/feel';
import { useHomeRoster } from '@/context/HomeRosterContext';
import { useActiveRun } from '@/context/ActiveRunContext';
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  LADDER_CLASSES,
  difficultyPerks,
  isCellCleared,
  unlockedClassesFromCells,
  type Difficulty,
  type LadderClass,
} from '@/game/difficulty-mode';
import { bountyFor } from '@/game/bounties';
import { getCoach, nextCoachNudge } from '@/game/coaches';
import { COURT_THEMES, courtThemeUnlocked, courtThemeUnlockHint } from '@/game/court-themes';
import { DAILY_BOUNTY_COINS, spotlightCell, weeklyProgress } from '@/game/daily';
import { DailyPanel } from '@/components/home/DailyPanel';
import { DeltaChip } from '@/components/home/DeltaChip';
import { useDayKey } from '@/hooks/useDayKey';
import { useHubDeltas } from '@/hooks/useHubDeltas';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/** A quiet icon-chip button for the screen's corner chrome, with the standard
 * secondary tap feedback baked in. */
function CornerButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.cornerButton}
      hitSlop={space(3)}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        haptics.light();
        sfx.tap('secondary');
        onPress();
      }}
    >
      {icon}
    </Pressable>
  );
}

/** Main menu screen: the arcade lobby and entry point for the game. */
export default function HomeScreen() {
  // Plain router for the How to Play modal so it keeps its native slide-up; the
  // arcade pixel-wipe (`nav`) drives every other route.
  const router = useRouter();
  const nav = useArcadeRouter();
  const { homeRoster, loaded, saveHomeRoster } = useHomeRoster();
  const { savedRun } = useActiveRun();
  // Pause every menu attract loop after a stretch of no touch; the hub backdrop bundle
  // wires the touch-wake (onTouchStart) for us, and `idle` also gates the title glow/bob.
  const { idle, screenProps } = useHubBackdrop();
  // One idle "breathe" loop drives the title: a gold glow behind the orange word
  // and a gentle bob on the pixel basketball. Slower than the default so it reads
  // as a title, not a flicker. Held steady under reduced motion or while idle.
  const glowStyle = useGlowPulse(1300, { paused: idle });
  const bobStyle = useBobPulse(1300, { bobAmplitude: 4, paused: idle });
  // The Daily Layer's calendar keys (recomputed on foreground/focus, never in render).
  // Called before the welcome early-return so the hook order is stable.
  const { day, week } = useDayKey();
  // Since-you-left deltas: captured per focus, revealed after a short hold so the
  // hub lands static and tappable first. See useHubDeltas for the ledger contract.
  const { deltas, baselineCoins, revealed } = useHubDeltas();

  // First launch: welcome the player with their starting free agents, once.
  if (loaded && homeRoster && !homeRoster.seenWelcome) {
    return (
      <FreeAgentRevealView
        players={homeRoster.players}
        onContinue={() => saveHomeRoster({ ...homeRoster, seenWelcome: true })}
      />
    );
  }

  // Ladder classes unlock GLOBALLY from the cleared-cell set: a class cleared on any
  // difficulty is selectable on every difficulty, so the 4x5 grid is a bounty board
  // to attack in any order rather than four ladders to re-climb.
  const clearedCells = homeRoster?.clearedCells ?? [];
  const unlocked = homeRoster ? unlockedClassesFromCells(clearedCells) : [];
  // A chip's crest is CELL-exact (this class cleared on the selected difficulty), so
  // jumped-over cells still read as open bounties. Drives the crest badges on the
  // ladder chips + the reward teaser below.
  const isConquered = (cls: LadderClass) =>
    homeRoster != null && isCellCleared(clearedCells, homeRoster.selectedDifficulty, cls);
  const coach = homeRoster ? getCoach(homeRoster.selectedCoachId) : null;
  // The selected difficulty's repeatable perks (derived from the mods, so the pitch
  // can never drift from the tuning), plus ONE rotating goal nudge (coach or court
  // theme, alternating by day so the hub never stacks nudges) and the Daily Layer
  // card: the anticipation layer for climbing.
  const perks = homeRoster
    ? difficultyPerks(homeRoster.selectedDifficulty, homeRoster.selectedLadderClass).slice(0, 3)
    : [];
  const coachNudge = homeRoster
    ? nextCoachNudge(homeRoster.ladderProgress, new Set(homeRoster.ownedCoaches))
    : null;
  const nextTheme = homeRoster
    ? COURT_THEMES.find((t) => !courtThemeUnlocked(t, clearedCells))
    : undefined;
  const nudges = [
    coachNudge ? `${coachNudge.hint}.` : null,
    nextTheme ? `${courtThemeUnlockHint(nextTheme)} to unlock the ${nextTheme.name} court.` : null,
  ].filter((n): n is string => n != null);

  const goalNudge = nudges.length ? nudges[day.charCodeAt(day.length - 1) % nudges.length] : null;
  const spotlight = homeRoster ? spotlightCell(day, clearedCells) : null;
  const spotlightClaimed = homeRoster?.daily?.spotlightClaimedDay === day;
  const weekly = weeklyProgress(homeRoster?.weekly, week);
  const playSpotlight = () => {
    if (!homeRoster || !spotlight) return;
    saveHomeRoster({
      ...homeRoster,
      selectedDifficulty: spotlight.difficulty,
      selectedLadderClass: spotlight.ladderClass,
    });
    nav.push({ pathname: '/run', params: { mode: 'new' } }, 'run');
  };

  // Unlocks are global, so the ladder selection stays valid across difficulties.
  const setDifficulty = (d: Difficulty) => {
    if (!homeRoster) return;
    saveHomeRoster({ ...homeRoster, selectedDifficulty: d });
  };

  const setLadderClass = (cls: LadderClass) => {
    if (!homeRoster || !unlocked.includes(cls)) return;
    saveHomeRoster({ ...homeRoster, selectedLadderClass: cls });
  };

  return (
    <Screen
      scroll
      scanlines
      {...screenProps}
      contentContainerStyle={styles.container}
    >
      {/* Corner chrome, like an arcade cabinet's service panel: help and settings
          buttons top-left, the coin pill top-right (where every hub screen keeps
          it). All three cost the menu column zero height. */}
      <View style={[styles.cornerCluster, styles.cornerLeft]}>
        <CornerButton
          label="How to Play"
          icon={<HelpIcon size={16} color={palette.inkDim} />}
          onPress={() => router.push('/modal')}
        />
        <CornerButton
          label="Settings"
          icon={<GearIcon size={16} color={palette.inkDim} />}
          onPress={() => nav.push('/settings')}
        />
      </View>
      {loaded && homeRoster ? (
        <View style={[styles.cornerCluster, styles.cornerRight]}>
          {/* The earned-coins chip grows the corner cluster LEFTWARD into free
              space (the cluster is right-anchored), so it costs zero height and
              moves nothing; the pill holds the old balance through the reveal
              hold, then climbs to the new total while the chip states the rise. */}
          <DeltaChip amount={deltas.coins} index={0} visible={revealed} paused={idle} />
          <CoinPill coins={revealed ? homeRoster.coins : baselineCoins} tick />
        </View>
      ) : null}
      <View style={styles.titleBlock}>
        <Animated.View style={bobStyle}>
          <BasketballIcon size={22} color={palette.courtLine} />
        </Animated.View>
        <Text style={styles.title}>PIXEL</Text>
        <View style={styles.hoopsWrap}>
          <Animated.View
            pointerEvents="none"
            style={[styles.hoopsGlow, glowStyle]}
          />
          <Text style={[styles.title, styles.highlight]}>HOOPS</Text>
        </View>
        <Text style={styles.subtitle}>8-Bit Basketball Roguelike</Text>
      </View>

      {loaded && homeRoster ? (
        <View style={styles.selectBox}>
          <View style={styles.chipRow}>
            {DIFFICULTIES.map((d) => {
              const active = homeRoster.selectedDifficulty === d;
              return (
                <Pressable
                  key={d}
                  onPress={() => setDifficulty(d)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text
                    style={[styles.chipText, active && styles.chipTextActive]}
                  >
                    {DIFFICULTY_LABELS[d].name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.selectBlurb} numberOfLines={2}>
            {DIFFICULTY_LABELS[homeRoster.selectedDifficulty].blurb}
          </Text>
          {perks.length > 0 ? (
            <View style={styles.perkRow}>
              {perks.map((p) => (
                <Text key={p} style={styles.perkChip}>
                  {p}
                </Text>
              ))}
            </View>
          ) : null}

          <Text style={styles.selectLabel}>LADDER</Text>
          <View style={styles.chipRow}>
            {LADDER_CLASSES.map((cls) => {
              const isUnlocked = unlocked.includes(cls);
              const active = homeRoster.selectedLadderClass === cls;
              const color = CLASS_COLOR[cls];
              return (
                <Pressable
                  key={cls}
                  onPress={() => setLadderClass(cls)}
                  disabled={!isUnlocked}
                  style={[
                    styles.classChip,
                    { borderColor: color },
                    active && { backgroundColor: color + '33' },
                    !isUnlocked && styles.chipLocked,
                  ]}
                >
                  {isUnlocked ? (
                    <Text style={[styles.classChipText, { color }]}>{cls}</Text>
                  ) : (
                    <LockIcon size={14} color={palette.inkDim} />
                  )}
                  {/* A uniform gold-star "conquered" stamp on the tiny chip corner, distinct
                      from the Hall of Fame shelf's tier-specific crests (a coin/flame/crown at
                      chip scale would read as clutter, not a trophy). */}
                  {isConquered(cls) ? (
                    <View style={styles.crestBadge}>
                      <StarIcon size={10} color={palette.gold} />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.bountyTeaser} numberOfLines={1}>
            {isConquered(homeRoster.selectedLadderClass)
              ? `${homeRoster.selectedLadderClass} BOUNTY CLAIMED`
              : `BOUNTY: ${bountyFor(homeRoster.selectedDifficulty, homeRoster.selectedLadderClass).label}`}
          </Text>
          {coach ? (
            <Pressable
              style={styles.coachRow}
              onPress={() => nav.push('/coaches')}
            >
              <WhistleIcon size={14} color={CLASS_COLOR[coach.class]} />
              <Text
                style={[styles.coachName, { color: CLASS_COLOR[coach.class] }]}
                numberOfLines={1}
              >
                {coach.name}
              </Text>
              <Text style={styles.coachChange}>CHANGE ›</Text>
            </Pressable>
          ) : null}
          {goalNudge ? (
            <Text style={styles.goalNudge} numberOfLines={1}>
              {goalNudge}
            </Text>
          ) : null}
        </View>
      ) : null}

      {loaded && homeRoster && spotlight ? (
        <DailyPanel
          cell={spotlight}
          bountyCoins={DAILY_BOUNTY_COINS[spotlight.difficulty]}
          claimedToday={spotlightClaimed}
          weeklyWins={weekly.gameWins}
          claimedTiers={weekly.claimedTiers}
          attract={!idle}
          onPlaySpotlight={playSpotlight}
        />
      ) : null}

      <View style={styles.menu}>
        <MenuButton
          variant="hero"
          label="NEW RUN"
          color={palette.gold}
          icon={<BasketballIcon size={28} color={palette.gold} />}
          attract={!idle}
          onPress={() =>
            nav.push({ pathname: '/run', params: { mode: 'new' } }, 'run')
          }
        />
        {savedRun ? (
          <MenuButton
            variant="wide"
            label="RESUME RUN"
            // A hot suspended run wears its streak on the card: the flame and the
            // "3W hot" read are the pull back in ("that run is still burning").
            sublabel={`${DIFFICULTY_LABELS[savedRun.difficulty].name} • ${savedRun.ladderClass}${
              savedRun.wins >= 2 ? ` • ${savedRun.wins}W hot` : ''
            }`}
            color={palette.orange}
            icon={
              savedRun.wins >= 2 ? (
                <FlameIcon size={22} color={palette.orange} />
              ) : (
                <BasketballIcon size={22} color={palette.orange} />
              )
            }
            attract={!idle}
            attractDelayMs={200}
            onPress={() =>
              nav.push({ pathname: '/run', params: { mode: 'resume' } }, 'run')
            }
          />
        ) : null}
        <View style={styles.tileRow}>
          <MenuButton
            variant="tile"
            style={styles.tile}
            label="LOCKER ROOM"
            color={palette.makeGreen}
            icon={<LockerIcon size={24} color={palette.makeGreen} />}
            attract={!idle}
            attractDelayMs={150}
            onPress={() => nav.push('/locker')}
          />
          <MenuButton
            variant="tile"
            style={styles.tile}
            label="ARCADE"
            color={palette.flame}
            icon={<JoystickIcon size={24} color={palette.flame} />}
            attract={!idle}
            attractDelayMs={300}
            onPress={() => nav.push('/arcade')}
          />
        </View>
        <View style={styles.tileRow}>
          <MenuButton
            variant="tile"
            style={styles.tile}
            label="ROSTER"
            color={palette.steelBlue}
            icon={<RecruitIcon size={24} color={palette.steelBlue} />}
            // Collection copies gained since the roster browser was last opened
            // (a real count: "N meters moved, go look"). Clears on viewing it.
            badge={
              <DeltaChip amount={deltas.copies} index={1} visible={revealed} paused={idle} />
            }
            onPress={() => nav.push('/roster')}
          />
          <MenuButton
            variant="tile"
            style={styles.tile}
            label="HALL OF FAME"
            color={palette.gold}
            icon={<CrownIcon size={24} color={palette.gold} />}
            // A dot, not a number: "something new on the shelf" is the message.
            badge={
              <DeltaChip
                amount={deltas.crests}
                variant="dot"
                index={2}
                visible={revealed}
                paused={idle}
              />
            }
            onPress={() => nav.push('/hall-of-fame')}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Sized to fit a whole phone viewport with no scrolling, down to an iPhone SE
  // in the tallest state (saved run + perks + nudge). Spare height on big phones
  // centers the column; the Screen scroll shell stays on only as a safety valve.
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(4),
  },
  cornerCluster: {
    position: 'absolute',
    top: space(2),
    flexDirection: 'row',
    gap: space(2),
  },
  cornerLeft: { left: space(4) },
  cornerRight: { right: space(4) },
  cornerButton: {
    padding: space(2),
    borderWidth: BORDER.thin,
    borderColor: palette.inkDim + '66',
    borderRadius: RADIUS.chip,
    backgroundColor: palette.bgPanel,
  },
  titleBlock: {
    alignItems: 'center',
  },
  title: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h2,
    color: palette.ink,
    letterSpacing: 2,
    // Tight leading so the stacked words read as one lockup; Press Start 2P caps
    // have no descenders, so 4pt of air never clips.
    lineHeight: FONT_SIZE.h2 + 4,
    // letterSpacing adds its advance after the last glyph too; pull the box edge
    // back flush so centered words and the HOOPS glow stay symmetric.
    marginRight: -2,
  },
  highlight: {
    color: palette.orange,
  },
  hoopsWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  hoopsGlow: {
    position: 'absolute',
    top: -4,
    left: -10,
    right: -10,
    bottom: -2,
    backgroundColor: palette.gold + '26',
    borderRadius: RADIUS.chip,
  },
  subtitle: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    letterSpacing: 1,
    marginTop: space(1),
  },
  selectBox: {
    alignItems: 'center',
    marginTop: space(1.5),
    maxWidth: 320,
  },
  selectLabel: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
    marginTop: space(2),
    marginBottom: space(1),
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space(2),
  },
  chip: {
    paddingHorizontal: space(3),
    paddingVertical: space(1.5),
    borderWidth: BORDER.thin,
    borderColor: palette.inkDim,
    borderRadius: RADIUS.chip,
  },
  chipActive: {
    borderColor: palette.gold,
    backgroundColor: palette.gold + '1A',
  },
  chipText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
  },
  chipTextActive: { color: palette.gold },
  selectBlurb: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(2),
    maxWidth: 300,
  },
  classChip: {
    position: 'relative',
    minWidth: 40,
    alignItems: 'center',
    paddingHorizontal: space(2.5),
    paddingVertical: space(1.5),
    borderWidth: BORDER.chunk,
    borderRadius: RADIUS.chip,
  },
  classChipText: { fontFamily: FONT.display, fontSize: FONT_SIZE.small },
  chipLocked: { opacity: 0.4, borderColor: palette.inkDim },
  crestBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: palette.bgDeep,
    borderRadius: RADIUS.chip,
    padding: 1,
  },
  bountyTeaser: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.gold,
    textAlign: 'center',
    marginTop: space(2),
    maxWidth: 300,
  },
  perkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space(1),
    marginTop: space(2),
  },
  perkChip: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.orange,
    borderWidth: BORDER.thin,
    borderColor: palette.orange + '66',
    borderRadius: RADIUS.chip,
    paddingVertical: 2,
    paddingHorizontal: space(2),
    overflow: 'hidden',
  },
  goalNudge: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(2),
    maxWidth: 300,
  },
  coachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    marginTop: space(2),
    paddingHorizontal: space(3),
    paddingVertical: space(1.5),
    borderWidth: BORDER.thin,
    borderColor: palette.chrome + '66',
    borderRadius: RADIUS.chip,
    backgroundColor: palette.chrome + '12',
    maxWidth: 280,
  },
  coachName: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    flexShrink: 1,
  },
  coachChange: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
  },
  menu: {
    width: '100%',
    maxWidth: 360,
    marginTop: space(1),
    gap: space(2),
  },
  tileRow: {
    flexDirection: 'row',
    gap: space(2),
  },
  tile: { flex: 1 },
});
