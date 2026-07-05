import { POSITIONS } from '@/types/roster';
import type { PlayerStats } from '@/types/player';
import type { MotionTeam } from './types';
import type { Pace } from '@/types/tactics';

/** Small team-composite helpers shared by the sampler and the defense chooser. */

/** Mean of a rating across a team's five. */
export function meanStat(team: MotionTeam, key: keyof PlayerStats): number {
  let sum = 0;
  for (const p of POSITIONS) sum += team.five[p].stats[key];
  return sum / POSITIONS.length;
}

/** Normalize a 6..20 rating to 0..1 (elite saturates at 1). */
export function norm01(v: number): number {
  return Math.max(0, Math.min(1, (v - 6) / 14));
}

/** Resolve a team's tempo, folding the coach preference over roster athleticism. */
export function resolvedPace(team: MotionTeam): Pace {
  if (team.coach.prefPace !== 'auto') return team.coach.prefPace;
  const athl = norm01(meanStat(team, 'athleticism'));
  return athl > 0.6 ? 'fast' : athl < 0.35 ? 'slow' : 'balanced';
}
