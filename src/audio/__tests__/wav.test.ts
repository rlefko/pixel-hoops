import { describe, it, expect } from 'vitest';
import { encodeWav, SAMPLE_RATE, BITS_PER_SAMPLE, CHANNELS } from '@/audio/wav';
import { renderRecipe, type Recipe } from '@/audio/synth';
import { RECIPES, type SfxName } from '@/audio/recipes';
import { peak } from './helpers';

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[offset + i]);
  return out;
}

describe('encodeWav', () => {
  it('writes a canonical PCM mono RIFF/WAVE header', () => {
    const samples = new Float32Array(100);
    const wav = encodeWav(samples);
    const dv = view(wav);
    const bytesPerSample = BITS_PER_SAMPLE / 8;
    const dataSize = samples.length * bytesPerSample;

    expect(ascii(wav, 0, 4)).toBe('RIFF');
    expect(dv.getUint32(4, true)).toBe(36 + dataSize);
    expect(ascii(wav, 8, 4)).toBe('WAVE');
    expect(ascii(wav, 12, 4)).toBe('fmt ');
    expect(dv.getUint32(16, true)).toBe(16); // PCM fmt chunk body size
    expect(dv.getUint16(20, true)).toBe(1); // 1 = PCM
    expect(dv.getUint16(22, true)).toBe(CHANNELS);
    expect(dv.getUint32(24, true)).toBe(SAMPLE_RATE);
    expect(dv.getUint16(34, true)).toBe(BITS_PER_SAMPLE);
    expect(ascii(wav, 36, 4)).toBe('data');
    expect(dv.getUint32(40, true)).toBe(dataSize);
    expect(wav.length).toBe(44 + dataSize);
  });

  it('keeps byteRate and blockAlign self-consistent', () => {
    const dv = view(encodeWav(new Float32Array(10)));
    const blockAlign = CHANNELS * (BITS_PER_SAMPLE / 8);
    expect(dv.getUint16(32, true)).toBe(blockAlign);
    expect(dv.getUint32(28, true)).toBe(SAMPLE_RATE * blockAlign);
  });

  it('clamps out-of-range samples and quantizes full scale to int16 extremes', () => {
    const dv = view(encodeWav(new Float32Array([1, -1, 1.5, -1.5, 0])));
    expect(dv.getInt16(44, true)).toBe(32767);
    expect(dv.getInt16(46, true)).toBe(-32768);
    expect(dv.getInt16(48, true)).toBe(32767); // 1.5 clamped to +1
    expect(dv.getInt16(50, true)).toBe(-32768); // -1.5 clamped to -1
    expect(dv.getInt16(52, true)).toBe(0);
  });
});

describe('renderRecipe', () => {
  it('renders every catalog recipe to audible, in-range, correctly-sized samples', () => {
    for (const name of Object.keys(RECIPES) as SfxName[]) {
      const recipe: Recipe = RECIPES[name];
      const out = renderRecipe(recipe);

      const longest = Math.max(
        ...recipe.voices.map((v) =>
          Math.round((((v.delayMs ?? 0) + v.durMs) / 1000) * SAMPLE_RATE)
        )
      );
      expect(out.length, `${name} length`).toBe(longest);

      expect(peak(out), `${name} stays within [-1, 1]`).toBeLessThanOrEqual(1);
      expect(peak(out), `${name} is not silent`).toBeGreaterThan(0);
    }
  });

  it('is deterministic across runs', () => {
    const a = renderRecipe(RECIPES.dunk);
    const b = renderRecipe(RECIPES.dunk);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
