import type { PlayerStats } from '@/types/player';
import type { RosterPlayer } from '@/types/roster';

/**
 * A player's one-line "specialty": the role their ratings most point to, shown
 * under each recruit so a pick reads as a deliberate roster choice (acquire the
 * shot-blocker you lack) rather than a number compare. Pure and dependency-light.
 * The play-style ratings (blocking/stealing/strength/rebounding) make these roles
 * legible, since they are the recruit-only traits a player builds a squad around.
 */

/** A play-style trait at or above this reads as an elite specialist (for pity). */
const SPECIALIST_THRESHOLD = 15;

/** Role label paired with the rating that earns it; the highest rating wins. */
const ROLE_BY_STAT: { label: string; score: (s: PlayerStats) => number }[] = [
  { label: 'Rim Protector', score: (s) => s.blocking },
  { label: 'Glass Cleaner', score: (s) => s.rebounding },
  { label: 'Ball Hawk', score: (s) => s.stealing },
  { label: 'Bruiser', score: (s) => s.strength },
  { label: 'Sharpshooter', score: (s) => s.outside },
  { label: 'Floor General', score: (s) => s.playmaking },
  { label: 'Perimeter Stopper', score: (s) => s.perimeterD },
  { label: 'Interior Anchor', score: (s) => s.interiorD },
  { label: 'Slasher', score: (s) => (s.inside + s.athleticism) / 2 },
];

/** The single role a player's ratings most point to (their standout dimension). */
export function getSpecialty(rp: RosterPlayer): string {
  const s = rp.player.stats;
  let best = ROLE_BY_STAT[0];
  let bestScore = best.score(s);
  for (const role of ROLE_BY_STAT) {
    const value = role.score(s);
    if (value > bestScore) {
      best = role;
      bestScore = value;
    }
  }
  return best.label;
}

/** True when a line has an elite play-style trait (a true specialist). Used by the
 * recruit pity so a player can reliably eventually be offered one. */
export function isSpecialistStats(stats: PlayerStats): boolean {
  return (
    stats.blocking >= SPECIALIST_THRESHOLD ||
    stats.stealing >= SPECIALIST_THRESHOLD ||
    stats.strength >= SPECIALIST_THRESHOLD ||
    stats.rebounding >= SPECIALIST_THRESHOLD
  );
}

/** True when a recruit is a play-style specialist. */
export function isSpecialist(rp: RosterPlayer): boolean {
  return isSpecialistStats(rp.player.stats);
}
