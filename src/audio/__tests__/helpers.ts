/** Shared assertions-support helpers for the audio tests (not a test file itself). */

/** Largest absolute sample value. */
export function peak(samples: Float32Array): number {
  let p = 0;
  for (const s of samples) p = Math.max(p, Math.abs(s));
  return p;
}

/** True when no sample is NaN/Infinity (an unstable patch would poison the encoder). */
export function allFinite(samples: Float32Array): boolean {
  for (const s of samples) if (!Number.isFinite(s)) return false;
  return true;
}
