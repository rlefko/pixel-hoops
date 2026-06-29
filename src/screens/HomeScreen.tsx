import { StyleSheet, View, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useArcadeRouter } from '@/navigation';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { Pop } from '@/components/fx';
import { MenuButton } from '@/components/MenuButton';
import {
  BasketballIcon,
  CoinIcon,
  CrownIcon,
  GearIcon,
  HelpIcon,
  JoystickIcon,
  LockerIcon,
  RecruitIcon,
  WhistleIcon,
} from '@/components/run/PixelIcons';
import { FreeAgentRevealView } from '@/components/run/FreeAgentRevealView';
import { CLASS_COLOR } from '@/components/run/class-ui';
import { usePulse } from '@/feel';
import { useHomeRoster } from '@/context/HomeRosterContext';
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  LADDER_CLASSES,
  unlockedClasses,
  type Difficulty,
  type LadderClass,
} from '@/game/difficulty-mode';
import { getCoach } from '@/game/coaches';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/** Main menu screen: the arcade lobby and entry point for the game. */
export default function HomeScreen() {
  // Plain router for the How to Play modal so it keeps its native slide-up; the
  // arcade pixel-wipe (`nav`) drives every other route.
  const router = useRouter();
  const nav = useArcadeRouter();
  const { homeRoster, loaded, saveHomeRoster } = useHomeRoster();
  // One idle "breathe" loop drives the title: a glow behind the gold word and a
  // gentle bob on the pixel basketball. Slower than the default so it reads as a
  // title, not a flicker. Held steady under reduced motion (handled by usePulse).
  const { glowStyle, bobStyle } = usePulse(1300, { bobAmplitude: 4 });

  // First launch: welcome the player with their starting free agents, once.
  if (loaded && homeRoster && !homeRoster.seenWelcome) {
    return (
      <FreeAgentRevealView
        players={homeRoster.players}
        onContinue={() => saveHomeRoster({ ...homeRoster, seenWelcome: true })}
      />
    );
  }

  const unlocked = homeRoster ? unlockedClasses(homeRoster.ladderProgress[homeRoster.selectedDifficulty]) : [];
  const coach = homeRoster ? getCoach(homeRoster.selectedCoachId) : null;

  const setDifficulty = (d: Difficulty) => {
    if (!homeRoster) return;
    // Keep the selected ladder class valid for the new difficulty's unlocks.
    const nowUnlocked = unlockedClasses(homeRoster.ladderProgress[d]);
    const cls = nowUnlocked.includes(homeRoster.selectedLadderClass)
      ? homeRoster.selectedLadderClass
      : nowUnlocked[nowUnlocked.length - 1];
    saveHomeRoster({ ...homeRoster, selectedDifficulty: d, selectedLadderClass: cls });
  };

  const setLadderClass = (cls: LadderClass) => {
    if (!homeRoster || !unlocked.includes(cls)) return;
    saveHomeRoster({ ...homeRoster, selectedLadderClass: cls });
  };

  return (
    <Screen scroll scanlines contentContainerStyle={styles.container}>
      <View style={styles.titleBlock}>
        <Animated.View style={bobStyle}>
          <BasketballIcon size={22} color={palette.courtLine} />
        </Animated.View>
        <Text style={styles.title}>PIXEL</Text>
        <View style={styles.hoopsWrap}>
          <Animated.View pointerEvents="none" style={[styles.hoopsGlow, glowStyle]} />
          <Text style={[styles.title, styles.highlight]}>HOOPS</Text>
        </View>
        <Text style={styles.subtitle}>8-Bit Basketball Roguelike</Text>
      </View>

      {loaded && homeRoster ? (
        <Pop trigger={homeRoster.coins} style={styles.coinRow}>
          <CoinIcon size={14} color={palette.gold} />
          <Text style={styles.coinText}>{homeRoster.coins}</Text>
        </Pop>
      ) : null}

      {loaded && homeRoster ? (
        <View style={styles.selectBox}>
          <Text style={styles.selectLabel}>DIFFICULTY</Text>
          <View style={styles.chipRow}>
            {DIFFICULTIES.map((d) => {
              const active = homeRoster.selectedDifficulty === d;
              return (
                <Pressable
                  key={d}
                  onPress={() => setDifficulty(d)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {DIFFICULTY_LABELS[d].name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.selectBlurb}>
            {DIFFICULTY_LABELS[homeRoster.selectedDifficulty].blurb}
          </Text>

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
                  <Text style={[styles.classChipText, { color: isUnlocked ? color : palette.inkDim }]}>
                    {isUnlocked ? cls : '🔒'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.selectLabel}>COACH</Text>
          {coach ? (
            <Pressable style={styles.coachRow} onPress={() => nav.push('/coaches')}>
              <WhistleIcon size={14} color={CLASS_COLOR[coach.class]} />
              <Text style={[styles.coachName, { color: CLASS_COLOR[coach.class] }]} numberOfLines={1}>
                {coach.name}
              </Text>
              <Text style={styles.coachChange}>CHANGE ›</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.menu}>
        <MenuButton
          variant="hero"
          label="NEW RUN"
          color={palette.gold}
          icon={<BasketballIcon size={28} color={palette.gold} />}
          attract
          onPress={() => nav.push('/run', 'run')}
        />
        <View style={styles.tileRow}>
          <MenuButton
            variant="tile"
            style={styles.tile}
            label="LOCKER ROOM"
            color={palette.makeGreen}
            icon={<LockerIcon size={32} color={palette.makeGreen} />}
            attract
            attractDelayMs={150}
            onPress={() => nav.push('/locker')}
          />
          <MenuButton
            variant="tile"
            style={styles.tile}
            label="ARCADE"
            color={palette.flame}
            icon={<JoystickIcon size={32} color={palette.flame} />}
            attract
            attractDelayMs={300}
            onPress={() => nav.push('/arcade')}
          />
        </View>
        <MenuButton
          variant="wide"
          label="ROSTER"
          color={palette.steelBlue}
          icon={<RecruitIcon size={22} color={palette.steelBlue} />}
          onPress={() => nav.push('/roster')}
        />
        <MenuButton
          variant="wide"
          label="COACHES"
          color={palette.chrome}
          icon={<WhistleIcon size={22} color={palette.chrome} />}
          onPress={() => nav.push('/coaches')}
        />
        <View style={styles.smallRow}>
          <MenuButton
            variant="small"
            style={styles.smallBtn}
            label="HALL OF FAME"
            color={palette.gold}
            icon={<CrownIcon size={16} color={palette.gold} />}
            onPress={() => nav.push('/hall-of-fame')}
          />
          <MenuButton
            variant="small"
            style={styles.smallBtn}
            label="SETTINGS"
            color={palette.inkDim}
            icon={<GearIcon size={16} color={palette.inkDim} />}
            onPress={() => nav.push('/settings')}
          />
          <MenuButton
            variant="small"
            style={styles.smallBtn}
            label="HOW TO PLAY"
            color={palette.inkDim}
            icon={<HelpIcon size={16} color={palette.inkDim} />}
            onPress={() => router.push('/modal')}
          />
        </View>
      </View>

      <Text style={styles.tagline}>Auto-sim 5-on-5. Your team compounds.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Top-aligned and centered so nothing overflows a short phone viewport; grows
  // downward and scrolls when it does not all fit.
  container: {
    alignItems: 'center',
    paddingTop: space(4),
    paddingHorizontal: space(4),
  },
  titleBlock: {
    alignItems: 'center',
    marginBottom: space(2),
  },
  title: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h2,
    color: palette.ink,
    letterSpacing: 2,
    lineHeight: FONT_SIZE.h2 + 8,
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
    marginTop: space(2),
    letterSpacing: 1,
  },
  coinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    marginTop: space(3),
  },
  coinText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.label,
    color: palette.gold,
  },
  selectBox: {
    alignItems: 'center',
    marginTop: space(3),
    maxWidth: 320,
  },
  selectLabel: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
    marginTop: space(3),
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
  chipActive: { borderColor: palette.gold, backgroundColor: palette.gold + '1A' },
  chipText: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, color: palette.inkDim },
  chipTextActive: { color: palette.gold },
  selectBlurb: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(2),
    maxWidth: 260,
  },
  classChip: {
    minWidth: 40,
    alignItems: 'center',
    paddingHorizontal: space(2.5),
    paddingVertical: space(1.5),
    borderWidth: BORDER.chunk,
    borderRadius: RADIUS.chip,
  },
  classChipText: { fontFamily: FONT.display, fontSize: FONT_SIZE.small },
  chipLocked: { opacity: 0.4, borderColor: palette.inkDim },
  coachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    paddingHorizontal: space(3),
    paddingVertical: space(1.5),
    borderWidth: BORDER.thin,
    borderColor: palette.chrome + '66',
    borderRadius: RADIUS.chip,
    backgroundColor: palette.chrome + '12',
    maxWidth: 280,
  },
  coachName: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, flexShrink: 1 },
  coachChange: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, color: palette.inkDim },
  menu: {
    width: '100%',
    maxWidth: 360,
    marginTop: space(4),
    gap: space(3),
  },
  tileRow: {
    flexDirection: 'row',
    gap: space(3),
  },
  tile: { flex: 1 },
  smallRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space(2),
  },
  smallBtn: { flex: 1, minWidth: 90 },
  tagline: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
    marginTop: space(5),
    marginBottom: space(4),
    letterSpacing: 1,
  },
});
