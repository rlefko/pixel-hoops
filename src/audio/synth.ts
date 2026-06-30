/**
 * A small deterministic synth. It compiles a declarative `Recipe` (a stack of `Voice`s,
 * each an oscillator + envelope + effects) into mono float samples in [-1, 1].
 *
 * Pure: no Node or React Native imports, no global randomness or clock, so the same
 * recipe always renders byte-identical audio. Used by the generator script and the
 * unit tests; the app itself only plays the committed .wav output.
 *
 * The original chiptune core (square/triangle/saw/LFSR-noise + ADSR + sweep/arp/vibrato/
 * bit-crush/sample-rate-reduction) is unchanged. Everything richer (sine, 2-op FM, a
 * resonant low-pass filter, unison/detune, soft-clip, anti-aliasing) is OPT-IN via new
 * optional `Voice` fields: a voice that sets none of them renders exactly as before, so
 * the committed SFX are untouched. Music opts into the warmth (see musicTracks.ts).
 */

import { SAMPLE_RATE } from './wav';

export type Osc = 'square' | 'triangle' | 'sawtooth' | 'noise' | 'sine' | 'fm';
export type SweepShape = 'linear' | 'exp';

export interface Envelope {
  /** Fade-in time. Chiptune attacks are near-instant; default 0 (full from sample 0). */
  attackMs?: number;
  /** Fall from peak to the sustain level. */
  decayMs?: number;
  /** Held level after decay, 0..1. Percussive sounds use a low sustain + long decay. */
  sustain?: number;
  /** Fade-out at the tail, ending exactly at durMs. */
  releaseMs?: number;
}

/** Resonant low-pass with its own cutoff envelope. The single biggest warmth upgrade. */
export interface FilterEnvelope {
  /** Cutoff Hz when the env is at 0 (the "closed" floor). */
  baseHz: number;
  /** Cutoff Hz at env=1 (the "open" ceiling). Swept exponentially between base and peak. */
  peakHz: number;
  /** Resonance. ~0.7 flat, 2-6 an audible bump, higher rings. Default 0.9. */
  q?: number;
  /** ADSR over the cutoff (0..1 -> base..peak). Reuses the amp envelope shape. */
  attackMs?: number;
  decayMs?: number;
  sustain?: number;
  releaseMs?: number;
}

/** 2-op FM parameters; only read when osc==='fm'. The carrier is a sine. */
export interface FmSpec {
  /** modulator freq = carrier freq * ratio. Integer = harmonic; 1.41/3.5/7 = bell/metal. */
  ratio: number;
  /** Modulation index (brightness) at the index env peak. */
  index: number;
  /** Optional index envelope (ms). Omit for a constant index. */
  indexAttackMs?: number;
  indexDecayMs?: number;
  indexSustain?: number;
}

export interface Voice {
  osc: Osc;
  /** Pulse width for `square` (0..1). 0.5 = full, 0.25 / 0.125 = thinner NES timbres. */
  duty?: number;
  /** Start frequency in Hz. For `noise`, the LFSR clock rate (higher = hissier). */
  freq: number;
  /** End frequency for a pitch sweep / portamento across the voice. */
  freqTo?: number;
  /** Sweep curve from `freq` to `freqTo`. Default linear. */
  sweep?: SweepShape;
  durMs: number;
  /** Start this voice late so voices can layer or sequence. Default 0. */
  delayMs?: number;
  env?: Envelope;
  /** Arpeggio: cycle these semitone offsets (relative to `freq`) every `stepMs`. */
  arp?: { steps: number[]; stepMs: number };
  /** Pitch wobble: `semitones` of depth at `rateHz`. */
  vibrato?: { semitones: number; rateHz: number };
  /** Per-voice level before the recipe mix. Default 1. */
  gain?: number;
  /** Quantize amplitude to this many bits for lo-fi crunch (e.g. 4). */
  crushBits?: number;
  /** Sample-and-hold every N output samples to fake a lower sample rate. */
  srReduce?: number;
  /** Seed for the noise LFSR so a clip's noise is fixed but differs per voice. */
  noiseSeed?: number;

  // ── opt-in richness (a voice that sets none of these renders exactly as before) ──
  /** Resonant low-pass with its own cutoff envelope. */
  filter?: FilterEnvelope;
  /** 2-op FM params; only used when osc==='fm'. */
  fm?: FmSpec;
  /** Unison voices: N detuned copies summed for a fat pad / supersaw. Default 1 (off). */
  unison?: number;
  /** Symmetric detune spread (cents) across the unison stack. Default 0. */
  detuneCents?: number;
  /** Level-preserving soft-clip drive (tanh). >0 enables; ~1.2-2 glues, higher saturates. */
  drive?: number;
  /** Stereo pan -1..1; used only by the sequencer's stereo mix, ignored by mono render. */
  pan?: number;
  /** Band-limit `sawtooth`/`square` with PolyBLEP to kill aliasing (for bright music). */
  antialias?: boolean;
}

export interface Recipe {
  voices: Voice[];
  /** Master level after mixing, 0..1. This is the loudness tier (routine vs sting). */
  gain?: number;
  /** Round-robin player-pool size the runtime should allocate (1 = one-shot). */
  pool: number;
}

const TWO_PI = Math.PI * 2;
const LFSR_MASK = 0x7fff; // 15-bit shift register, like the NES noise channel

function msToSamples(ms: number, sampleRate: number): number {
  return Math.round((ms / 1000) * sampleRate);
}

function semitonesToRatio(semitones: number): number {
  return 2 ** (semitones / 12);
}

/** ADSR amplitude at a point in time. Release is anchored to the end of the voice. */
function envelopeAt(elapsedMs: number, durMs: number, env: Envelope | undefined): number {
  if (!env) return 1;
  const attack = env.attackMs ?? 0;
  const decay = env.decayMs ?? 0;
  const sustain = env.sustain ?? 1;
  const release = env.releaseMs ?? 0;
  const releaseStart = Math.max(attack + decay, durMs - release);

  if (elapsedMs < attack) return attack > 0 ? elapsedMs / attack : 1;
  if (elapsedMs < attack + decay) {
    return decay > 0 ? 1 - (1 - sustain) * ((elapsedMs - attack) / decay) : sustain;
  }
  if (elapsedMs < releaseStart) return sustain;
  if (elapsedMs < durMs) return release > 0 ? sustain * (1 - (elapsedMs - releaseStart) / release) : 0;
  return 0;
}

/** Instantaneous frequency, folding in sweep, arpeggio, and vibrato. */
function freqAt(voice: Voice, elapsedMs: number, progress: number): number {
  let base = voice.freq;
  if (voice.arp) {
    const idx = Math.floor(elapsedMs / voice.arp.stepMs) % voice.arp.steps.length;
    base = voice.freq * semitonesToRatio(voice.arp.steps[idx]);
  } else if (voice.freqTo !== undefined) {
    base =
      voice.sweep === 'exp'
        ? voice.freq * (voice.freqTo / voice.freq) ** progress
        : voice.freq + (voice.freqTo - voice.freq) * progress;
  }
  if (voice.vibrato) {
    const wobble = Math.sin(TWO_PI * voice.vibrato.rateHz * (elapsedMs / 1000));
    base *= semitonesToRatio(voice.vibrato.semitones * wobble);
  }
  return base;
}

function oscillator(osc: Osc, phase: number, duty: number): number {
  const t = phase - Math.floor(phase); // fractional phase in [0, 1)
  switch (osc) {
    case 'square':
      return t < duty ? 1 : -1;
    case 'triangle':
      return 4 * Math.abs(t - 0.5) - 1;
    case 'sawtooth':
      return 2 * t - 1;
    case 'sine':
      return Math.sin(TWO_PI * t);
    case 'noise':
    case 'fm':
      return 0; // noise (LFSR) and fm have their own paths in renderVoice
  }
}

/** PolyBLEP residual that rounds off a band-unlimited edge. `t` is fractional phase. */
function polyBlep(t: number, dt: number): number {
  if (dt <= 0) return 0;
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

/** Band-limited saw/square via PolyBLEP; other waves are unaffected. `t` in [0,1). */
function antialiasedOsc(osc: Osc, t: number, dt: number, duty: number): number {
  if (osc === 'sawtooth') return 2 * t - 1 - polyBlep(t, dt);
  if (osc === 'square') {
    let s = t < duty ? 1 : -1;
    s += polyBlep(t, dt);
    s -= polyBlep((t - duty + 1) % 1, dt);
    return s;
  }
  return oscillator(osc, t, duty);
}

function crush(sample: number, bits: number): number {
  const levels = 2 ** (bits - 1);
  return Math.round(sample * levels) / levels;
}

interface SvfState {
  lp: number;
  bp: number;
}

/** One resonant low-pass tick (Chamberlin SVF), 2x oversampled for stability. */
function svfLowpass(input: number, fc: number, q: number, st: SvfState, sampleRate: number): number {
  const fcClamped = Math.min(Math.max(fc, 10), sampleRate * 0.16); // stability + audibility bound
  const f = 2 * Math.sin((Math.PI * fcClamped) / sampleRate);
  const damp = 1 / Math.max(0.5, q); // lower damp = more resonance
  for (let i = 0; i < 2; i++) {
    const hp = input - st.lp - damp * st.bp;
    st.bp += f * hp;
    st.lp += f * st.bp;
  }
  return st.lp;
}

/** Symmetric detune ratios across a unison stack (deterministic, no randomness). */
function detuneRatios(n: number, cents: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? (i / (n - 1)) * 2 - 1 : 0; // -1..+1
    out.push(2 ** ((t * cents) / 1200));
  }
  return out;
}

/** Render a single voice to its own buffer (length = its duration in samples). */
export function renderVoice(voice: Voice, sampleRate: number = SAMPLE_RATE): Float32Array {
  const total = msToSamples(voice.durMs, sampleRate);
  const out = new Float32Array(total);
  const duty = voice.duty ?? 0.5;
  const gain = voice.gain ?? 1;
  const isNoise = voice.osc === 'noise';
  const isFm = voice.osc === 'fm';
  const unison = voice.unison && voice.unison > 1 ? voice.unison : 1;
  const ratios = unison > 1 ? detuneRatios(unison, voice.detuneCents ?? 0) : null;
  const antialias = voice.antialias === true;
  const drive = voice.drive ?? 0;
  const filt = voice.filter;

  // NES-style 15-bit LFSR, clocked at the voice frequency, holding between clocks.
  let lfsr = ((voice.noiseSeed ?? 1) & LFSR_MASK) || 1;
  let noiseValue = (lfsr & 1) === 1 ? 1 : -1;

  let phase = 0; // single-osc / noise accumulator
  const phases = ratios ? ratios.map((_, k) => k / unison) : null; // unison copies
  let phaseC = 0; // fm carrier
  let phaseM = 0; // fm modulator
  let held = 0;
  const svf: SvfState = { lp: 0, bp: 0 };

  for (let i = 0; i < total; i++) {
    const elapsedMs = (i / sampleRate) * 1000;
    const progress = total > 1 ? i / (total - 1) : 1;
    const freq = freqAt(voice, elapsedMs, progress);

    let raw: number;
    if (isNoise) {
      phase += freq / sampleRate;
      while (phase >= 1) {
        phase -= 1;
        const feedback = (lfsr ^ (lfsr >> 1)) & 1;
        lfsr = (lfsr >> 1) | (feedback << 14);
        noiseValue = (lfsr & 1) === 1 ? 1 : -1;
      }
      raw = noiseValue;
    } else if (isFm && voice.fm) {
      const fm = voice.fm;
      const idxEnv = fm.indexDecayMs
        ? envelopeAt(elapsedMs, voice.durMs, {
            attackMs: fm.indexAttackMs,
            decayMs: fm.indexDecayMs,
            sustain: fm.indexSustain ?? 0,
          })
        : 1;
      const modIndex = fm.index * idxEnv;
      phaseM += (TWO_PI * freq * fm.ratio) / sampleRate;
      phaseC += (TWO_PI * freq) / sampleRate;
      raw = Math.sin(phaseC + Math.sin(phaseM) * modIndex);
    } else if (ratios && phases) {
      // Unison: sum detuned copies, normalized by 1/sqrt(n).
      let sum = 0;
      for (let k = 0; k < ratios.length; k++) {
        phases[k] += (freq * ratios[k]) / sampleRate;
        const tFrac = phases[k] - Math.floor(phases[k]);
        sum += antialias
          ? antialiasedOsc(voice.osc, tFrac, (freq * ratios[k]) / sampleRate, duty)
          : oscillator(voice.osc, phases[k], duty);
      }
      raw = sum / Math.sqrt(ratios.length);
    } else {
      // Legacy single-oscillator path. Byte-identical when no new fields are set.
      phase += freq / sampleRate;
      raw = antialias
        ? antialiasedOsc(voice.osc, phase - Math.floor(phase), freq / sampleRate, duty)
        : oscillator(voice.osc, phase, duty);
    }

    if (filt) {
      const cutoffEnv = envelopeAt(elapsedMs, voice.durMs, {
        attackMs: filt.attackMs,
        decayMs: filt.decayMs,
        sustain: filt.sustain ?? 1,
        releaseMs: filt.releaseMs,
      });
      const cutoffHz = filt.baseHz * (filt.peakHz / filt.baseHz) ** cutoffEnv;
      raw = svfLowpass(raw, cutoffHz, filt.q ?? 0.9, svf, sampleRate);
    }

    let sample = raw * envelopeAt(elapsedMs, voice.durMs, voice.env) * gain;
    if (voice.crushBits) sample = crush(sample, voice.crushBits);
    if (drive > 0) sample = Math.tanh(sample * drive) / Math.tanh(drive);

    if (voice.srReduce && voice.srReduce > 1) {
      if (i % voice.srReduce === 0) held = sample;
      out[i] = held;
    } else {
      out[i] = sample;
    }
  }

  // Guard against any non-finite sample from an unstable patch reaching the encoder.
  for (let i = 0; i < total; i++) {
    if (!Number.isFinite(out[i])) out[i] = 0;
  }

  return out;
}

/** Compile a recipe to mixed mono samples, peak-limited then scaled by the loudness tier. */
export function renderRecipe(recipe: Recipe, sampleRate: number = SAMPLE_RATE): Float32Array {
  const lengths = recipe.voices.map((v) => msToSamples((v.delayMs ?? 0) + v.durMs, sampleRate));
  const total = lengths.length ? Math.max(...lengths) : 0;
  const mix = new Float32Array(total);

  for (const voice of recipe.voices) {
    const rendered = renderVoice(voice, sampleRate);
    const start = msToSamples(voice.delayMs ?? 0, sampleRate);
    for (let i = 0; i < rendered.length && start + i < total; i++) {
      mix[start + i] += rendered[i];
    }
  }

  // Limit only if stacked voices summed past full scale, so single-voice recipes keep
  // their intended level. Then apply the recipe's loudness tier.
  let peak = 0;
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(mix[i]));
  const limit = peak > 1 ? 1 / peak : 1;
  const master = (recipe.gain ?? 1) * limit;
  for (let i = 0; i < total; i++) mix[i] *= master;

  return mix;
}
