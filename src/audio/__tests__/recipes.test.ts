import { describe, it, expect } from 'vitest';
import { renderRecipe, type Recipe } from '@/audio/synth';
import { SAMPLE_RATE } from '@/audio/wav';
import { RECIPES } from '@/audio/recipes';
import { RAPID_CUE_COOLDOWN_MS, RATE_JITTER_MIN } from '@/feel/soundPolicy';

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

describe('pool coverage: a cooldown cue is never re-triggered mid-tail', () => {
  // The runtime plays a resting player from position 0 without a rewind (audio.ts);
  // that is only safe if the round-robin can never hand back a player still audibly
  // mid-shot. For each cooldown-listed cue: rendered duration, stretched by the
  // slowest anti-fatigue jitter rate, must fit inside cooldown x pool. The bake
  // (scripts/generate-sfx.ts) enforces the same invariant, so a violating recipe
  // fails here AND cannot bake.
  it('rendered duration <= cooldown x pool at the slowest jitter rate', () => {
    for (const [name, cooldown] of Object.entries(RAPID_CUE_COOLDOWN_MS)) {
      const recipe = recipes[name];
      expect(recipe, `${name} has a cooldown but no recipe`).toBeDefined();
      const durationMs = (renderRecipe(recipe).length / SAMPLE_RATE) * 1000;
      expect(
        durationMs / RATE_JITTER_MIN,
        `${name}: ${durationMs.toFixed(0)}ms WAV vs cooldown ${cooldown}ms x pool ${recipe.pool}`
      ).toBeLessThanOrEqual(cooldown! * recipe.pool);
    }
  });

  // The cross-source collision pools (see recipes.ts): celebration beats and watch
  // juice share these cues with navigation, so pool 1 would restart them mid-puff.
  it('whoosh, whooshBack, and toggle keep their collision headroom pools', () => {
    expect(recipes.whoosh.pool).toBeGreaterThanOrEqual(2);
    expect(recipes.whooshBack.pool).toBeGreaterThanOrEqual(2);
    expect(recipes.toggle.pool).toBeGreaterThanOrEqual(2);
  });
});
