/**
 * Pure 16-bit PCM mono WAV encoder. No Node or React Native imports: it returns a
 * Uint8Array (which `fs.writeFileSync` accepts and vitest can assert on byte-by-byte),
 * so the same code runs in the generator script, in unit tests, and anywhere else.
 *
 * The runtime app never imports this: it plays the committed .wav files. This lives
 * under src/ purely so it is typechecked, linted, and unit-tested.
 */

/** Output format. Chiptune blips need nothing fancier, and 22.05kHz mono halves size. */
export const SAMPLE_RATE = 22050;
export const BITS_PER_SAMPLE = 16;
export const CHANNELS = 1;

const HEADER_BYTES = 44;
const PCM_FORMAT = 1;
const INT16_MAX = 0x7fff;
const INT16_MIN = 0x8000; // magnitude of the most-negative int16

/**
 * Encode mono float samples in [-1, 1] as a canonical 44-byte-header PCM WAV.
 * Samples outside [-1, 1] are clamped; full scale maps to +32767 / -32768.
 */
export function encodeWav(samples: Float32Array, sampleRate: number = SAMPLE_RATE): Uint8Array {
  const bytesPerSample = BITS_PER_SAMPLE / 8;
  const blockAlign = CHANNELS * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;

  const buffer = new ArrayBuffer(HEADER_BYTES + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true); // RIFF chunk size = everything after this field
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // PCM fmt chunk body is 16 bytes
  view.setUint16(20, PCM_FORMAT, true);
  view.setUint16(22, CHANNELS, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = HEADER_BYTES;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    // Asymmetric int16 range, rounded for deterministic, reproducible output.
    const value = clamped < 0 ? Math.round(clamped * INT16_MIN) : Math.round(clamped * INT16_MAX);
    view.setInt16(offset, value, true);
    offset += bytesPerSample;
  }

  return new Uint8Array(buffer);
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}
