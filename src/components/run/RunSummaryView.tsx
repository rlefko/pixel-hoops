import { StyleSheet, Pressable } from 'react-native';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { Pop, LiveChip } from '@/components/fx';
import { useIdle, HUB_IDLE_MS } from '@/feel';
import {
  DIFFICULTY_LABELS,
  type Difficulty,
  type LadderClass,
} from '@/game/difficulty-mode';
import type { PlayerClass } from '@/game/ratings';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/** End-of-run summary. Coins were banked into the wallet as they were earned; a clear
 * also carries recruits home and advances the ladder. */

interface RunSummaryViewProps {
  champion: boolean;
  wins: number;
  difficulty: Difficulty;
  ladderClass: LadderClass;
  /** The newly unlocked ladder class (shown as a reward when present). */
  unlockedClass?: PlayerClass;
  onNewRun: () => void;
  onMenu: () => void;
}

export function RunSummaryView({
  champion,
  wins,
  difficulty,
  ladderClass,
  unlockedClass,
  onNewRun,
  onMenu,
}: RunSummaryViewProps) {
  // Quiet the unlock banner's reward glow once the player settles on this terminal
  // screen; the next touch wakes it. Mirrors the hub/run-map idle-pause.
  const { idle, bump } = useIdle(HUB_IDLE_MS);
  return (
    <Screen style={styles.container} onTouchStart={bump}>
      <Pop popOnMount>
        <Text
          style={[
            styles.title,
            { color: champion ? palette.gold : palette.ink },
          ]}
        >
          {champion ? 'CHAMPIONS!' : 'RUN OVER'}
        </Text>
      </Pop>
      <Text style={styles.body}>
        {DIFFICULTY_LABELS[difficulty].name} · {ladderClass} ladder · {wins}{' '}
        {wins === 1 ? 'win' : 'wins'}
      </Text>
      {unlockedClass ? (
        <LiveChip
          active
          color={palette.orange}
          paused={idle}
          style={styles.unlockWrap}
        >
          <Text style={styles.unlock}>{unlockedClass} LADDER UNLOCKED</Text>
        </LiveChip>
      ) : null}
      <Text style={[styles.note, !champion && styles.noteLost]}>
        {champion
          ? 'Recruits carried home.'
          : 'Run recruits lost. Your coins are safe.'}
      </Text>
      <Pressable style={[styles.button, styles.primary]} onPress={onNewRun}>
        <Text style={styles.buttonText}>NEW RUN</Text>
      </Pressable>
      <Pressable onPress={onMenu}>
        <Text style={styles.menu}>Menu</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(6),
  },
  title: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h1,
    textAlign: 'center',
  },
  body: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.label,
    color: palette.inkDim,
    marginTop: space(4),
  },
  unlockWrap: { marginTop: space(3) },
  unlock: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
    color: palette.orange,
    textAlign: 'center',
  },
  note: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.makeGreenLt,
    marginTop: space(2),
    textAlign: 'center',
  },
  noteLost: { color: palette.missRedLt },
  button: {
    marginTop: space(7),
    paddingVertical: space(4),
    paddingHorizontal: space(6),
    borderWidth: BORDER.chunk,
    borderColor: palette.gold,
    borderRadius: RADIUS.chip,
  },
  primary: { backgroundColor: palette.gold + '1A' },
  buttonText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.label,
    color: palette.gold,
  },
  menu: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(5),
  },
});
