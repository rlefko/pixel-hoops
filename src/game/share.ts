import { Platform, Share } from 'react-native';
import { DIFFICULTY_LABELS } from './difficulty-mode';
import { victoryTier } from './victory-tier';
import type { HallOfFameEntry } from './hall-of-fame';

/**
 * Sharing a championship. The text is the "flex": short, emoji-as-data, and
 * spoiler-free, so it reads well pasted into any chat (the Wordle-grid effect).
 * The tier flourish scales with the win (sparkles are reserved for legends), and
 * the same builder feeds both the victory screen and the Hall of Fame card.
 */

/** The shareable victory blurb: a few emoji-rich lines, no link, under a tweet. */
export function buildVictoryShareText(entry: HallOfFameEntry): string {
  const tier = victoryTier(entry.difficulty, entry.ladderClass);
  const five = entry.starters.map((rp) => `${rp.position} ${rp.player.name}`).join(' · ');
  const flourish = tier.legend
    ? '✨ legends never lose ✨'
    : `${tier.emoji} ${tier.label} champions`;
  return [
    '🏀🏆 PIXEL HOOPS CHAMPIONS!',
    `${DIFFICULTY_LABELS[entry.difficulty].name} · ${entry.ladderClass} ladder`,
    `${entry.homeTeamName} ${entry.finalHome} - ${entry.finalAway} ${entry.opponentName}`,
    `👑 ${five}`,
    flourish,
  ].join('\n');
}

/**
 * Open the native share sheet with the victory blurb. Best-effort everywhere: a
 * cancel or an unsupported platform never throws or blocks. On web (no native
 * sheet) it falls back to the Web Share API, then the clipboard, then a no-op.
 */
export async function shareVictory(entry: HallOfFameEntry): Promise<void> {
  const message = buildVictoryShareText(entry);
  if (Platform.OS === 'web') {
    const nav = (globalThis as { navigator?: Navigator }).navigator;
    try {
      if (nav && typeof nav.share === 'function') {
        await nav.share({ text: message });
      } else if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(message);
      }
    } catch {
      // user cancelled or unsupported: sharing is best-effort
    }
    return;
  }
  try {
    await Share.share({ message });
  } catch {
    // user dismissed the sheet: best-effort
  }
}
