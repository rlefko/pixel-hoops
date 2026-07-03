import { LOSS_NUDGE_STREAK, lossStreakAt, type TeachLedger } from './teach';
import { resolveDraftRotation } from './home-roster';
import type { Difficulty, LadderClass } from './difficulty-mode';
import { POSITIONS, type Position } from '@/types/roster';

/**
 * The draft's adaptive strategy nudge: after LOSS_NUDGE_STREAK consecutive
 * losses at one (difficulty, ladder class) cell, the next draft at that cell
 * opens with ONE coach line that reads the shape of the team the player keeps
 * bringing and suggests a different one. Strategy-forward, never blaming: the
 * line critiques the lineup shape, not the player. Pure module, no React;
 * DraftView calls lossNudgeLine once at mount.
 */

/** The five readable shapes of a starting five, from its position mix. */
export type LineupShape = 'guardHeavy' | 'bigHeavy' | 'stacked' | 'balanced' | 'default';

/** One coach line per shape. Each points AT a concrete counter-move, so the
 * nudge always hands the player a plan, not just a diagnosis. */
export const LOSS_NUDGE_LINES: Record<LineupShape, string> = {
  guardHeavy: 'Fast five, thin paint. A true big changes the math inside.',
  bigHeavy: 'Slow feet get run off the floor. Guards push the pace back.',
  stacked: 'Three of a kind sharpens the attack and the weakness. Spread the floor.',
  balanced: 'Balanced five, no edge. Commit to a shape: run them off the floor, or wall up.',
  default: 'Same wall, new plan. Bank your points on two anchors and go again.',
};

const POSITION_SET = new Set<string>(POSITIONS);

/** Position parsed from a playerKey, or null for a key that cannot be read.
 * Keys are nameKey's `name|POS`; parsing from the LAST separator keeps a name
 * containing the separator from shifting the position segment. */
function positionOf(playerKey: string): Position | null {
  const sep = playerKey.lastIndexOf('|');
  if (sep < 0) return null;
  const pos = playerKey.slice(sep + 1);
  return POSITION_SET.has(pos) ? (pos as Position) : null;
}

/**
 * Classify the FIRST FIVE playerKeys of a remembered rotation (slots 0-4 are
 * the PG..C starters; the bench never shapes the read). Guards are PG/SG,
 * bigs are PF/C. Priority order matters: three at one exact position is a
 * sharper (and rarer) signal than three guards or three bigs, so 'stacked'
 * wins before the heavy reads. Any unreadable key drops out of the count, and
 * fewer than five readable starters means the shape cannot be trusted.
 */
export function classifyRotationShape(rotation: readonly string[]): LineupShape {
  const counts = new Map<Position, number>();
  let readable = 0;
  for (const key of rotation.slice(0, 5)) {
    const pos = positionOf(key);
    if (!pos) continue;
    readable += 1;
    counts.set(pos, (counts.get(pos) ?? 0) + 1);
  }
  if (readable < 5) return 'default';
  if (Math.max(...counts.values()) >= 3) return 'stacked';
  const guards = (counts.get('PG') ?? 0) + (counts.get('SG') ?? 0);
  if (guards >= 3) return 'guardHeavy';
  const bigs = (counts.get('PF') ?? 0) + (counts.get('C') ?? 0);
  if (bigs >= 3) return 'bigHeavy';
  if (counts.size === 5) return 'balanced';
  return 'default';
}

/**
 * The one COACH strategy line for the next draft at (difficulty, ladderClass),
 * or null when the streak is not live there (count < LOSS_NUDGE_STREAK, the
 * streak lives on another cell, or the ledger is absent). The rotation read IS
 * resolveDraftRotation, the exact rule the draft pre-fills by, so the nudge can
 * never critique a five the player is not about to see; a rotation that cannot
 * be read still shows the 'default' line, since the streak is real even when
 * the shape is not.
 */
export function lossNudgeLine(
  teach: TeachLedger | undefined,
  rosterMemory: Record<Difficulty, Partial<Record<LadderClass, string[]>>>,
  difficulty: Difficulty,
  ladderClass: LadderClass
): string | null {
  if (lossStreakAt(teach, difficulty, ladderClass) < LOSS_NUDGE_STREAK) return null;
  const rotation = resolveDraftRotation({ rosterMemory }, difficulty, ladderClass);
  return LOSS_NUDGE_LINES[rotation ? classifyRotationShape(rotation) : 'default'];
}
