/**
 * A small step sequencer layered on the synth (./synth). It turns a declarative
 * `MusicTrack` (tempo + bars + instrument parts, each a voice timbre plus absolute-beat
 * notes) into one seamless STEREO loop: each note is rendered as a synth `Voice`, panned,
 * mixed at its beat offset, then sweetened by master-bus effects (./effects).
 *
 * Pure: no Node or React Native imports, no global randomness or clock, so a track renders
 * byte-identical every run. Used by the generator and unit tests; the app plays the .wav.
 *
 * Harmony lives in the authored notes (see musicTracks.ts and its chord helpers), so the
 * engine stays simple: it just renders, pans, and mixes. Seamless looping: note release
 * tails wrap modulo the loop length, the reverb/delay are pre-rolled with the loop's own
 * tail so their wet content matches at the seam, and a short fade pins the endpoints to 0.
 */

import { MUSIC_SAMPLE_RATE } from './wav';
import { renderVoice, type Voice } from './synth';
import { reverb, feedbackDelay, softClip, type ReverbOpts } from './effects';

/** One note in a part. Omit `semitone` (or set `rest`) for silence. */
export interface Note {
  /** Beat index from the loop start; fractional allowed (0 = downbeat of bar 1). */
  beat: number;
  /** Length in beats. The voice's release tail may overhang; the loop wrap folds it back. */
  durationBeats: number;
  /** Pitch as a semitone offset from the part's root. */
  semitone?: number;
  rest?: boolean;
  /** Per-note level 0..1, multiplied into the part gain. Default 1. */
  velocity?: number;
}

/** An instrument layer: a `Voice` timbre template + absolute-beat notes over the track. */
export interface Part {
  /** Identifier, for authoring clarity. */
  id: string;
  /** Hz that semitone 0 maps to. For a noise part, the LFSR clock rate semitone 0 selects. */
  rootHz: number;
  /** Voice timbre/effects, minus freq/durMs/delayMs/gain (the sequencer fills those). */
  voice: Omit<Voice, 'freq' | 'durMs' | 'delayMs' | 'gain'>;
  /** Layer level before the track mix. Default 1. */
  gain?: number;
  /** Stereo placement -1 (hard left) .. +1 (hard right). Default 0 (center). */
  pan?: number;
  notes: Note[];
}

export interface TrackFx {
  reverb?: ReverbOpts;
  delay?: { beats: number; feedback: number; mix: number; damp?: number };
  /** Master-bus soft-clip drive (tanh glue). */
  busDrive?: number;
}

/** One looping music bed. */
export interface MusicTrack {
  bpm: number;
  bars: number;
  beatsPerBar: number;
  parts: Part[];
  /** Master level after mixing + peak-limit (the loudness tier). Default 1. */
  gain?: number;
  fx?: TrackFx;
}

/** Length of the raised-cosine fade at each loop end so the endpoints sit at zero. */
const BOUNDARY_FADE_MS = 6;

/** Equal-tempered pitch: semitone offset from a root frequency. */
export function noteHz(rootHz: number, semitone: number): number {
  return rootHz * 2 ** (semitone / 12);
}

/** Milliseconds per beat at a tempo. */
export function beatMs(bpm: number): number {
  return (60 / bpm) * 1000;
}

/** Exact loop length in whole samples = bars * beatsPerBar beats. */
export function loopSamples(track: MusicTrack, sampleRate: number = MUSIC_SAMPLE_RATE): number {
  const beats = track.bars * track.beatsPerBar;
  return Math.round((beats * beatMs(track.bpm) * sampleRate) / 1000);
}

/** Equal-power pan gains for a pan in [-1, 1]. */
function panGains(pan: number): { l: number; r: number } {
  const angle = ((Math.min(1, Math.max(-1, pan)) + 1) / 2) * (Math.PI / 2);
  return { l: Math.cos(angle), r: Math.sin(angle) };
}

/** Prepend the buffer's own tail as a pre-roll, so stateful FX warm up before the loop. */
function preRoll(buf: Float32Array, n: number): Float32Array {
  const out = new Float32Array(buf.length + n);
  out.set(buf.subarray(buf.length - n), 0);
  out.set(buf, n);
  return out;
}

/**
 * Render a `MusicTrack` to exactly `loopSamples` STEREO float samples in [-1, 1]. Notes
 * are panned and overlap-added (tails wrap modulo the loop), then the master-bus effects
 * are applied loop-aware, the mix is peak-limited + gain-scaled, and the endpoints faded.
 */
export function renderMusicLoop(
  track: MusicTrack,
  sampleRate: number = MUSIC_SAMPLE_RATE
): { left: Float32Array; right: Float32Array } {
  const len = loopSamples(track, sampleRate);
  let left = new Float32Array(Math.max(0, len));
  let right = new Float32Array(Math.max(0, len));
  if (len <= 0) return { left, right };

  const ms = beatMs(track.bpm);
  const samplesPerMs = sampleRate / 1000;

  for (const part of track.parts) {
    const partGain = part.gain ?? 1;
    const { l, r } = panGains(part.pan ?? 0);
    for (const note of part.notes) {
      if (note.rest || note.semitone === undefined) continue;
      const voice: Voice = {
        ...part.voice,
        freq: noteHz(part.rootHz, note.semitone),
        durMs: note.durationBeats * ms,
        gain: partGain * (note.velocity ?? 1),
      };
      const rendered = renderVoice(voice, sampleRate);
      const start = Math.round(note.beat * ms * samplesPerMs);
      for (let i = 0; i < rendered.length; i++) {
        const idx = (start + i) % len;
        left[idx] += rendered[i] * l;
        right[idx] += rendered[i] * r;
      }
    }
  }

  // Master-bus effects, pre-rolled with the loop's own tail so the wet content is
  // continuous across the seam. Skip the pre-roll entirely when there are no effects.
  const fx = track.fx;
  if (fx && (fx.delay || fx.reverb || fx.busDrive)) {
    const roll = Math.min(len, Math.round(sampleRate * 2)); // 2s warmup covers reverb/delay tails
    let l2 = preRoll(left, roll);
    let r2 = preRoll(right, roll);
    if (fx.delay) {
      const opts = {
        timeSec: (fx.delay.beats * ms) / 1000,
        feedback: fx.delay.feedback,
        mix: fx.delay.mix,
        damp: fx.delay.damp,
      };
      l2 = feedbackDelay(l2, sampleRate, opts);
      r2 = feedbackDelay(r2, sampleRate, opts);
    }
    if (fx.reverb) {
      const wetDry = reverb(l2, r2, sampleRate, fx.reverb);
      l2 = wetDry.left;
      r2 = wetDry.right;
    }
    if (fx.busDrive) {
      l2 = softClip(l2, fx.busDrive);
      r2 = softClip(r2, fx.busDrive);
    }
    left = l2.slice(roll);
    right = r2.slice(roll);
  }

  // Joint peak-limit (both channels share the factor so the stereo image is preserved),
  // then the track loudness tier.
  let peak = 0;
  for (let i = 0; i < len; i++) {
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  const master = (track.gain ?? 1) * (peak > 1 ? 1 / peak : 1);
  for (let i = 0; i < len; i++) {
    left[i] *= master;
    right[i] *= master;
  }

  // Pin the loop endpoints to zero (no click on wrap), at the cost of a ~6ms dip per loop.
  const fade = Math.min(Math.round(BOUNDARY_FADE_MS * samplesPerMs), Math.floor(len / 2));
  for (let i = 0; i < fade; i++) {
    const g = 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);
    left[i] *= g;
    right[i] *= g;
    left[len - 1 - i] *= g;
    right[len - 1 - i] *= g;
  }

  return { left, right };
}
