import { describe, it, expect } from 'vitest';
import { makeProbability } from '@/game/sim-resolution';
import type { OffActionId } from '@/types/sim';

/**
 * The stat scale was widened from the old 3-10 model to a 6-20 normal band as a
 * PURE 2x change of variable, so the sim's relative balance must be byte-identical:
 * makeProbability(2 * oldInputs) has to equal the value the old formula produced
 * for oldInputs. This test embeds the pre-widening formula as the reference, so a
 * missed offset (q's `-3 -> -6` and `/7 -> /14`, or the IQ `-5 -> -10`) diverges
 * and trips the regression. Mirrors the live constants in sim-resolution.ts.
 */

const SHOT_BASE: Record<OffActionId, number> = {
  three: 0.32,
  midrange: 0.4,
  drive: 0.47,
  layup: 0.55,
  dunk: 0.62,
  post: 0.46,
};

/** The pre-widening make probability on the old 3-10 scale (reference). */
function oldMakeProbability(action: OffActionId, off: number, def: number, iq: number): number {
  const qOld = (r: number): number => (r - 3) / 7;
  const iqBonus = Math.max(0, Math.min(0.04, (iq - 5) * 0.008));
  const raw = SHOT_BASE[action] + 0.45 * qOld(off) - 0.3 * qOld(def) + iqBonus;
  return Math.max(0.03, Math.min(0.97, raw));
}

describe('scale widening preserves the shot math', () => {
  it('makeProbability(2x inputs) equals the pre-widening value for every input', () => {
    const actions: OffActionId[] = ['three', 'midrange', 'drive', 'layup', 'dunk'];
    for (const action of actions) {
      for (const off of [3, 5, 7, 9, 10]) {
        for (const def of [3, 6, 8, 10]) {
          for (const iq of [3, 5, 8, 10]) {
            const expected = oldMakeProbability(action, off, def, iq);
            const actual = makeProbability({
              action,
              offRating: 2 * off,
              defRating: 2 * def,
              iq: 2 * iq,
            });
            expect(actual).toBeCloseTo(expected, 9);
          }
        }
      }
    }
  });

  it('fatigue scales the result the same way at the doubled scale', () => {
    const expected = oldMakeProbability('layup', 8, 6, 7) * 0.85;
    const actual = makeProbability({
      action: 'layup',
      offRating: 16,
      defRating: 12,
      iq: 14,
      fatigueMult: 0.85,
    });
    expect(actual).toBeCloseTo(expected, 9);
  });
});
