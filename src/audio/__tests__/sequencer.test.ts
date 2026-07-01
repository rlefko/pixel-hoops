import { describe, it, expect } from 'vitest';
import { renderMusicLoop, loopSamples, noteHz, beatMs, type MusicTrack } from '@/audio/sequencer';
import { MUSIC_TRACKS, type MusicName } from '@/audio/musicTracks';
import { peak as peakOf, allFinite } from './helpers';

// Render the catalog at a low rate in tests: structure (length/peak/seam/finite) is what we
// can assert, and 8 kHz keeps the 2.5-minute beds fast. The real rate is set by the baker.
const TEST_SR = 8000;

const tinyTrack: MusicTrack = {
  bpm: 120,
  bars: 2,
  beatsPerBar: 4,
  gain: 0.8,
  parts: [
    {
      id: 'bass',
      rootHz: 110,
      pan: -0.5,
      voice: { osc: 'sine', env: { attackMs: 5, decayMs: 100, sustain: 0.5, releaseMs: 60 } },
      gain: 0.6,
      notes: [
        { beat: 0, durationBeats: 1, semitone: 0 },
        { beat: 2, durationBeats: 1, semitone: 7 },
        { beat: 4, durationBeats: 1, semitone: 5 },
        { beat: 6, durationBeats: 1, semitone: 0 },
      ],
    },
    {
      id: 'lead',
      rootHz: 440,
      pan: 0.5,
      voice: { osc: 'fm', fm: { ratio: 2, index: 1 }, env: { decayMs: 200, sustain: 0.4, releaseMs: 80 } },
      gain: 0.4,
      notes: [
        { beat: 0, durationBeats: 1, semitone: 12 },
        { beat: 1.5, durationBeats: 0.5, semitone: 16 },
        { beat: 3, durationBeats: 1, semitone: 19 },
      ],
    },
  ],
  fx: { reverb: { roomSize: 0.5, damping: 0.5, wet: 0.15 }, busDrive: 1.1 },
};

describe('sequencer helpers', () => {
  it('noteHz: +12 semitones is one octave up', () => {
    expect(noteHz(220, 12)).toBeCloseTo(440, 6);
  });
  it('beatMs: 120 BPM is 500 ms per beat', () => {
    expect(beatMs(120)).toBe(500);
  });
  it('loopSamples: exact bars * beats at the rate', () => {
    // 2 bars * 4 beats * 500ms = 4s
    expect(loopSamples(tinyTrack, TEST_SR)).toBe(Math.round(4 * TEST_SR));
  });
});

describe('renderMusicLoop', () => {
  it('returns stereo channels of the exact loop length', () => {
    const { left, right } = renderMusicLoop(tinyTrack, TEST_SR);
    const len = loopSamples(tinyTrack, TEST_SR);
    expect(left.length).toBe(len);
    expect(right.length).toBe(len);
  });

  it('is audible, in range, and finite', () => {
    const { left, right } = renderMusicLoop(tinyTrack, TEST_SR);
    expect(allFinite(left) && allFinite(right)).toBe(true);
    expect(peakOf(left)).toBeGreaterThan(0);
    expect(peakOf(left)).toBeLessThanOrEqual(1);
    expect(peakOf(right)).toBeLessThanOrEqual(1);
  });

  it('pans parts (left and right differ)', () => {
    const { left, right } = renderMusicLoop(tinyTrack, TEST_SR);
    let diff = 0;
    for (let i = 0; i < left.length; i++) diff += Math.abs(left[i] - right[i]);
    expect(diff).toBeGreaterThan(0);
  });

  it('is deterministic across runs', () => {
    const a = renderMusicLoop(tinyTrack, TEST_SR);
    const b = renderMusicLoop(tinyTrack, TEST_SR);
    expect(Array.from(a.left)).toEqual(Array.from(b.left));
    expect(Array.from(a.right)).toEqual(Array.from(b.right));
  });

  it('endpoints are pinned to zero (seamless loop) on both channels', () => {
    const { left, right } = renderMusicLoop(tinyTrack, TEST_SR);
    const n = left.length;
    expect(Math.abs(left[0] - left[n - 1])).toBeLessThan(0.02);
    expect(Math.abs(right[0] - right[n - 1])).toBeLessThan(0.02);
  });
});

describe('MUSIC_TRACKS catalog', () => {
  it('every bed renders stereo to its exact loop length, audible, in range, seamless', () => {
    for (const name of Object.keys(MUSIC_TRACKS) as MusicName[]) {
      const track: MusicTrack = MUSIC_TRACKS[name];
      const { left, right } = renderMusicLoop(track, TEST_SR);
      const len = loopSamples(track, TEST_SR);
      expect(left.length, `${name} length`).toBe(len);
      expect(right.length, `${name} length`).toBe(len);
      expect(allFinite(left) && allFinite(right), `${name} finite`).toBe(true);
      expect(peakOf(left), `${name} not silent`).toBeGreaterThan(0);
      expect(peakOf(left), `${name} L in range`).toBeLessThanOrEqual(1);
      expect(peakOf(right), `${name} R in range`).toBeLessThanOrEqual(1);
      expect(Math.abs(left[0] - left[len - 1]), `${name} seam L`).toBeLessThan(0.02);
      expect(Math.abs(right[0] - right[len - 1]), `${name} seam R`).toBeLessThan(0.02);
    }
  });

  it('gameEnergy shares its BPM with both run themes (the layer must lock)', () => {
    expect(MUSIC_TRACKS.gameEnergy.bpm).toBe(MUSIC_TRACKS.runThemeA.bpm);
    expect(MUSIC_TRACKS.gameEnergy.bpm).toBe(MUSIC_TRACKS.runThemeB.bpm);
  });

  it('no note starts at or after its loop end (tails may wrap; starts may not)', () => {
    for (const name of Object.keys(MUSIC_TRACKS) as MusicName[]) {
      const track: MusicTrack = MUSIC_TRACKS[name];
      const beats = track.bars * track.beatsPerBar;
      for (const part of track.parts) {
        for (const note of part.notes) {
          expect(note.beat, `${name}/${part.id} note start`).toBeGreaterThanOrEqual(0);
          expect(note.beat, `${name}/${part.id} note start`).toBeLessThan(beats);
        }
      }
    }
  });
});
