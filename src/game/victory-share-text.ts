import { teamByName } from '@/data/nba';
import { DIFFICULTY_LABELS } from './difficulty-mode';
import { victoryTier } from './victory-tier';
import type { HallOfFameEntry } from './hall-of-fame';

/**
 * Building the championship "flex": short, emoji-as-data, and spoiler-free, so it
 * reads well pasted into any chat (the Wordle-grid effect). Kept React-Native-free
 * (the native share sheet lives in share.ts) so the format stays unit-testable.
 * The tier flourish scales with the win (sparkles are reserved for legends), and
 * the same builder feeds both the victory screen and the Hall of Fame card.
 */

/** The shareable victory blurb: a few emoji-rich lines, no link, under a tweet. */
export function buildVictoryShareText(entry: HallOfFameEntry): string {
  const tier = victoryTier(entry.difficulty, entry.ladderClass);
  const flourish = tier.legend
    ? '✨ legends never lose ✨'
    : `${tier.emoji} ${tier.label} champions`;
  return [
    '🏀🏆 PIXEL HOOPS CHAMPIONS!',
    `${DIFFICULTY_LABELS[entry.difficulty].name} · ${entry.ladderClass} ladder`,
    `${entry.finalHome}-${entry.finalAway} @ ${opponentTicker(entry.opponentName)}`,
    mvpLine(entry),
    flourish,
  ]
    .filter(Boolean)
    .join('\n');
}

/** The opponent's three-letter ticker. Championship foes are always NBA teams;
 * any other name (rare) falls back to its uppercased word initials, capped at 3. */
function opponentTicker(name: string): string {
  const team = teamByName(name);
  if (team) return team.abbreviation;
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('');
  return (initials || name).slice(0, 3).toUpperCase();
}

/** The MVP stat line. New entries carry a stored MVP; pre-MVP saves fall back to
 * the first starter's name (no box score was kept), and an empty line is dropped. */
function mvpLine(entry: HallOfFameEntry): string {
  const m = entry.mvp;
  if (m) return `${m.name} · ${m.pts} PTS ${m.reb} REB ${m.ast} AST`;
  return entry.starters[0]?.player.name ?? '';
}
