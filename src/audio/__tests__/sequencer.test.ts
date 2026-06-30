import { describe, it, expect } from 'vitest';
import {
  renderMusicLoop,
  loopSamples,
  noteHz,
  beatMs,
  type MusicTrack,
} from '@/audio/sequencer';
import { SAMPLE_RATE } from '@/audio/wav';
import { MUSIC_TRACKS, type MusicName } from '@/audio/musicTracks';

function peakOf(buf: Float32Array): number {
  let p = 0;
  for (const s of buf) p = Math.max(p, Math.abs(s));
  return p;
}

const tinyTrack: MusicTrack = {
  bpm: 120,
  bars: 1,
  beatsPerBar: 4,
  gain: 0.8,
  parts: [
    {
      rootHz: 220,
      voice: {
        osc: 'square',
        duty: 0.5,
        env: { attackMs: 5, decayMs: 50, sustain: 0.5, releaseMs: 60 },
      },
      gain: 0.6,
      notes: [
        { beat: 0, durationBeats: 1, semitone: 0 },
        { beat: 1, durationBeats: 1, semitone: 7 },
        { beat: 2, durationBeats: 1, semitone: 12 },
        { beat: 3, durationBeats: 0.5, semitone: 7 },
      ],
    },
  ],
};

describe('sequencer helpers', () => {
  it('noteHz: +12 semitones is one octave up', () => {
    expect(noteHz(220, 12)).toBeCloseTo(440, 6);
    expect(noteHz(440, -12)).toBeCloseTo(220, 6);
    expect(noteHz(440, 0)).toBe(440);
  });

  it('beatMs: 120 BPM is 500 ms per beat', () => {
    expect(beatMs(120)).toBe(500);
    expect(beatMs(240)).toBe(250);
  });

  it('loopSamples: exact bars * beats at the sample rate', () => {
    // 1 bar * 4 beats * 500ms = 2.0s
    expect(loopSamples(tinyTrack)).toBe(Math.round(2 * SAMPLE_RATE));
  });
});

describe('renderMusicLoop', () => {
  it('outputs exactly the loop length', () => {
    expect(renderMusicLoop(tinyTrack).length).toBe(loopSamples(tinyTrack));
  });

  it('is audible and within range', () => {
    const p = peakOf(renderMusicLoop(tinyTrack));
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThanOrEqual(1);
  });

  it('is deterministic across runs', () => {
    expect(Array.from(renderMusicLoop(tinyTrack))).toEqual(
      Array.from(renderMusicLoop(tinyTrack))
    );
  });

  it('wraps a release tail that overhangs the loop end back onto the start', () => {
    // A single note on the final beat whose long release runs past the loop end. The
    // overhang must fold onto the head, so the first samples carry the tail energy.
    const track: MusicTrack = {
      bpm: 120,
      bars: 1,
      beatsPerBar: 4,
      gain: 1,
      parts: [
        {
          rootHz: 220,
          voice: {
            osc: 'triangle',
            env: { attackMs: 2, decayMs: 10, sustain: 0.8, releaseMs: 400 },
          },
          notes: [{ beat: 3.5, durationBeats: 1, semitone: 0 }], // ends at beat 4.5, past the 4-beat loop
        },
      ],
    };
    const buf = renderMusicLoop(track);
    let headEnergy = 0;
    for (let i = 0; i < 2000; i++) headEnergy += Math.abs(buf[i]);
    expect(headEnergy).toBeGreaterThan(0);
  });
});

describe('MUSIC_TRACKS catalog', () => {
  it('every bed renders to its exact loop length, audible and in range', () => {
    for (const name of Object.keys(MUSIC_TRACKS) as MusicName[]) {
      const track: MusicTrack = MUSIC_TRACKS[name];
      const buf = renderMusicLoop(track);
      expect(buf.length, `${name} length`).toBe(loopSamples(track));
      const p = peakOf(buf);
      expect(p, `${name} not silent`).toBeGreaterThan(0);
      expect(p, `${name} in range`).toBeLessThanOrEqual(1);
    }
  });
});
