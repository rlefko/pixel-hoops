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

describe('the crowd swells stay honest air, under the stings they answer', () => {
  const SWELLS = ['crowdCheer', 'crowdRoar', 'crowdMurmur'] as const;

  it('is pure unpitched noise: no tonal voice can ever sit out of key', () => {
    for (const name of SWELLS) {
      for (const voice of recipes[name].voices) {
        expect(voice.osc).toBe('noise');
        expect(voice.freqTo).toBeUndefined();
      }
    }
  });

  it('swells slowly, unlike every chiptune sting', () => {
    for (const name of SWELLS) {
      expect(recipes[name].voices[0].env?.attackMs ?? 0).toBeGreaterThanOrEqual(80);
    }
  });

  it('mixes well under the event SFX it answers, tiered cheer < roar', () => {
    expect(recipes.crowdCheer.gain).toBeLessThanOrEqual(0.35);
    expect(recipes.crowdRoar.gain).toBeLessThanOrEqual(0.45);
    expect(recipes.crowdMurmur.gain).toBeLessThanOrEqual(0.2);
    expect(recipes.crowdCheer.gain).toBeLessThan(recipes.dunk.gain!);
    expect(recipes.crowdRoar.gain).toBeLessThan(recipes.buzzerBeater.gain!);
  });

  it('stays inside the swell-tier duration bands', () => {
    expect(totalMs('crowdCheer')).toBeLessThanOrEqual(1500);
    expect(totalMs('crowdRoar')).toBeLessThanOrEqual(2500);
    expect(totalMs('crowdMurmur')).toBeLessThanOrEqual(800);
  });
});
