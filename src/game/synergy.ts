import type { RosterPlayer, Position } from '@/types/roster';
import type { SynergyResult } from '@/types/team';

/**
 * Synergy is the reward for thoughtful roster construction: it reads the
 * positions on the floor and grants bonuses. Pure and deterministic from the
 * lineup, computed once at game start. The rules are intentionally small here
 * and meant to grow (see docs/roadmap.md).
 */

const GUARDS: readonly Position[] = ['PG', 'SG'];
const BIGS: readonly Position[] = ['PF', 'C'];

export function computeSynergy(lineup: RosterPlayer[]): SynergyResult {
  const result: SynergyResult = {
    paceBonus: 0,
    clutchBonus: 0,
    defenseBonus: 0,
    offenseBonus: 0,
    labels: [],
  };

  const counts = new Map<Position, number>();
  for (const rp of lineup) {
    counts.set(rp.position, (counts.get(rp.position) ?? 0) + 1);
  }

  const guardCount = GUARDS.reduce((sum, p) => sum + (counts.get(p) ?? 0), 0);
  const bigCount = BIGS.reduce((sum, p) => sum + (counts.get(p) ?? 0), 0);
  const distinctPositions = counts.size;
  const maxAtOnePosition = Math.max(...counts.values());

  // Backcourt Speed: two or more guards push the pace.
  if (guardCount >= 2) {
    result.paceBonus += 3;
    result.labels.push('Backcourt Speed');
  }

  // Twin Towers: two or more bigs anchor the paint.
  if (bigCount >= 2) {
    result.defenseBonus += 3;
    result.labels.push('Twin Towers');
  }

  // Positionless Basketball: a balanced one-of-each five plays clutch.
  if (distinctPositions === 5) {
    result.clutchBonus += 2;
    result.offenseBonus += 1;
    result.labels.push('Positionless Basketball');
  }

  // Specialists: stacking one position concentrates the attack.
  if (maxAtOnePosition >= 3) {
    result.offenseBonus += 2;
    result.labels.push('Specialists');
  }

  return result;
}
