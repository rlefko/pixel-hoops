/**
 * The chiptune music catalog: two looping beds compiled by the sequencer (./sequencer)
 * and baked to WAV by scripts/generate-sfx.ts. This is the single source of truth shared
 * by the generator and the unit tests; the runtime plays the baked .wav.
 *
 * Two contexts (see src/feel/music.ts): a calm `menuLoop` for hubs and the run map, and a
 * driving `gameLoop` for the watched game (which also ramps tempo/pitch up toward Q4).
 * Beds are deliberately short and bar-aligned so the loop is seamless and the committed
 * WAVs stay small.
 */

import type { MusicTrack, Note, Part } from './sequencer';

// Equal-tempered roots (Hz).
const C2 = 65;
const C4 = 262;

/**
 * Repeat a one-bar `pattern` across `bars`, transposing bar N by `barSemitones[N]` (a
 * chord progression). Beats are offset into each bar; pitches add the bar's transpose.
 */
function repeatBars(
  bars: number,
  beatsPerBar: number,
  barSemitones: number[],
  pattern: Note[]
): Note[] {
  const out: Note[] = [];
  for (let bar = 0; bar < bars; bar++) {
    const transpose = barSemitones[bar % barSemitones.length];
    for (const note of pattern) {
      out.push({
        ...note,
        beat: note.beat + bar * beatsPerBar,
        semitone: (note.semitone ?? 0) + transpose,
      });
    }
  }
  return out;
}

/** A repeating one-hit-per-step percussion lane (e.g. a hat on every eighth). */
function steps(count: number, spacingBeats: number, note: Omit<Note, 'beat'>): Note[] {
  return Array.from({ length: count }, (_, i) => ({ ...note, beat: i * spacingBeats }));
}

// --- menu/hub bed: calm C-major pentatonic, warm triangles, sparse. 120 BPM, 8 bars (~16s) ---

// I-V-vi-IV (C, G, Am, F), each chord held two bars => transpose every 8 beats.
const MENU_CHORDS = [0, 0, 7, 7, 9, 9, 5, 5];

const menuBass: Part = {
  rootHz: C2,
  voice: { osc: 'triangle', env: { attackMs: 40, decayMs: 240, sustain: 0.6, releaseMs: 480 } },
  gain: 0.6,
  notes: repeatBars(8, 4, MENU_CHORDS, [{ beat: 0, durationBeats: 4, semitone: 0 }]),
};

const menuLead: Part = {
  rootHz: C4,
  voice: {
    osc: 'triangle',
    vibrato: { semitones: 0.12, rateHz: 5 },
    env: { attackMs: 14, decayMs: 140, sustain: 0.4, releaseMs: 260 },
  },
  gain: 0.32,
  // A gentle phrase, chord tones over the progression; last bar leaves space (it rests).
  notes: [
    { beat: 0, durationBeats: 1.5, semitone: 7 },
    { beat: 2, durationBeats: 1, semitone: 9 },
    { beat: 3.5, durationBeats: 2, semitone: 12 },
    { beat: 8, durationBeats: 1.5, semitone: 11 },
    { beat: 10, durationBeats: 2, semitone: 7 },
    { beat: 16, durationBeats: 1.5, semitone: 9 },
    { beat: 18, durationBeats: 1, semitone: 12 },
    { beat: 19.5, durationBeats: 2, semitone: 16 },
    { beat: 24, durationBeats: 2, semitone: 12 },
    { beat: 27, durationBeats: 1.5, semitone: 9 },
  ],
};

const menuHat: Part = {
  rootHz: 7000,
  voice: { osc: 'noise', noiseSeed: 13, crushBits: 4, env: { decayMs: 45, sustain: 0 } },
  gain: 0.08,
  notes: steps(32, 1, { durationBeats: 0.2, semitone: 0 }), // a soft tick on each beat
};

// --- in-game bed: driving C-minor groove, punchy square bass + lead + noise drums. 140 BPM, 4 bars (~6.9s) ---

// i-VI-VII-v (Cm, Ab, Bb, Gm) one chord per bar.
const GAME_CHORDS = [0, 8, 10, 7];

const gameBass: Part = {
  rootHz: C2,
  voice: { osc: 'square', duty: 0.5, crushBits: 6, env: { attackMs: 2, decayMs: 55, sustain: 0.45, releaseMs: 45 } },
  gain: 0.5,
  // One-bar eighth-note groove (root / fifth / octave / b7), transposed per chord.
  notes: repeatBars(4, 4, GAME_CHORDS, [
    { beat: 0, durationBeats: 0.5, semitone: 0 },
    { beat: 0.5, durationBeats: 0.5, semitone: 0 },
    { beat: 1, durationBeats: 0.5, semitone: 7 },
    { beat: 1.5, durationBeats: 0.5, semitone: 0 },
    { beat: 2, durationBeats: 0.5, semitone: 12 },
    { beat: 2.5, durationBeats: 0.5, semitone: 0 },
    { beat: 3, durationBeats: 0.5, semitone: 7 },
    { beat: 3.5, durationBeats: 0.5, semitone: 10 },
  ]),
};

const gameLead: Part = {
  rootHz: C4,
  voice: { osc: 'square', duty: 0.25, env: { attackMs: 3, decayMs: 60, sustain: 0.35, releaseMs: 80 } },
  gain: 0.3,
  // C-minor-pentatonic hook (12,15,10,7 = octave, b3, b7-below... arcade-flavored), per chord.
  notes: repeatBars(4, 4, GAME_CHORDS, [
    { beat: 0, durationBeats: 0.75, semitone: 12 },
    { beat: 1, durationBeats: 0.5, semitone: 15 },
    { beat: 1.75, durationBeats: 0.75, semitone: 12 },
    { beat: 2.5, durationBeats: 0.5, semitone: 19 },
    { beat: 3, durationBeats: 1, semitone: 15 },
  ]),
};

const gameHat: Part = {
  rootHz: 9000,
  voice: { osc: 'noise', noiseSeed: 5, crushBits: 4, env: { decayMs: 28, sustain: 0 } },
  gain: 0.16,
  notes: steps(32, 0.5, { durationBeats: 0.12, semitone: 0 }), // hat on every eighth across 4 bars
};

const gameSnare: Part = {
  rootHz: 2400,
  voice: { osc: 'noise', noiseSeed: 9, crushBits: 3, env: { attackMs: 1, decayMs: 90, sustain: 0 } },
  gain: 0.26,
  // Backbeat on beats 2 and 4 of each of the 4 bars.
  notes: repeatBars(4, 4, [0, 0, 0, 0], [
    { beat: 1, durationBeats: 0.25, semitone: 0 },
    { beat: 3, durationBeats: 0.25, semitone: 0 },
  ]),
};

export const MUSIC_TRACKS = {
  menuLoop: {
    bpm: 120,
    bars: 8,
    beatsPerBar: 4,
    gain: 0.7,
    parts: [menuBass, menuLead, menuHat],
  },
  gameLoop: {
    bpm: 140,
    bars: 4,
    beatsPerBar: 4,
    gain: 0.82,
    parts: [gameBass, gameLead, gameHat, gameSnare],
  },
} satisfies Record<string, MusicTrack>;

export type MusicName = keyof typeof MUSIC_TRACKS;
