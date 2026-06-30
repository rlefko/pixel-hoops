import { describe, it, expect } from 'vitest';
import { renderVoice, type Voice } from '@/audio/synth';

/** Pure FNV-1a over int16-quantized samples (no node:crypto, so no @types/node needed). */
function hashSamples(a: Float32Array): string {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < a.length; i++) {
    const c = Math.max(-1, Math.min(1, a[i]));
    const v = (c < 0 ? Math.round(c * 0x8000) : Math.round(c * 0x7fff)) & 0xffff;
    h = Math.imul(h ^ (v & 0xff), 0x01000193) >>> 0;
    h = Math.imul(h ^ (v >>> 8), 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function peak(a: Float32Array): number {
  let p = 0;
  for (const s of a) p = Math.max(p, Math.abs(s));
  return p;
}

/** First-difference energy: a cheap proxy for high-frequency content. */
function hfEnergy(a: Float32Array): number {
  let e = 0;
  for (let i = 1; i < a.length; i++) e += Math.abs(a[i] - a[i - 1]);
  return e;
}

function allFinite(a: Float32Array): boolean {
  for (const s of a) if (!Number.isFinite(s)) return false;
  return true;
}

// Legacy fixtures: only the original chiptune fields. Their output must NEVER change when
// new opt-in synth features are added, so the committed SFX stay byte-identical. Hashes
// were captured from the pre-upgrade synth; a mismatch means a legacy code path drifted.
const LEGACY_GOLDEN: Record<string, { voice: Voice; hash: string }> = {
  squareSweepCrush: {
    voice: { osc: 'square', duty: 0.25, freq: 440, freqTo: 880, sweep: 'exp', durMs: 200, env: { attackMs: 5, decayMs: 80, sustain: 0.4, releaseMs: 40 }, crushBits: 5 },
    hash: '11124db7',
  },
  triangleVibrato: {
    voice: { osc: 'triangle', freq: 330, durMs: 180, vibrato: { semitones: 0.3, rateHz: 6 }, env: { decayMs: 120, sustain: 0.5, releaseMs: 30 } },
    hash: '50988273',
  },
  sawArp: {
    voice: { osc: 'sawtooth', freq: 220, durMs: 240, arp: { steps: [0, 4, 7], stepMs: 60 }, env: { sustain: 0.7, releaseMs: 50 } },
    hash: '2e6f2f68',
  },
  noiseHit: {
    voice: { osc: 'noise', freq: 4000, durMs: 120, noiseSeed: 9, srReduce: 3, crushBits: 4, env: { decayMs: 90, sustain: 0 } },
    hash: '3ce2e139',
  },
};

describe('synth back-compat (legacy voices unchanged)', () => {
  for (const [name, { voice, hash }] of Object.entries(LEGACY_GOLDEN)) {
    it(`${name} renders byte-identical to the golden baseline`, () => {
      expect(hashSamples(renderVoice(voice))).toBe(hash);
    });
  }
});

describe('sine + fm', () => {
  it('sine is a clean bounded tone', () => {
    const out = renderVoice({ osc: 'sine', freq: 440, durMs: 100 });
    expect(allFinite(out)).toBe(true);
    expect(peak(out)).toBeGreaterThan(0.9);
    expect(peak(out)).toBeLessThanOrEqual(1);
  });

  it('fm with a higher index has more high-frequency energy', () => {
    const base = { osc: 'fm' as const, freq: 220, durMs: 200, env: { sustain: 1 } };
    const soft = renderVoice({ ...base, fm: { ratio: 1, index: 0.5 } });
    const bright = renderVoice({ ...base, fm: { ratio: 1, index: 6 } });
    expect(allFinite(soft) && allFinite(bright)).toBe(true);
    expect(peak(bright)).toBeLessThanOrEqual(1);
    expect(hfEnergy(bright)).toBeGreaterThan(hfEnergy(soft));
  });
});

describe('resonant low-pass filter', () => {
  it('stays finite and bounded even at high resonance across a cutoff sweep', () => {
    const out = renderVoice({
      osc: 'sawtooth',
      freq: 110,
      durMs: 400,
      env: { sustain: 1 },
      filter: { baseHz: 200, peakHz: 8000, q: 8, attackMs: 5, decayMs: 380, sustain: 0 },
    });
    expect(allFinite(out)).toBe(true);
    expect(peak(out)).toBeLessThanOrEqual(4); // resonance can boost, but never blow up
    expect(peak(out)).toBeGreaterThan(0);
  });

  it('a higher cutoff passes more high-frequency energy', () => {
    const dark = renderVoice({ osc: 'sawtooth', freq: 220, durMs: 200, env: { sustain: 1 }, filter: { baseHz: 400, peakHz: 400, q: 0.7 } });
    const bright = renderVoice({ osc: 'sawtooth', freq: 220, durMs: 200, env: { sustain: 1 }, filter: { baseHz: 5000, peakHz: 5000, q: 0.7 } });
    expect(hfEnergy(bright)).toBeGreaterThan(hfEnergy(dark));
  });
});

describe('unison + drive', () => {
  it('unison detune stays in range and is audible', () => {
    const out = renderVoice({ osc: 'sawtooth', freq: 220, durMs: 200, env: { sustain: 1 }, unison: 5, detuneCents: 12, antialias: true });
    expect(allFinite(out)).toBe(true);
    expect(peak(out)).toBeLessThanOrEqual(1.01);
    expect(peak(out)).toBeGreaterThan(0);
  });

  it('drive soft-clips without exceeding full scale', () => {
    const out = renderVoice({ osc: 'sine', freq: 220, durMs: 100, gain: 1, drive: 4 });
    expect(allFinite(out)).toBe(true);
    expect(peak(out)).toBeLessThanOrEqual(1.0001);
  });
});

describe('determinism', () => {
  it('renders byte-identical across runs (filter + fm)', () => {
    const v: Voice = { osc: 'fm', freq: 330, durMs: 200, fm: { ratio: 2, index: 3, indexDecayMs: 120 }, filter: { baseHz: 300, peakHz: 4000, q: 3, decayMs: 180, sustain: 0.2 } };
    expect(Array.from(renderVoice(v))).toEqual(Array.from(renderVoice(v)));
  });
});
