import { describe, it, expect } from 'vitest';
import type { Recipe } from '@/audio/synth';
import { RECIPES } from '@/audio/recipes';

/**
 * Gentleness pins for the sounds that fire the most. The whoosh (every navigation) and
 * win (every won game) recipes were softened after player feedback; these constraints
 * keep a future tweak from quietly re-sharpening them. Catalog-wide render sanity lives
 * in wav.test.ts.
 */

// Widened view: the satisfies-narrowed catalog hides optional Voice fields per entry.
const recipes: Record<string, Recipe> = RECIPES;

function totalMs(name: string): number {
  return Math.max(...recipes[name].voices.map((v) => (v.delayMs ?? 0) + v.durMs));
}

describe('the high-frequency-of-fire sounds stay gentle', () => {
  it('whoosh and whooshBack are felt air: no pitch sweep, short, near-silent', () => {
    for (const name of ['whoosh', 'whooshBack'] as const) {
      for (const voice of recipes[name].voices) {
        expect(voice.freqTo).toBeUndefined();
      }
      expect(totalMs(name)).toBeLessThanOrEqual(260);
      expect(recipes[name].gain).toBeLessThanOrEqual(0.15);
    }
  });

  it('win is a brief, soft grace-note cue', () => {
    expect(totalMs('win')).toBeLessThanOrEqual(220);
    expect(recipes.win.gain).toBeLessThanOrEqual(0.3);
  });
});
