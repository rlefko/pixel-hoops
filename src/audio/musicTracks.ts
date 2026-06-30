/**
 * The music catalog: longer, multi-section, Gen-IV-inspired beds compiled by the sequencer
 * (./sequencer) and baked to stereo WAV by scripts/generate-sfx.ts. The single source of
 * truth shared by the generator and the unit tests; the runtime plays the baked .wav.
 *
 * Voices use the richer synth (filtered detuned-saw pads, FM electric piano / glockenspiel,
 * soft leads) for warmth beyond plain chiptune. Harmony is authored as data: a chord
 * dictionary + a per-bar progression, expanded by the helpers below, so the changes are
 * reviewable as music theory. Inspired by Go Ichinose / Junichi Masuda: the Ichinose
 * cadence IV-V-iii-vi, ii-V pulls back to I, and the bright I-bVII-I lift.
 *
 * Contexts (see src/feel/music.ts): a warm `menuTheme` for hubs; two rotating run themes
 * (`runThemeA`, `runThemeB`) that play across the whole run; and a key-safe `gameEnergy`
 * percussion layer faded in during the live game.
 */

import type { MusicTrack, Part, Note } from './sequencer';

const A4 = 440;
/** Equal-tempered frequency for a MIDI note (C4 = 60, A4 = 69). */
function midi(m: number): number {
  return A4 * 2 ** ((m - 69) / 12);
}

// Chord qualities as semitone offsets from the chord root.
const QUAL = {
  maj7: [0, 4, 7, 11],
  dom7: [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj: [0, 4, 7],
  min: [0, 3, 7],
  add9: [0, 4, 7, 14],
  sus2: [0, 2, 7],
} as const;
type Quality = keyof typeof QUAL;

/** A chord as absolute semitone offsets from a part root, e.g. chord(5,'maj7') = G over D. */
function chord(rootSemi: number, quality: Quality): number[] {
  return QUAL[quality].map((iv) => rootSemi + iv);
}

/** Tile a one-or-more-bar cell across [fromBar, toBar), offsetting beats per repeat. */
function tile(cell: Note[], cellBars: number, fromBar: number, toBar: number, beatsPerBar: number): Note[] {
  const out: Note[] = [];
  for (let bar = fromBar; bar < toBar; bar += cellBars) {
    for (const n of cell) out.push({ ...n, beat: n.beat + (bar - 0) * beatsPerBar });
  }
  return out;
}

/** Lay block-chord voicings: each bar's chord tones struck on the given beats. */
function comp(
  prog: number[][],
  fromBar: number,
  beatsPerBar: number,
  beats: number[],
  durationBeats: number,
  velocity = 1
): Note[] {
  const out: Note[] = [];
  for (let i = 0; i < prog.length; i++) {
    const barBeat = (fromBar + i) * beatsPerBar;
    for (const b of beats) {
      for (const semitone of prog[i]) {
        out.push({ beat: barBeat + b, durationBeats, semitone, velocity });
      }
    }
  }
  return out;
}

/** Place an explicit melody phrase starting at a bar (beats relative to that bar). */
function phrase(fromBar: number, beatsPerBar: number, notes: Note[]): Note[] {
  return notes.map((n) => ({ ...n, beat: n.beat + fromBar * beatsPerBar }));
}

// =============================================================================
// menuTheme: warm hub/town bed. D major, 80 BPM, 24 bars (~72s). Ichinose cadence.
// =============================================================================

const D_BASS = midi(38); // D2
const D_COMP = midi(50); // D3
const D_LEAD = midi(62); // D4
const D_GLOCK = midi(74); // D5

// Per-bar chord row (8 bars): IVmaj7 - V7 - iiim7 - vim7 - iim7 - V7 - Imaj7 - Imaj7.
const MENU_A: number[][] = [
  chord(5, 'maj7'), // Gmaj7
  chord(7, 'dom7'), // A7
  chord(4, 'm7'), // F#m7
  chord(9, 'm7'), // Bm7
  chord(2, 'm7'), // Em7
  chord(7, 'dom7'), // A7
  chord(0, 'maj7'), // Dmaj7
  chord(0, 'maj7'),
];
// B section reharmonized: vi - IV - ii - V - iii - vi - ii - V (turn back to A).
const MENU_B: number[][] = [
  chord(9, 'm7'),
  chord(5, 'maj7'),
  chord(2, 'm7'),
  chord(7, 'dom7'),
  chord(4, 'm7'),
  chord(9, 'm7'),
  chord(2, 'm7'),
  chord(7, 'dom7'),
];
const MENU_ROOTS = [5, 7, 4, 9, 2, 7, 0, 0];
const MENU_B_ROOTS = [9, 5, 2, 7, 4, 9, 2, 7];

const menuPad: Part = {
  id: 'menuPad',
  rootHz: D_COMP,
  voice: {
    osc: 'sawtooth',
    unison: 5,
    detuneCents: 10,
    antialias: true,
    drive: 1.2,
    filter: { baseHz: 280, peakHz: 2000, q: 1.1, attackMs: 900, decayMs: 1400, sustain: 0.7, releaseMs: 700 },
    env: { attackMs: 120, decayMs: 0, sustain: 1, releaseMs: 600 },
  },
  gain: 0.18,
  pan: 0,
  // Sustained whole-bar root+fifth pads, low in the chord so they sit under the comp.
  notes: tile([{ beat: 0, durationBeats: 4, semitone: -12 }, { beat: 0, durationBeats: 4, semitone: -5 }], 1, 0, 24, 4),
};

const menuEp: Part = {
  id: 'menuEp',
  rootHz: D_COMP,
  voice: {
    osc: 'fm',
    fm: { ratio: 1, index: 2.6, indexDecayMs: 140, indexSustain: 0.04 },
    env: { attackMs: 4, decayMs: 700, sustain: 0.0, releaseMs: 240 },
  },
  gain: 0.5,
  pan: -0.25,
  notes: [
    ...comp(MENU_A, 0, 4, [0, 2], 1.8, 0.9),
    ...comp(MENU_B, 8, 4, [0, 2], 1.8, 0.9),
    ...comp(MENU_A, 16, 4, [0, 2], 1.8, 0.9),
  ],
};

const menuBass: Part = {
  id: 'menuBass',
  rootHz: D_BASS,
  voice: {
    osc: 'sine',
    filter: { baseHz: 120, peakHz: 700, q: 0.8, attackMs: 6, decayMs: 200, sustain: 0.5, releaseMs: 120 },
    env: { attackMs: 6, decayMs: 0, sustain: 0.85, releaseMs: 120 },
    drive: 1.1,
  },
  gain: 0.6,
  pan: 0,
  notes: [...MENU_ROOTS, ...MENU_B_ROOTS, ...MENU_ROOTS].flatMap((root, bar) => [
    { beat: bar * 4 + 0, durationBeats: 1.5, semitone: root },
    { beat: bar * 4 + 2, durationBeats: 1.5, semitone: root + 7 },
  ]),
};

const menuLead: Part = {
  id: 'menuLead',
  rootHz: D_LEAD,
  voice: {
    osc: 'fm',
    fm: { ratio: 2, index: 0.9 },
    vibrato: { semitones: 0.1, rateHz: 5 },
    filter: { baseHz: 600, peakHz: 4200, q: 0.7, attackMs: 30, decayMs: 600, sustain: 0.6, releaseMs: 300 },
    env: { attackMs: 18, decayMs: 200, sustain: 0.5, releaseMs: 320 },
  },
  gain: 0.34,
  pan: 0.22,
  notes: [
    // A: a lyrical line over D major (scale degrees from D4). Rests leave space (calm).
    ...phrase(0, 4, [
      { beat: 0, durationBeats: 1.5, semitone: 9 }, // B
      { beat: 2, durationBeats: 1, semitone: 7 }, // A
      { beat: 3.5, durationBeats: 2, semitone: 4 }, // F#
      { beat: 6, durationBeats: 1.5, semitone: 2 }, // E
      { beat: 9, durationBeats: 1, semitone: 4 },
      { beat: 10.5, durationBeats: 2.5, semitone: 7 },
      { beat: 16, durationBeats: 1.5, semitone: 11 }, // G (over Em)
      { beat: 18, durationBeats: 1, semitone: 9 },
      { beat: 19.5, durationBeats: 2.5, semitone: 7 },
      { beat: 24, durationBeats: 3, semitone: 4 }, // resolve on F# over D
    ]),
    // B: lifted a third, busier, the emotional peak of the loop.
    ...phrase(8, 4, [
      { beat: 0, durationBeats: 1, semitone: 12 },
      { beat: 1.5, durationBeats: 1, semitone: 14 },
      { beat: 3, durationBeats: 2, semitone: 16 },
      { beat: 6, durationBeats: 1.5, semitone: 12 },
      { beat: 8, durationBeats: 1, semitone: 11 },
      { beat: 9.5, durationBeats: 1, semitone: 9 },
      { beat: 11, durationBeats: 2, semitone: 7 },
      { beat: 14, durationBeats: 2, semitone: 9 },
      { beat: 24, durationBeats: 3, semitone: 7 },
    ]),
    // A': restate, ending open.
    ...phrase(16, 4, [
      { beat: 0, durationBeats: 1.5, semitone: 9 },
      { beat: 2, durationBeats: 1, semitone: 7 },
      { beat: 3.5, durationBeats: 2, semitone: 4 },
      { beat: 8, durationBeats: 2, semitone: 2 },
      { beat: 12, durationBeats: 1.5, semitone: 4 },
      { beat: 16, durationBeats: 4, semitone: 0 }, // settle to D
      { beat: 24, durationBeats: 4, semitone: 7 },
    ]),
  ],
};

const menuGlock: Part = {
  id: 'menuGlock',
  rootHz: D_GLOCK,
  voice: {
    osc: 'fm',
    fm: { ratio: 7, index: 5, indexDecayMs: 140, indexSustain: 0 },
    env: { attackMs: 2, decayMs: 500, sustain: 0, releaseMs: 200 },
  },
  gain: 0.16,
  pan: 0.4,
  notes: [
    // Sparse sparkle answering the lead at phrase ends.
    ...phrase(6, 4, [
      { beat: 0, durationBeats: 0.5, semitone: 12 },
      { beat: 0.75, durationBeats: 0.5, semitone: 16 },
      { beat: 1.5, durationBeats: 1, semitone: 19 },
    ]),
    ...phrase(14, 4, [
      { beat: 0, durationBeats: 0.5, semitone: 16 },
      { beat: 0.75, durationBeats: 0.5, semitone: 19 },
      { beat: 1.5, durationBeats: 1, semitone: 24 },
    ]),
    ...phrase(22, 4, [
      { beat: 0, durationBeats: 0.5, semitone: 12 },
      { beat: 0.75, durationBeats: 0.5, semitone: 14 },
      { beat: 1.5, durationBeats: 1.5, semitone: 16 },
    ]),
  ],
};

export const menuTheme: MusicTrack = {
  bpm: 80,
  bars: 24,
  beatsPerBar: 4,
  gain: 0.82,
  parts: [menuPad, menuEp, menuBass, menuLead, menuGlock],
  fx: { reverb: { roomSize: 0.6, damping: 0.5, wet: 0.2, dry: 1 }, busDrive: 1.1 },
};

// =============================================================================
// Run themes: calm, propulsive "route" beds that play the whole run. 104 BPM, 64 bars
// (~2:27). Same BPM so the gameEnergy layer aligns. A is bright A-major; B is a cooler
// E-Dorian contrast so rotating between runs feels fresh.
// =============================================================================

function buildRunTheme(opts: {
  keyMidiBass: number;
  keyMidiComp: number;
  keyMidiLead: number;
  /** 8-bar progressions: chord-tone sets (comp octave) and roots (bass). */
  progA: number[][];
  rootsA: number[];
  /** Lead phrases (16 bars of melody) placed across the form. */
  leadA: Note[];
  leadB: Note[];
  pan: number;
}): MusicTrack {
  const bpb = 4;
  const bars = 64;
  const repeats = bars / 8;

  // Bass: root on 1, root on 2.5, fifth on 4, tiled across the 8-bar progression.
  const bass: Part = {
    id: 'runBass',
    rootHz: midi(opts.keyMidiBass),
    voice: {
      osc: 'sine',
      filter: { baseHz: 110, peakHz: 900, q: 0.9, attackMs: 4, decayMs: 140, sustain: 0.5, releaseMs: 80 },
      env: { attackMs: 4, decayMs: 0, sustain: 0.8, releaseMs: 90 },
      drive: 1.2,
    },
    gain: 0.55,
    notes: Array.from({ length: repeats }, (_, rep) =>
      opts.rootsA.flatMap((root, i) => {
        const bar = rep * 8 + i;
        return [
          { beat: bar * bpb + 0, durationBeats: 1, semitone: root } as Note,
          { beat: bar * bpb + 1.5, durationBeats: 0.5, semitone: root } as Note,
          { beat: bar * bpb + 2.5, durationBeats: 1, semitone: root + 7 } as Note,
          { beat: bar * bpb + 3.5, durationBeats: 0.5, semitone: root + 12 } as Note,
        ];
      })
    ).flat(),
  };

  // Pizzicato/pulse comp: short filtered square chord stabs (off-beats), light.
  const compChords = Array.from({ length: repeats }, () => opts.progA).flat();
  const pulse: Part = {
    id: 'runPulse',
    rootHz: midi(opts.keyMidiComp),
    voice: {
      osc: 'square',
      duty: 0.25,
      antialias: true,
      filter: { baseHz: 500, peakHz: 2600, q: 0.9, attackMs: 2, decayMs: 120, sustain: 0, releaseMs: 60 },
      env: { attackMs: 2, decayMs: 120, sustain: 0, releaseMs: 60 },
    },
    gain: 0.16,
    pan: -0.3,
    notes: comp(compChords, 0, bpb, [1, 2.5, 3.5], 0.4, 0.8),
  };

  // Warm pad underneath (filtered detuned saw), whole-bar root+fifth.
  const pad: Part = {
    id: 'runPad',
    rootHz: midi(opts.keyMidiComp),
    voice: {
      osc: 'sawtooth',
      unison: 5,
      detuneCents: 9,
      antialias: true,
      drive: 1.2,
      filter: { baseHz: 260, peakHz: 1700, q: 1, attackMs: 600, decayMs: 1200, sustain: 0.7, releaseMs: 500 },
      env: { attackMs: 80, decayMs: 0, sustain: 1, releaseMs: 400 },
    },
    gain: 0.12,
    notes: Array.from({ length: repeats }, (_, rep) =>
      opts.rootsA.flatMap((root, i) => {
        const bar = rep * 8 + i;
        return [
          { beat: bar * bpb, durationBeats: 4, semitone: root - 12 } as Note,
          { beat: bar * bpb, durationBeats: 4, semitone: root - 5 } as Note,
        ];
      })
    ).flat(),
  };

  // Light drum kit (filtered noise): kick on 1 & 3, snare backbeat on 2 & 4, hat on 8ths.
  const drums: Part[] = [
    {
      id: 'runKick',
      rootHz: 1500,
      voice: { osc: 'noise', noiseSeed: 3, filter: { baseHz: 70, peakHz: 220, q: 0.9, decayMs: 90, sustain: 0 }, env: { attackMs: 1, decayMs: 90, sustain: 0 }, drive: 1.4 },
      gain: 0.5,
      notes: tile([
        { beat: 0, durationBeats: 0.3, semitone: 0 },
        { beat: 2, durationBeats: 0.3, semitone: 0 },
      ], 1, 0, bars, bpb),
    },
    {
      id: 'runSnare',
      rootHz: 2200,
      voice: { osc: 'noise', noiseSeed: 7, filter: { baseHz: 900, peakHz: 3500, q: 0.8, decayMs: 110, sustain: 0 }, env: { attackMs: 1, decayMs: 110, sustain: 0 } },
      gain: 0.24,
      pan: 0.05,
      notes: tile([
        { beat: 1, durationBeats: 0.25, semitone: 0 },
        { beat: 3, durationBeats: 0.25, semitone: 0 },
      ], 1, 0, bars, bpb),
    },
    {
      id: 'runHat',
      rootHz: 9000,
      voice: { osc: 'noise', noiseSeed: 5, filter: { baseHz: 4000, peakHz: 9000, q: 0.7, decayMs: 35, sustain: 0 }, env: { attackMs: 1, decayMs: 35, sustain: 0 } },
      gain: 0.1,
      pan: -0.15,
      notes: tile(
        Array.from({ length: 8 }, (_, k) => ({ beat: k * 0.5, durationBeats: 0.12, semitone: 0, velocity: k % 2 === 0 ? 1 : 0.6 })),
        1,
        0,
        bars,
        bpb
      ),
    },
  ];

  // Lead: 16 bars of melody (leadA + leadB) placed in blocks 2-3 and 5-6, leaving the
  // intro and a breakdown sparse so the long loop breathes.
  const lead: Part = {
    id: 'runLead',
    rootHz: midi(opts.keyMidiLead),
    voice: {
      osc: 'fm',
      fm: { ratio: 1, index: 2.2, indexDecayMs: 160, indexSustain: 0.1 },
      filter: { baseHz: 700, peakHz: 4000, q: 0.7, attackMs: 20, decayMs: 500, sustain: 0.55, releaseMs: 240 },
      env: { attackMs: 10, decayMs: 240, sustain: 0.5, releaseMs: 260 },
    },
    gain: 0.3,
    pan: opts.pan,
    notes: [
      ...phrase(16, bpb, opts.leadA),
      ...phrase(32, bpb, opts.leadB),
      ...phrase(48, bpb, opts.leadA),
    ],
  };

  // Glockenspiel counter answers the lead, only in the second half (adds development).
  const glock: Part = {
    id: 'runGlock',
    rootHz: midi(opts.keyMidiLead + 12),
    voice: { osc: 'fm', fm: { ratio: 7, index: 4, indexDecayMs: 120, indexSustain: 0 }, env: { attackMs: 2, decayMs: 360, sustain: 0, releaseMs: 160 } },
    gain: 0.12,
    pan: 0.35,
    notes: [
      ...phrase(40, bpb, [
        { beat: 0, durationBeats: 0.5, semitone: 0 },
        { beat: 1, durationBeats: 0.5, semitone: 4 },
        { beat: 2, durationBeats: 1, semitone: 7 },
      ]),
      ...phrase(56, bpb, [
        { beat: 0, durationBeats: 0.5, semitone: 7 },
        { beat: 1, durationBeats: 0.5, semitone: 4 },
        { beat: 2, durationBeats: 1, semitone: 0 },
      ]),
    ],
  };

  return {
    bpm: 104,
    bars,
    beatsPerBar: bpb,
    gain: 0.8,
    parts: [pad, bass, pulse, ...drums, lead, glock],
    fx: {
      reverb: { roomSize: 0.5, damping: 0.55, wet: 0.16, dry: 1 },
      delay: { beats: 0.75, feedback: 0.3, mix: 0.12, damp: 0.4 },
      busDrive: 1.15,
    },
  };
}

// runThemeA: A major, ii-V pull + a I-bVII-I lift. roots are scale degrees from A.
// I - vi - IV - V  |  ii - V - I - (bVII lift) over 8 bars.
const RUN_A_ROOTS = [0, 9, 5, 7, 2, 7, 0, 10];
const RUN_A_PROG = [
  chord(0, 'maj'),
  chord(9, 'm7'),
  chord(5, 'maj7'),
  chord(7, 'dom7'),
  chord(2, 'm7'),
  chord(7, 'dom7'),
  chord(0, 'maj'),
  chord(10, 'maj'), // bVII (G major) bright lift
];

export const runThemeA: MusicTrack = buildRunTheme({
  keyMidiBass: 33, // A1
  keyMidiComp: 57, // A3
  keyMidiLead: 69, // A4
  progA: RUN_A_PROG,
  rootsA: RUN_A_ROOTS,
  pan: 0.2,
  leadA: [
    { beat: 0, durationBeats: 1, semitone: 0 },
    { beat: 1, durationBeats: 1, semitone: 4 },
    { beat: 2, durationBeats: 2, semitone: 7 },
    { beat: 5, durationBeats: 1, semitone: 9 },
    { beat: 6.5, durationBeats: 1.5, semitone: 7 },
    { beat: 8, durationBeats: 1, semitone: 4 },
    { beat: 10, durationBeats: 2, semitone: 2 },
    { beat: 13, durationBeats: 3, semitone: 0 },
    { beat: 24, durationBeats: 1, semitone: 7 },
    { beat: 25, durationBeats: 1, semitone: 9 },
    { beat: 26, durationBeats: 2, semitone: 11 },
    { beat: 29, durationBeats: 3, semitone: 7 },
  ],
  leadB: [
    { beat: 0, durationBeats: 1, semitone: 12 },
    { beat: 1, durationBeats: 1, semitone: 11 },
    { beat: 2, durationBeats: 2, semitone: 9 },
    { beat: 5, durationBeats: 1, semitone: 7 },
    { beat: 6.5, durationBeats: 1.5, semitone: 4 },
    { beat: 8, durationBeats: 2, semitone: 2 },
    { beat: 12, durationBeats: 4, semitone: 0 },
    { beat: 24, durationBeats: 2, semitone: 4 },
    { beat: 27, durationBeats: 1, semitone: 7 },
    { beat: 28, durationBeats: 4, semitone: 9 },
  ],
});

// runThemeB: E Dorian (cooler, contrasting). i - IV - i - bVII | ii - v - i - IV.
const RUN_B_ROOTS = [0, 5, 0, 10, 2, 7, 0, 5];
const RUN_B_PROG = [
  chord(0, 'm7'),
  chord(5, 'maj'),
  chord(0, 'm7'),
  chord(10, 'maj'),
  chord(2, 'm7'),
  chord(7, 'min'),
  chord(0, 'm7'),
  chord(5, 'maj'),
];

export const runThemeB: MusicTrack = buildRunTheme({
  keyMidiBass: 28, // E1
  keyMidiComp: 52, // E3
  keyMidiLead: 64, // E4
  progA: RUN_B_PROG,
  rootsA: RUN_B_ROOTS,
  pan: -0.2,
  leadA: [
    { beat: 0, durationBeats: 1.5, semitone: 7 },
    { beat: 2, durationBeats: 1, semitone: 5 },
    { beat: 3.5, durationBeats: 2, semitone: 3 },
    { beat: 6, durationBeats: 2, semitone: 0 },
    { beat: 9, durationBeats: 1, semitone: 3 },
    { beat: 10.5, durationBeats: 1.5, semitone: 7 },
    { beat: 12, durationBeats: 4, semitone: 5 },
    { beat: 24, durationBeats: 2, semitone: 10 },
    { beat: 27, durationBeats: 1, semitone: 7 },
    { beat: 28, durationBeats: 3, semitone: 5 },
  ],
  leadB: [
    { beat: 0, durationBeats: 1, semitone: 12 },
    { beat: 1.5, durationBeats: 1, semitone: 10 },
    { beat: 3, durationBeats: 2, semitone: 7 },
    { beat: 6, durationBeats: 2, semitone: 5 },
    { beat: 8, durationBeats: 2, semitone: 3 },
    { beat: 12, durationBeats: 4, semitone: 0 },
    { beat: 24, durationBeats: 2, semitone: 7 },
    { beat: 28, durationBeats: 4, semitone: 10 },
  ],
});

// =============================================================================
// gameEnergy: a key-safe percussion + riser layer faded in during the live game. 104 BPM
// (matches the run themes), 8 bars (~18.5s). No pitched content, so it sits under either
// run theme regardless of key.
// =============================================================================

const energyHat: Part = {
  id: 'energyHat',
  rootHz: 10000,
  voice: { osc: 'noise', noiseSeed: 11, filter: { baseHz: 5000, peakHz: 11000, q: 0.7, decayMs: 28, sustain: 0 }, env: { attackMs: 1, decayMs: 28, sustain: 0 } },
  gain: 0.14,
  pan: 0.2,
  notes: tile(
    Array.from({ length: 16 }, (_, k) => ({ beat: k * 0.25, durationBeats: 0.08, semitone: 0, velocity: k % 4 === 0 ? 1 : 0.5 })),
    1,
    0,
    8,
    4
  ),
};

const energyTom: Part = {
  id: 'energyTom',
  rootHz: 1200,
  voice: { osc: 'noise', noiseSeed: 17, filter: { baseHz: 200, peakHz: 600, q: 1.1, decayMs: 120, sustain: 0 }, env: { attackMs: 1, decayMs: 120, sustain: 0 }, drive: 1.3 },
  gain: 0.34,
  pan: -0.2,
  notes: tile([
    { beat: 0, durationBeats: 0.3, semitone: 0 },
    { beat: 1.5, durationBeats: 0.3, semitone: 0 },
    { beat: 2.5, durationBeats: 0.3, semitone: 0 },
  ], 1, 0, 8, 4),
};

const energyRiser: Part = {
  id: 'energyRiser',
  rootHz: 600,
  voice: {
    osc: 'noise',
    noiseSeed: 23,
    freqTo: 4000,
    sweep: 'exp',
    filter: { baseHz: 400, peakHz: 6000, q: 0.8, attackMs: 3600, decayMs: 0, sustain: 1, releaseMs: 200 },
    env: { attackMs: 3600, decayMs: 0, sustain: 1, releaseMs: 200 },
  },
  gain: 0.12,
  notes: [{ beat: 24, durationBeats: 8, semitone: 0 }], // a 2-bar swell into the loop point
};

export const gameEnergy: MusicTrack = {
  bpm: 104,
  bars: 8,
  beatsPerBar: 4,
  gain: 0.7,
  parts: [energyHat, energyTom, energyRiser],
  fx: { reverb: { roomSize: 0.4, damping: 0.6, wet: 0.1, dry: 1 } },
};

export const MUSIC_TRACKS = {
  menuTheme,
  runThemeA,
  runThemeB,
  gameEnergy,
} satisfies Record<string, MusicTrack>;

export type MusicName = keyof typeof MUSIC_TRACKS;
