/**
 * A tiny chiptune step sequencer layered on top of the synth (./synth). It turns a
 * declarative `MusicTrack` (tempo + bars + parts, each an instrument voice plus a note
 * pattern) into one seamless mono loop, by rendering each note as a synth `Voice` and
 * mixing it at its beat offset.
 *
 * Pure: no Node or React Native imports, no global randomness or clock, so a track
 * renders byte-identical every run (the synth's only entropy is an explicit per-voice
 * `noiseSeed`). Used by the generator and unit tests; the app plays the baked .wav.
 *
 * Seamless looping: notes are overlap-added with a modulo wrap, so a note whose release
 * tail runs past the loop end folds back onto the loop start. Combined with bar-aligned
 * length and patterns that decay before the boundary, the wrap point has no
 * discontinuity, so expo-audio's loop has no click.
 */

import { SAMPLE_RATE } from './wav';
import { renderVoice, type Voice } from './synth';

/** One step in a part's pattern. Omit `semitone` (or set `rest`) for silence. */
export interface Note {
  /** Beat index from the loop start; fractional allowed (0 = downbeat of bar 1). */
  beat: number;
  /** Length in beats. The voice's release tail may overhang; the loop wrap folds it back. */
  durationBeats: number;
  /** Pitch as a semitone offset from the part's root. Omit (or set rest) for silence. */
  semitone?: number;
  rest?: boolean;
  /** Per-note level 0..1, multiplied into the part gain. Default 1. */
  velocity?: number;
}

/**
 * An instrument layer: a `Voice` timbre/effect template (everything except the three
 * fields the sequencer computes per note) plus a note pattern. `env` lives in the
 * template, so each note inherits the part's ADSR.
 */
export interface Part {
  /** Hz that semitone 0 maps to (e.g. a low C for bass, a higher C for lead). For a
   *  noise part this is the LFSR clock rate that semitone 0 selects. */
  rootHz: number;
  /** Voice timbre/effects, minus freq/durMs/delayMs/gain (the sequencer fills those). */
  voice: Omit<Voice, 'freq' | 'durMs' | 'delayMs' | 'gain'>;
  /** Layer level before the track mix. Default 1. */
  gain?: number;
  notes: Note[];
}

/** One looping music bed. */
export interface MusicTrack {
  bpm: number;
  bars: number;
  beatsPerBar: number; // 4 for our 4/4 beds
  parts: Part[];
  /** Master level after mixing + peak-limit (the loudness tier). Default 1. */
  gain?: number;
}

const SAMPLES_PER_MS = SAMPLE_RATE / 1000;

/** Length of the raised-cosine fade applied at each loop end so the endpoints sit at
 *  zero. A few ms is inaudible but removes the residual step (click) at the wrap. */
const BOUNDARY_FADE_MS = 5;

/** Equal-tempered pitch: semitone offset from a root frequency. */
export function noteHz(rootHz: number, semitone: number): number {
  return rootHz * 2 ** (semitone / 12);
}

/** Milliseconds per beat at a tempo. */
export function beatMs(bpm: number): number {
  return (60 / bpm) * 1000;
}

/** Exact loop length in whole samples = bars * beatsPerBar beats. */
export function loopSamples(track: MusicTrack): number {
  const totalBeats = track.bars * track.beatsPerBar;
  return Math.round(totalBeats * beatMs(track.bpm) * SAMPLES_PER_MS);
}

/**
 * Render a `MusicTrack` to exactly `loopSamples` mono float samples in [-1, 1], with
 * every note overlap-added at its beat offset and any tail past the end wrapped modulo
 * the loop length onto the start. Peak-limited (only if layers sum past full scale) then
 * scaled by the track gain, matching the synth's `renderRecipe` policy.
 */
export function renderMusicLoop(track: MusicTrack): Float32Array {
  const len = loopSamples(track);
  const mix = new Float32Array(len);
  if (len <= 0) return mix;
  const ms = beatMs(track.bpm);

  for (const part of track.parts) {
    const partGain = part.gain ?? 1;
    for (const note of part.notes) {
      if (note.rest || note.semitone === undefined) continue;
      const voice: Voice = {
        ...part.voice,
        freq: noteHz(part.rootHz, note.semitone),
        durMs: note.durationBeats * ms,
        gain: partGain * (note.velocity ?? 1),
      };
      const rendered = renderVoice(voice);
      const start = Math.round(note.beat * ms * SAMPLES_PER_MS);
      // Overlap-add with modulo wrap: a release tail past `len` folds onto the head.
      for (let i = 0; i < rendered.length; i++) {
        mix[(start + i) % len] += rendered[i];
      }
    }
  }

  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(mix[i]));
  const master = (track.gain ?? 1) * (peak > 1 ? 1 / peak : 1);
  for (let i = 0; i < len; i++) mix[i] *= master;

  // Force the loop endpoints to zero with a short raised-cosine fade so the wrap point
  // has no step (no click on loop), at the cost of a ~5ms dip once per loop.
  const fade = Math.min(Math.round(BOUNDARY_FADE_MS * SAMPLES_PER_MS), Math.floor(len / 2));
  for (let i = 0; i < fade; i++) {
    const g = 0.5 - 0.5 * Math.cos((Math.PI * i) / fade); // 0 -> 1
    mix[i] *= g;
    mix[len - 1 - i] *= g;
  }

  return mix;
}
