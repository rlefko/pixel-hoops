/**
 * The chiptune SFX catalog: one declarative `Recipe` per sound. This is the single
 * source of truth shared by the generator script (which bakes each recipe to a .wav)
 * and the unit tests. The runtime reads only the generated manifest, never this file.
 *
 * Loudness is tiered through each recipe's `gain`: routine in-game blips stay quiet so
 * the watch never fatigues, while the big stings (win, championship, legendary reward)
 * push to full scale. `pool` is the round-robin player count the runtime allocates:
 * 2 for sounds that can rapid-retrigger (makes, taps), 1 for one-shot stings.
 */

import type { Recipe } from './synth';

// Equal-tempered reference pitches (Hz) used across the recipes, for readability.
const C4 = 262;
const E4 = 330;
const G4 = 392;
const A4 = 440;
const C5 = 523;
const E5 = 659;
const G5 = 784;
const A5 = 880;
const B5 = 988;
const C6 = 1046;
const D6 = 1175;
const E6 = 1318;
const G6 = 1568;
const C7 = 2093;

export const RECIPES = {
  // --- In-game outcomes (routine plays quiet, peaks loud) ---
  make: {
    pool: 2,
    gain: 0.45,
    voices: [
      { osc: 'triangle', freq: A5, freqTo: E5, sweep: 'exp', durMs: 90, env: { decayMs: 72, sustain: 0, releaseMs: 18 } },
      { osc: 'noise', freq: 6000, durMs: 70, gain: 0.22, crushBits: 4, env: { decayMs: 64, sustain: 0 }, noiseSeed: 11 },
    ],
  },
  three: {
    pool: 2,
    gain: 0.55,
    voices: [
      { osc: 'triangle', freq: C6, freqTo: G5, sweep: 'exp', durMs: 120, env: { decayMs: 104, sustain: 0 } },
      {
        osc: 'square', duty: 0.125, freq: C6, durMs: 150, delayMs: 40, gain: 0.4,
        arp: { steps: [0, 12], stepMs: 45 }, filter: { baseHz: 1400, peakHz: 4000, q: 0.7, sustain: 1 },
        env: { decayMs: 118, sustain: 0.2, releaseMs: 28 },
      },
    ],
  },
  dunk: {
    pool: 2,
    gain: 0.78,
    voices: [
      { osc: 'square', duty: 0.5, freq: 180, freqTo: 70, sweep: 'exp', durMs: 160, crushBits: 5, drive: 1.3, env: { decayMs: 140, sustain: 0, releaseMs: 20 } },
      // The impact noise is darkened with a low-pass so the slam keeps its thud without the ice-pick top.
      { osc: 'noise', freq: 2600, durMs: 120, delayMs: 10, gain: 0.42, filter: { baseHz: 600, peakHz: 2200, q: 0.8, decayMs: 110, sustain: 0 }, env: { decayMs: 112, sustain: 0 }, noiseSeed: 23 },
    ],
  },
  andOne: {
    pool: 1,
    gain: 0.6,
    voices: [
      { osc: 'triangle', freq: B5, freqTo: 740, sweep: 'exp', durMs: 110, env: { decayMs: 96, sustain: 0 } },
      // Whistle blip pulled down and slowed so it reads as a chirp, not a piercing buzz.
      {
        osc: 'square', duty: 0.25, freq: 1600, freqTo: 1900, durMs: 90, delayMs: 70, gain: 0.32,
        vibrato: { semitones: 0.4, rateHz: 16 }, filter: { baseHz: 1200, peakHz: 2400, q: 0.7, sustain: 1 },
        env: { attackMs: 8, decayMs: 70, sustain: 0.3, releaseMs: 10 },
      },
    ],
  },
  block: {
    pool: 1,
    gain: 0.62,
    voices: [
      // Darker, less hissy swat: lower noise clock + a low-pass, so it thuds instead of spitting.
      { osc: 'noise', freq: 1100, durMs: 90, gain: 0.6, filter: { baseHz: 500, peakHz: 1800, q: 0.8, decayMs: 82, sustain: 0 }, env: { decayMs: 82, sustain: 0 }, noiseSeed: 7 },
      { osc: 'square', duty: 0.5, freq: 120, freqTo: 60, sweep: 'exp', durMs: 170, delayMs: 20, crushBits: 4, drive: 1.2, env: { decayMs: 158, sustain: 0 } },
    ],
  },
  steal: {
    pool: 1,
    gain: 0.6,
    voices: [
      { osc: 'square', duty: 0.25, freq: 700, freqTo: 1600, sweep: 'exp', durMs: 80, env: { attackMs: 5, decayMs: 72, sustain: 0 } },
    ],
  },
  miss: {
    pool: 1,
    gain: 0.25,
    voices: [
      { osc: 'square', duty: 0.5, freq: 240, freqTo: 180, sweep: 'exp', durMs: 70, crushBits: 4, env: { decayMs: 62, sustain: 0 } },
    ],
  },

  // --- Run-flow beats ---
  tipoff: {
    pool: 1,
    gain: 0.6,
    voices: [
      // Whistle dropped to A6 and low-passed, with a gentler vibrato, so it calls without shrieking.
      { osc: 'square', duty: 0.25, freq: 1760, durMs: 240, vibrato: { semitones: 0.35, rateHz: 14 }, filter: { baseHz: 1400, peakHz: 2800, q: 0.7, sustain: 1 }, env: { attackMs: 15, sustain: 1, releaseMs: 70 } },
      { osc: 'noise', freq: 900, durMs: 320, gain: 0.24, srReduce: 4, filter: { baseHz: 500, peakHz: 2200, q: 0.7, sustain: 1 }, env: { attackMs: 220, sustain: 1, releaseMs: 100 }, noiseSeed: 31 },
    ],
  },
  buzzerBeater: {
    pool: 1,
    gain: 0.85,
    voices: [
      // Warm the rising saw fanfare with a low-pass instead of letting it buzz.
      { osc: 'sawtooth', freq: C5, durMs: 420, arp: { steps: [0, 4, 7, 12], stepMs: 55 }, gain: 0.55, filter: { baseHz: 800, peakHz: 4200, q: 0.8, attackMs: 30, sustain: 1, releaseMs: 120 }, env: { sustain: 1, releaseMs: 120 } },
      { osc: 'triangle', freq: C4, freqTo: G4, sweep: 'linear', durMs: 420, gain: 0.7, env: { attackMs: 10, sustain: 1, releaseMs: 150 } },
      { osc: 'square', duty: 0.5, freq: C6, durMs: 200, delayMs: 360, gain: 0.45, filter: { baseHz: 1200, peakHz: 3600, q: 0.7, sustain: 1 }, env: { decayMs: 180, sustain: 0 } },
    ],
  },
  win: {
    // Fires after EVERY won game, so it is a SHORT, soft, warm two-note "advance" cue
    // (a rising fifth on an FM electric piano), not a jingle. The grand celebration is
    // reserved for the championship (sfx.champion). Pitch-jittered per win in audio.ts.
    pool: 1,
    gain: 0.42,
    voices: [
      { osc: 'fm', fm: { ratio: 1, index: 2, indexDecayMs: 120, indexSustain: 0.05 }, freq: C5, durMs: 150, filter: { baseHz: 700, peakHz: 3200, q: 0.7, decayMs: 130, sustain: 0.2 }, env: { attackMs: 4, decayMs: 130, sustain: 0.2, releaseMs: 60 } },
      { osc: 'fm', fm: { ratio: 1, index: 2, indexDecayMs: 120, indexSustain: 0.05 }, freq: G5, durMs: 220, delayMs: 120, filter: { baseHz: 800, peakHz: 3600, q: 0.7, decayMs: 190, sustain: 0.2 }, env: { attackMs: 4, decayMs: 190, sustain: 0.2, releaseMs: 80 } },
      { osc: 'sine', freq: C4, durMs: 300, gain: 0.5, env: { attackMs: 6, decayMs: 240, sustain: 0.2, releaseMs: 60 } },
    ],
  },
  loss: {
    // Run-ending only (rare): a gentle low-passed descending sigh, no crush/harshness.
    pool: 1,
    gain: 0.6,
    voices: [
      { osc: 'triangle', freq: A4, freqTo: 220, sweep: 'exp', durMs: 620, filter: { baseHz: 500, peakHz: 1600, q: 0.6, sustain: 1 }, env: { attackMs: 10, sustain: 0.8, releaseMs: 320 } },
      { osc: 'sine', freq: 110, durMs: 620, gain: 0.4, env: { attackMs: 10, sustain: 0.6, releaseMs: 320 } },
    ],
  },
  champion: {
    pool: 1,
    gain: 0.88,
    voices: [
      { osc: 'square', duty: 0.5, freq: C5, durMs: 720, arp: { steps: [0, 4, 7, 12, 7, 4], stepMs: 70 }, gain: 0.45, filter: { baseHz: 900, peakHz: 4000, q: 0.7, sustain: 1 }, env: { sustain: 1, releaseMs: 150 } },
      { osc: 'sawtooth', freq: G4, durMs: 720, arp: { steps: [0, 3, 7], stepMs: 140 }, gain: 0.32, filter: { baseHz: 700, peakHz: 3600, q: 0.8, sustain: 1 }, env: { attackMs: 20, sustain: 1, releaseMs: 200 } },
      { osc: 'triangle', freq: 131, freqTo: C4, sweep: 'linear', durMs: 720, gain: 0.6, env: { attackMs: 20, sustain: 1, releaseMs: 200 } },
      // The sparkle cascade kept, but low-passed so it shimmers rather than pierces.
      { osc: 'square', duty: 0.125, freq: G6, durMs: 260, delayMs: 460, gain: 0.34, arp: { steps: [0, 12], stepMs: 50 }, filter: { baseHz: 1800, peakHz: 5000, q: 0.7, sustain: 1 }, env: { decayMs: 220, sustain: 0 } },
    ],
  },

  // --- Reward stings, tiered by rarity (fired through useRewardBurst) ---
  rewardRare: {
    pool: 1,
    gain: 0.7,
    voices: [
      { osc: 'square', duty: 0.25, freq: E5, durMs: 90, env: { decayMs: 70, sustain: 0.2, releaseMs: 18 } },
      { osc: 'square', duty: 0.25, freq: B5, durMs: 160, delayMs: 80, env: { decayMs: 130, sustain: 0.2, releaseMs: 28 } },
    ],
  },
  rewardEpic: {
    pool: 1,
    gain: 0.8,
    voices: [
      { osc: 'square', duty: 0.25, freq: E5, durMs: 80, env: { decayMs: 60, sustain: 0.2, releaseMs: 18 } },
      { osc: 'square', duty: 0.25, freq: A5, durMs: 80, delayMs: 80, env: { decayMs: 60, sustain: 0.2, releaseMs: 18 } },
      { osc: 'square', duty: 0.25, freq: E6, durMs: 180, delayMs: 160, env: { decayMs: 150, sustain: 0.2, releaseMs: 28 } },
      { osc: 'triangle', freq: E4, durMs: 340, gain: 0.4, env: { sustain: 0.7, releaseMs: 120 } },
    ],
  },
  rewardLegendary: {
    pool: 1,
    gain: 0.9,
    voices: [
      { osc: 'square', duty: 0.25, freq: C5, durMs: 80, env: { decayMs: 60, sustain: 0.3, releaseMs: 18 } },
      { osc: 'square', duty: 0.25, freq: E5, durMs: 80, delayMs: 80, env: { decayMs: 60, sustain: 0.3, releaseMs: 18 } },
      { osc: 'square', duty: 0.25, freq: G5, durMs: 80, delayMs: 160, env: { decayMs: 60, sustain: 0.3, releaseMs: 18 } },
      { osc: 'square', duty: 0.25, freq: C6, durMs: 230, delayMs: 240, env: { decayMs: 196, sustain: 0.3, releaseMs: 30 } },
      // The high C7 finale low-passed so the cascade glitters without an ice-pick top.
      { osc: 'square', duty: 0.125, freq: C7, durMs: 220, delayMs: 360, gain: 0.34, arp: { steps: [0, 7, 12], stepMs: 40 }, filter: { baseHz: 2200, peakHz: 6000, q: 0.7, sustain: 1 }, env: { decayMs: 200, sustain: 0 } },
      { osc: 'triangle', freq: C4, durMs: 600, gain: 0.5, env: { sustain: 0.8, releaseMs: 180 } },
    ],
  },

  // --- Gacha / recruiting ---
  gachaWindup: {
    pool: 1,
    gain: 0.6,
    voices: [
      {
        osc: 'sawtooth', freq: 200, freqTo: 600, sweep: 'exp', durMs: 360, srReduce: 2,
        vibrato: { semitones: 0.8, rateHz: 18 }, env: { attackMs: 30, sustain: 1, releaseMs: 60 },
      },
    ],
  },
  recruit: {
    pool: 1,
    gain: 0.7,
    voices: [
      { osc: 'square', duty: 0.25, freq: G5, durMs: 90, env: { decayMs: 70, sustain: 0.3, releaseMs: 18 } },
      { osc: 'square', duty: 0.25, freq: D6, durMs: 150, delayMs: 80, env: { decayMs: 120, sustain: 0.3, releaseMs: 28 } },
    ],
  },
  dupe: {
    pool: 1,
    gain: 0.45,
    voices: [
      { osc: 'triangle', freq: 600, freqTo: 400, sweep: 'exp', durMs: 140, crushBits: 4, env: { decayMs: 120, sustain: 0, releaseMs: 18 } },
    ],
  },

  // --- UI (gentle, low-passed sine/triangle ticks: these fire on every tap) ---
  tapPrimary: {
    pool: 2,
    gain: 0.34,
    voices: [
      { osc: 'triangle', freq: A5, durMs: 70, filter: { baseHz: 1400, peakHz: 2600, q: 0.7, decayMs: 60, sustain: 0 }, env: { attackMs: 2, decayMs: 58, sustain: 0, releaseMs: 8 } },
    ],
  },
  tapSecondary: {
    pool: 2,
    gain: 0.26,
    voices: [
      { osc: 'triangle', freq: E5, durMs: 55, filter: { baseHz: 1100, peakHz: 2000, q: 0.7, decayMs: 48, sustain: 0 }, env: { attackMs: 2, decayMs: 46, sustain: 0, releaseMs: 6 } },
    ],
  },
  toggle: {
    pool: 1,
    gain: 0.3,
    voices: [
      { osc: 'sine', freq: A5, durMs: 48, filter: { baseHz: 1600, peakHz: 2600, q: 0.7, decayMs: 42, sustain: 0 }, env: { attackMs: 2, decayMs: 42, sustain: 0, releaseMs: 4 } },
    ],
  },
  whoosh: {
    // Fires on EVERY navigation, so it is a soft, dark, low-passed swish, not a bright
    // noise sweep. Quiet and short so clicking into menus never grates.
    pool: 1,
    gain: 0.28,
    voices: [
      { osc: 'noise', freq: 700, freqTo: 1400, sweep: 'exp', durMs: 150, gain: 0.45, filter: { baseHz: 400, peakHz: 1200, q: 0.6, sustain: 1 }, env: { attackMs: 30, sustain: 1, releaseMs: 90 }, noiseSeed: 41 },
      { osc: 'triangle', freq: 260, freqTo: 480, sweep: 'exp', durMs: 150, gain: 0.5, env: { attackMs: 20, sustain: 1, releaseMs: 90 } },
    ],
  },
  whooshBack: {
    pool: 1,
    gain: 0.26,
    voices: [
      { osc: 'noise', freq: 1400, freqTo: 700, sweep: 'exp', durMs: 140, gain: 0.45, filter: { baseHz: 400, peakHz: 1200, q: 0.6, sustain: 1 }, env: { attackMs: 20, sustain: 1, releaseMs: 90 }, noiseSeed: 43 },
      { osc: 'triangle', freq: 480, freqTo: 260, sweep: 'exp', durMs: 140, gain: 0.5, env: { attackMs: 10, sustain: 1, releaseMs: 90 } },
    ],
  },
  error: {
    pool: 1,
    gain: 0.6,
    voices: [
      { osc: 'square', duty: 0.5, freq: 160, durMs: 80, crushBits: 4, env: { decayMs: 72, sustain: 0 } },
      { osc: 'square', duty: 0.5, freq: 160, durMs: 80, delayMs: 110, crushBits: 4, env: { decayMs: 72, sustain: 0 } },
    ],
  },
} satisfies Record<string, Recipe>;

export type SfxName = keyof typeof RECIPES;
