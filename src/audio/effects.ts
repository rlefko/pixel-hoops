/**
 * Offline master-bus effects for the music beds: a Freeverb (Schroeder/Moorer) stereo
 * reverb, a tempo-synced feedback delay, and a soft-clip glue. These are what take the
 * synth from "chiptune blip" to a warm, spacious mix.
 *
 * Pure + deterministic: no Node/RN imports, no randomness, fixed feedback < 1 and bounded
 * state, with a final non-finite guard so an extreme setting can never write NaN into a
 * committed WAV. Applied ONCE to a whole track mix by the sequencer (never per SFX).
 */

/** Level-preserving tanh soft-clip: glues a mix and tames peaks without hard clipping. */
export function softClip(buf: Float32Array, drive: number): Float32Array {
  if (drive <= 0) return buf;
  const norm = Math.tanh(drive);
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = Math.tanh(buf[i] * drive) / norm;
  return out;
}

/** A single feedback comb with a one-pole low-pass in the loop (Freeverb's damping). */
class Comb {
  private readonly buf: Float32Array;
  private idx = 0;
  private store = 0;
  constructor(
    size: number,
    private readonly feedback: number,
    private readonly damp1: number
  ) {
    this.buf = new Float32Array(Math.max(1, size));
  }
  process(input: number): number {
    const out = this.buf[this.idx];
    this.store = out * (1 - this.damp1) + this.store * this.damp1;
    this.buf[this.idx] = input + this.store * this.feedback;
    this.idx = (this.idx + 1) % this.buf.length;
    return out;
  }
}

/** A Schroeder allpass. */
class Allpass {
  private readonly buf: Float32Array;
  private idx = 0;
  constructor(
    size: number,
    private readonly feedback = 0.5
  ) {
    this.buf = new Float32Array(Math.max(1, size));
  }
  process(input: number): number {
    const bufout = this.buf[this.idx];
    const out = -input + bufout;
    this.buf[this.idx] = input + bufout * this.feedback;
    this.idx = (this.idx + 1) % this.buf.length;
    return out;
  }
}

// Freeverb tunings (samples @ 44100), scaled to the actual rate at build time.
const COMB_TUNING = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const ALLPASS_TUNING = [556, 441, 341, 225];
const STEREO_SPREAD = 23;
const FIXED_GAIN = 0.015;

export interface ReverbOpts {
  /** 0..1; bigger = longer tail. */
  roomSize: number;
  /** 0..1; bigger = darker tail. */
  damping: number;
  /** Wet level 0..1. */
  wet: number;
  /** Dry level 0..1. Default 1. */
  dry?: number;
}

function makeBank(spread: number, sampleRate: number, feedback: number, damp1: number) {
  const scale = sampleRate / 44100;
  const combs = COMB_TUNING.map((t) => new Comb(Math.round((t + spread) * scale), feedback, damp1));
  const allpasses = ALLPASS_TUNING.map((t) => new Allpass(Math.round((t + spread) * scale)));
  return { combs, allpasses };
}

/** Stereo Freeverb: a mono sum drives two comb/allpass banks (L and a spread R). */
export function reverb(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  opts: ReverbOpts
): { left: Float32Array; right: Float32Array } {
  const feedback = opts.roomSize * 0.28 + 0.7;
  const damp1 = opts.damping * 0.4;
  const wet = opts.wet;
  const dry = opts.dry ?? 1;
  const bankL = makeBank(0, sampleRate, feedback, damp1);
  const bankR = makeBank(STEREO_SPREAD, sampleRate, feedback, damp1);

  const n = left.length;
  const outL = new Float32Array(n);
  const outR = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const input = (left[i] + right[i]) * FIXED_GAIN;
    let wetL = 0;
    let wetR = 0;
    for (const c of bankL.combs) wetL += c.process(input);
    for (const c of bankR.combs) wetR += c.process(input);
    for (const a of bankL.allpasses) wetL = a.process(wetL);
    for (const a of bankR.allpasses) wetR = a.process(wetR);
    outL[i] = left[i] * dry + wetL * wet;
    outR[i] = right[i] * dry + wetR * wet;
  }
  guard(outL);
  guard(outR);
  return { left: outL, right: outR };
}

export interface DelayOpts {
  /** Delay time in seconds. */
  timeSec: number;
  /** Feedback 0..<1. */
  feedback: number;
  /** Wet mix 0..1. */
  mix: number;
  /** One-pole damping of the echoes, 0..1. Default 0.3. */
  damp?: number;
}

/** A mono feedback delay with damped repeats (applied per channel by the caller). */
export function feedbackDelay(buf: Float32Array, sampleRate: number, opts: DelayOpts): Float32Array {
  const size = Math.max(1, Math.round(opts.timeSec * sampleRate));
  const fb = Math.min(0.95, Math.max(0, opts.feedback));
  const damp = Math.min(0.95, Math.max(0, opts.damp ?? 0.3));
  const line = new Float32Array(size);
  let idx = 0;
  let store = 0;
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    const echo = line[idx];
    store = echo * (1 - damp) + store * damp;
    line[idx] = buf[i] + store * fb;
    idx = (idx + 1) % size;
    out[i] = buf[i] + echo * opts.mix;
  }
  guard(out);
  return out;
}

function guard(a: Float32Array): void {
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) a[i] = 0;
}
