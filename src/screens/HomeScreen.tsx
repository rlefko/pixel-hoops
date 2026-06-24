import { StyleSheet, View, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { CoinIcon } from '@/components/run/PixelIcons';
import { FreeAgentRevealView } from '@/components/run/FreeAgentRevealView';
import { CLASS_COLOR } from '@/components/run/class-ui';
import { useHomeRoster } from '@/context/HomeRosterContext';
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  LADDER_CLASSES,
  unlockedClasses,
  type Difficulty,
  type LadderClass,
} from '@/game/difficulty-mode';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/** Main menu screen — entry point for the game. */
export default function HomeScreen() {
  const router = useRouter();
  const { homeRoster, loaded, saveHomeRoster } = useHomeRoster();

  // First launch: welcome the player with their five real free agents, once.
  if (loaded && homeRoster && !homeRoster.seenWelcome) {
    return (
      <FreeAgentRevealView
        players={homeRoster.players}
        onContinue={() => saveHomeRoster({ ...homeRoster, seenWelcome: true })}
      />
    );
  }

  const unlocked = homeRoster ? unlockedClasses(homeRoster.ladderProgress[homeRoster.selectedDifficulty]) : [];

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
    <Screen style={styles.container}>
      <View style={styles.titleBlock}>
        <Text style={styles.title}>PIXEL</Text>
        <Text style={[styles.title, styles.highlight]}>HOOPS</Text>
        <Text style={styles.subtitle}>8-Bit Basketball Roguelike</Text>
      </View>

      {loaded && homeRoster ? (
        <View style={styles.coinRow}>
          <CoinIcon size={14} color={palette.gold} />
          <Text style={styles.coinText}>{homeRoster.coins}</Text>
        </View>
      ) : null}

      {loaded && homeRoster ? (
        <View style={styles.selectBox}>
          <Text style={styles.selectLabel}>DIFFICULTY</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
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
          </ScrollView>
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
        </View>
      ) : null}

      <View style={styles.buttonContainer}>
        <Pressable
          style={[styles.button, styles.primaryButton]}
          onPress={() => router.push('/run')}
        >
          <Text style={styles.primaryText}>NEW RUN</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={() => router.push('/roster')}>
          <Text style={styles.secondaryText}>Roster</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={() => router.push('/arcade')}>
          <Text style={styles.secondaryText}>Arcade</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={() => router.push('/locker')}>
          <Text style={styles.secondaryText}>Locker Room</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={() => router.push('/settings')}>
          <Text style={styles.secondaryText}>Settings</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={() => router.push('/modal')}>
          <Text style={styles.secondaryText}>How to Play</Text>
        </Pressable>
      </View>

      <Text style={styles.tagline}>Auto-sim 5-on-5. Your team compounds.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
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
    marginTop: space(6),
  },
  coinText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.label,
    color: palette.gold,
  },
  selectBox: {
    alignItems: 'center',
    marginTop: space(5),
    maxWidth: 300,
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
  buttonContainer: {
    marginTop: space(6),
    alignItems: 'center',
  },
  button: {
    paddingVertical: space(3),
    paddingHorizontal: space(8),
    marginTop: space(3),
    alignItems: 'center',
  },
  primaryButton: {
    borderRadius: RADIUS.chip,
    borderWidth: BORDER.chunk,
    borderColor: palette.gold,
    backgroundColor: palette.gold + '1A',
  },
  primaryText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
    color: palette.gold,
  },
  secondaryText: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.label,
    color: palette.inkDim,
    letterSpacing: 1,
  },
  tagline: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
    marginTop: space(12),
    letterSpacing: 1,
  },
});
