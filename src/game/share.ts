import { Platform, Share } from 'react-native';
import { buildVictoryShareText } from './victory-share-text';
import type { HallOfFameEntry } from './hall-of-fame';

/**
 * Opening the native share sheet for a championship. The blurb itself is built by
 * buildVictoryShareText (kept React-Native-free for testing); this module is just
 * the platform plumbing around it.
 */

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
