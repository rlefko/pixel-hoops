/**
 * The music catalog: four fresh, multi-section, Gen-IV-inspired scores compiled by the
 * sequencer (./sequencer) and baked to stereo WAV by scripts/generate-sfx.ts. The single
 * source of truth shared by the generator and the unit tests; the runtime plays the WAVs.
 *
 * The palette emulates the DS-era sampled orchestra entirely in-synth: Karplus-Strong
 * pizzicato, slow-attack supersaw string ensembles, filtered-saw brass and organ, FM
 * electric piano / celesta / glockenspiel, sine flutes with breath chiffs, timpani, and
 * noise drums. Harmony is authored as data: chord rows concatenated into a per-bar
 * timeline (chords + bass roots), so every part derives from the same reviewable score.
 *
 * Craft notes (Ichinose/Masuda x NBA): real intros and outros, A/B/breakdown/lift forms
 * with drum-fill transitions mid-loop (never into the seam), countermelodies entering on
 * repeats, ii-V pulls, borrowed iv/bVI/bVII color, secondary dominants, one +2 semitone
 * lift per anthem, ghost-note funk bass, gospel organ stabs, orchestra hits on 1 and the
 * and-of-3, backbeat claps, and an original pentatonic fanfare hook. Every loop ends
 * wound down and resolved so the wrap never jars.
 *
 * Contexts (see src/feel/music.ts): menuTheme for hubs; two rotating run themes that play
 * across the whole run; and a key-safe gameEnergy percussion layer faded in live. The run
 * themes and gameEnergy share one BPM so the layer always locks (test-enforced).
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
} as const;
type Quality = keyof typeof QUAL;

/** A chord as absolute semitone offsets from a part root, e.g. chord(5,'maj7') = Bb over F. */
function chord(rootSemi: number, quality: Quality): number[] {
  return QUAL[quality].map((iv) => rootSemi + iv);
}

/** Shorthand note: n(beat, durationBeats, semitone, velocity?). Beats local to a bar/phrase. */
function n(beat: number, durationBeats: number, semitone: number, velocity?: number): Note {
  return velocity === undefined ? { beat, durationBeats, semitone } : { beat, durationBeats, semitone, velocity };
}

/** Place an explicit phrase starting at a bar (beats relative to that bar). */
function phrase(fromBar: number, beatsPerBar: number, notes: Note[]): Note[] {
  return notes.map((note) => ({ ...note, beat: note.beat + fromBar * beatsPerBar }));
}

/** Emit notes bar by bar across [fromBar, toBar), offsetting each bar's local beats. */
function perBar(fromBar: number, toBar: number, beatsPerBar: number, make: (bar: number) => Note[]): Note[] {
  const out: Note[] = [];
  for (let bar = fromBar; bar < toBar; bar += 1) {
    for (const note of make(bar)) out.push({ ...note, beat: note.beat + bar * beatsPerBar });
  }
  return out;
}

/** Shift a phrase up by semitones (the +2 "truck driver" lift, and pass reuse). */
function transpose(notes: Note[], semitones: number): Note[] {
  return notes.map((note) =>
    note.semitone === undefined ? note : { ...note, semitone: note.semitone + semitones }
  );
}

/** Scale a phrase's velocities (softened restatements). */
function scaleVel(notes: Note[], factor: number): Note[] {
  return notes.map((note) => ({ ...note, velocity: (note.velocity ?? 1) * factor }));
}

/** Clone melody attacks into a paired breath-chiff noise part (the flute's consonant). */
function chiff(notes: Note[], durationBeats = 0.08, factor = 0.5): Note[] {
  return notes.map((note) => ({
    beat: note.beat,
    durationBeats,
    semitone: 0,
    velocity: (note.velocity ?? 1) * factor,
  }));
}

/** A bar's chord tones as [t1, t2, t3, t4]; triads borrow the octave root as t4. */
function tones4(chordTones: number[]): [number, number, number, number] {
  return [chordTones[0], chordTones[1], chordTones[2], chordTones[3] ?? chordTones[0] + 12];
}

// =============================================================================
// Shared instrument palette (Voice templates). All opt-in synth fields only, so the
// committed SFX render byte-identical. Short-note templates end their envelopes within
// the shortest note they play, so no note ever cuts off audibly mid-decay.
// =============================================================================

type PartVoice = Part['voice'];

/** Sustained string ensemble: slow-attack supersaw behind everything. */
const STRINGS: PartVoice = {
  osc: 'sawtooth',
  unison: 7,
  detuneCents: 14,
  antialias: true,
  drive: 1.15,
  filter: { baseHz: 220, peakHz: 1600, q: 0.8, attackMs: 1200, decayMs: 1600, sustain: 0.65, releaseMs: 900 },
  env: { attackMs: 260, decayMs: 0, sustain: 1, releaseMs: 800 },
};

/** Pizzicato: Karplus-Strong pluck; the string's own ring is the decay, the env just gates. */
const PIZZ: PartVoice = {
  osc: 'pluck',
  pluck: { damp: 0.994, brightness: 0.8 },
  drive: 1.1,
  filter: { baseHz: 380, peakHz: 2400, q: 1.4, attackMs: 1, decayMs: 90, sustain: 0, releaseMs: 40 },
  env: { attackMs: 1, decayMs: 0, sustain: 1, releaseMs: 60 },
};

/** Breathy sine flute; pair with a chiff() noise part when it carries the lead. */
const FLUTE: PartVoice = {
  osc: 'sine',
  vibrato: { semitones: 0.12, rateHz: 5.2 },
  filter: { baseHz: 900, peakHz: 2600, q: 0.7, attackMs: 60, decayMs: 300, sustain: 0.8, releaseMs: 180 },
  env: { attackMs: 45, decayMs: 120, sustain: 0.85, releaseMs: 200 },
};

/** The flute's breath chiff (notes come from chiff() over the melody). */
const BREATH: PartVoice = {
  osc: 'noise',
  noiseSeed: 47,
  filter: { baseHz: 1200, peakHz: 2600, q: 0.8, decayMs: 50, sustain: 0 },
  env: { attackMs: 2, decayMs: 45, sustain: 0 },
};

/** FM electric piano for held comps (notes >= ~0.8s; shorter ones use EP_SHORT). */
const EP: PartVoice = {
  osc: 'fm',
  fm: { ratio: 1, index: 2.6, indexDecayMs: 140, indexSustain: 0.04 },
  env: { attackMs: 4, decayMs: 700, sustain: 0, releaseMs: 240 },
};

/** FM electric piano articulated for short riff notes (ends cleanly at any length). */
const EP_SHORT: PartVoice = {
  osc: 'fm',
  fm: { ratio: 1, index: 2.6, indexDecayMs: 140, indexSustain: 0.04 },
  env: { attackMs: 4, decayMs: 90, sustain: 0.55, releaseMs: 40 },
};

/** Rock/gospel drawbar organ: detuned saw with a Leslie-ish vibrato. */
const ORGAN: PartVoice = {
  osc: 'sawtooth',
  unison: 3,
  detuneCents: 5,
  antialias: true,
  drive: 1.3,
  vibrato: { semitones: 0.08, rateHz: 6.2 },
  filter: { baseHz: 320, peakHz: 1500, q: 0.9, attackMs: 18, decayMs: 500, sustain: 0.7, releaseMs: 160 },
  env: { attackMs: 16, decayMs: 0, sustain: 0.8, releaseMs: 150 },
};

/** Section brass: wide saw stack with an attack blip in the filter. */
const BRASS: PartVoice = {
  osc: 'sawtooth',
  unison: 5,
  detuneCents: 9,
  antialias: true,
  drive: 1.35,
  filter: { baseHz: 420, peakHz: 3400, q: 1.1, attackMs: 25, decayMs: 240, sustain: 0.5, releaseMs: 120 },
  env: { attackMs: 22, decayMs: 120, sustain: 0.75, releaseMs: 140 },
};

/** Orchestra hit: the whole section striking one chord; always doubled by HIT_NOISE. */
const ORCH_HIT: PartVoice = {
  osc: 'sawtooth',
  unison: 7,
  detuneCents: 18,
  antialias: true,
  drive: 1.6,
  filter: { baseHz: 500, peakHz: 5200, q: 1.3, attackMs: 1, decayMs: 320, sustain: 0, releaseMs: 120 },
  env: { attackMs: 1, decayMs: 300, sustain: 0, releaseMs: 110 },
};

/** The hit's percussive air (same beats as the orchestra hit, semitone 0). */
const HIT_NOISE: PartVoice = {
  osc: 'noise',
  noiseSeed: 31,
  filter: { baseHz: 800, peakHz: 4000, q: 1.0, decayMs: 120, sustain: 0 },
  env: { attackMs: 1, decayMs: 120, sustain: 0 },
};

/** Timpani: a dark filtered sine thump, pitched from the part root. */
const TIMPANI: PartVoice = {
  osc: 'sine',
  drive: 1.4,
  filter: { baseHz: 90, peakHz: 320, q: 1.2, attackMs: 1, decayMs: 300, sustain: 0 },
  env: { attackMs: 1, decayMs: 380, sustain: 0, releaseMs: 150 },
};

/** Celesta / music box: soft FM mallet (decays fully within its shortest note). */
const CELESTA: PartVoice = {
  osc: 'fm',
  fm: { ratio: 4, index: 1.6, indexDecayMs: 200, indexSustain: 0 },
  env: { attackMs: 2, decayMs: 260, sustain: 0, releaseMs: 80 },
};

/** Glockenspiel: brighter, higher FM mallet. */
const GLOCK: PartVoice = {
  osc: 'fm',
  fm: { ratio: 7, index: 4, indexDecayMs: 120, indexSustain: 0 },
  env: { attackMs: 2, decayMs: 360, sustain: 0, releaseMs: 160 },
};

/** Funk bass: plucky filtered sine (the proven run-bass patch). */
const FUNK_BASS: PartVoice = {
  osc: 'sine',
  filter: { baseHz: 110, peakHz: 1100, q: 1.2, attackMs: 3, decayMs: 110, sustain: 0.4, releaseMs: 70 },
  env: { attackMs: 3, decayMs: 0, sustain: 0.8, releaseMs: 80 },
  drive: 1.25,
};

/** Sub bass: rounder and darker for the night theme. */
const SUB_BASS: PartVoice = {
  osc: 'sine',
  drive: 1.2,
  filter: { baseHz: 90, peakHz: 500, q: 1.0, attackMs: 4, decayMs: 140, sustain: 0.5, releaseMs: 90 },
  env: { attackMs: 4, decayMs: 0, sustain: 0.8, releaseMs: 80 },
};

/** FM lead for the anthem fanfare hook. */
const LEAD_FM: PartVoice = {
  osc: 'fm',
  fm: { ratio: 1, index: 2.2, indexDecayMs: 160, indexSustain: 0.1 },
  filter: { baseHz: 700, peakHz: 4000, q: 0.7, attackMs: 20, decayMs: 500, sustain: 0.55, releaseMs: 240 },
  env: { attackMs: 10, decayMs: 240, sustain: 0.5, releaseMs: 260 },
};

/** Flugelhorn-ish FM lead: rounder, breathier, for the night hook. */
const FLUGEL: PartVoice = {
  osc: 'fm',
  fm: { ratio: 1, index: 1.6, indexAttackMs: 10, indexDecayMs: 300, indexSustain: 0.25 },
  vibrato: { semitones: 0.08, rateHz: 5 },
  filter: { baseHz: 600, peakHz: 2800, q: 0.8, attackMs: 30, decayMs: 400, sustain: 0.6, releaseMs: 220 },
  env: { attackMs: 25, decayMs: 200, sustain: 0.6, releaseMs: 220 },
};

/** Muted guitar-ish pluck for the night theme's offbeats. */
const MUTE_PLUCK: PartVoice = {
  osc: 'square',
  duty: 0.25,
  antialias: true,
  filter: { baseHz: 400, peakHz: 1800, q: 1.2, attackMs: 1, decayMs: 80, sustain: 0, releaseMs: 40 },
  env: { attackMs: 1, decayMs: 110, sustain: 0, releaseMs: 40 },
};

// Noise drum kit (each entry pairs with a part rootHz = its LFSR clock rate).
const KICK: PartVoice = { osc: 'noise', noiseSeed: 3, filter: { baseHz: 70, peakHz: 220, q: 0.9, decayMs: 90, sustain: 0 }, env: { attackMs: 1, decayMs: 90, sustain: 0 }, drive: 1.4 };
const SNARE: PartVoice = { osc: 'noise', noiseSeed: 7, filter: { baseHz: 900, peakHz: 3500, q: 0.8, decayMs: 110, sustain: 0 }, env: { attackMs: 1, decayMs: 110, sustain: 0 } };
const HAT: PartVoice = { osc: 'noise', noiseSeed: 5, filter: { baseHz: 4000, peakHz: 9000, q: 0.7, decayMs: 35, sustain: 0 }, env: { attackMs: 1, decayMs: 35, sustain: 0 } };
const OPEN_HAT: PartVoice = { osc: 'noise', noiseSeed: 13, filter: { baseHz: 4000, peakHz: 9000, q: 0.7, decayMs: 180, sustain: 0 }, env: { attackMs: 1, decayMs: 180, sustain: 0 } };
const CLAP: PartVoice = { osc: 'noise', noiseSeed: 19, filter: { baseHz: 900, peakHz: 1500, q: 2.5, decayMs: 95, sustain: 0 }, env: { attackMs: 1, decayMs: 95, sustain: 0 } };
const TOM_LOW: PartVoice = { osc: 'noise', noiseSeed: 17, filter: { baseHz: 150, peakHz: 450, q: 1.1, decayMs: 130, sustain: 0 }, env: { attackMs: 1, decayMs: 130, sustain: 0 }, drive: 1.3 };
const TOM_HIGH: PartVoice = { osc: 'noise', noiseSeed: 21, filter: { baseHz: 250, peakHz: 700, q: 1.1, decayMs: 110, sustain: 0 }, env: { attackMs: 1, decayMs: 110, sustain: 0 }, drive: 1.2 };
const BRUSH: PartVoice = { osc: 'noise', noiseSeed: 7, filter: { baseHz: 700, peakHz: 2200, q: 0.8, decayMs: 130, sustain: 0 }, env: { attackMs: 2, decayMs: 130, sustain: 0 } };
const SHAKER: PartVoice = { osc: 'noise', noiseSeed: 37, filter: { baseHz: 6000, peakHz: 12000, q: 0.7, decayMs: 22, sustain: 0 }, env: { attackMs: 1, decayMs: 22, sustain: 0 } };
const STOMP: PartVoice = { osc: 'noise', noiseSeed: 41, filter: { baseHz: 55, peakHz: 160, q: 1.0, decayMs: 130, sustain: 0 }, env: { attackMs: 1, decayMs: 130, sustain: 0 }, drive: 1.5 };
// The energy layer's own hat/clap colors (distinct seeds so the live-game layer never
// phase-stacks with the bed's kit).
const ENERGY_HAT: PartVoice = { osc: 'noise', noiseSeed: 11, filter: { baseHz: 5000, peakHz: 11000, q: 0.7, decayMs: 28, sustain: 0 }, env: { attackMs: 1, decayMs: 28, sustain: 0 } };
const ENERGY_CLAP: PartVoice = { osc: 'noise', noiseSeed: 29, filter: { baseHz: 900, peakHz: 1500, q: 2.5, decayMs: 100, sustain: 0 }, env: { attackMs: 1, decayMs: 100, sustain: 0 } };

// Both run themes share one section grid, so their boundary drum fills land on the
// same bars (never the final bar: nothing may crescendo into the loop seam).
const FILL_BARS = [7, 23, 39, 47, 55, 71];

// =============================================================================
// menuTheme: "Lobby Doors". F major, 88 BPM, 44 bars (2:00). Gen-IV town warmth in an
// arena lobby: flute lead over EP and strings, celesta countermelody on the repeat, a
// low gospel organ, and a laid-back kick/brush groove. Form: intro - A - A2 - B - A' -
// outro, with a borrowed iv (Bbm) at the B section's emotional peak and a resolved
// Fadd9 close so the loop breathes shut.
// Semitones from F: F=0 G=2 A=4 Bb=5 C=7 Db=8 D=9 Eb=10 E=11.
// =============================================================================

const F_BASS = midi(41); // F2
const F_COMP = midi(53); // F3
const F_LEAD = midi(65); // F4
const F_HIGH = midi(77); // F5

// Chord rows, one chord per bar.
const M_INTRO = [chord(0, 'maj7'), chord(5, 'maj7'), chord(2, 'm7'), chord(7, 'dom7')]; // I-IV-ii-V
// I-vi-IV-V-iii-vi-ii-V: the lyrical A row, with a real ii-V pull home in bars 7-8.
const M_A = [chord(0, 'maj7'), chord(9, 'm7'), chord(5, 'maj7'), chord(7, 'dom7'), chord(4, 'm7'), chord(9, 'm7'), chord(2, 'm7'), chord(7, 'dom7')];
// IV - V/vi(A7) - vi - ii - iv(borrowed Bbm!) - I - ii - V: the B row's lift and ache.
const M_B = [chord(5, 'maj7'), chord(4, 'dom7'), chord(9, 'm7'), chord(2, 'm7'), chord(5, 'min'), chord(0, 'maj7'), chord(2, 'm7'), chord(7, 'dom7')];
const M_OUT = [chord(0, 'maj7'), chord(5, 'maj7'), chord(4, 'm7'), chord(9, 'm7'), chord(2, 'm7'), chord(7, 'dom7'), chord(0, 'add9'), chord(0, 'add9')];

// Per-bar timeline: intro 0-3, A 4-11, A2 12-19, B 20-27, A' 28-35, outro 36-43.
const MENU_CHORDS = [...M_INTRO, ...M_A, ...M_A, ...M_B, ...M_A, ...M_OUT];
const MENU_ROOTS = [
  [0, 5, 2, 7],
  [0, 9, 5, 7, 4, 9, 2, 7],
  [0, 9, 5, 7, 4, 9, 2, 7],
  [5, 4, 9, 2, 5, 0, 2, 7],
  [0, 9, 5, 7, 4, 9, 2, 7],
  [0, 5, 4, 9, 2, 7, 0, 0],
].flat();

function menuStringsVel(bar: number): number {
  if (bar < 4) return 0.7;
  if (bar < 36) return 1;
  return 0.8;
}

// The A melody: lyrical, mostly stepwise with space to breathe (32 beats over 8 bars).
const MENU_LEAD_A: Note[] = [
  n(0, 1.5, 4), n(1.5, 0.5, 7), n(2, 2, 9),
  n(4, 1, 9), n(5, 0.5, 7), n(5.5, 1, 4), n(6.5, 1.5, 2),
  n(8, 1.5, 5), n(9.5, 0.5, 9), n(10, 2, 12),
  n(12, 1, 11), n(13, 0.5, 9), n(13.5, 2.5, 7),
  n(16, 1, 4), n(17, 0.5, 7), n(17.5, 2, 11),
  n(20, 1.5, 9), n(21.5, 0.5, 12), n(22, 1, 11), n(23, 1, 7),
  n(24, 1, 2), n(25, 0.5, 5), n(25.5, 1.5, 9), n(27, 1, 7),
  n(28, 1.5, 7), n(29.5, 0.5, 2), n(30, 2, 4),
];
// The B melody, lifted and warmer: the held C# rides the A7 (V/vi), and the held Db is
// the borrowed-iv note, walking down Db-C-Bb-A back into Fmaj7.
const MENU_LEAD_B: Note[] = [
  n(0, 1, 9), n(1, 0.5, 12), n(1.5, 1.5, 14), n(3, 1, 16),
  n(4, 1.5, 16), n(5.5, 0.5, 11), n(6, 2, 8),
  n(8, 2, 9), n(10, 0.5, 7), n(10.5, 1.5, 4),
  n(12, 1, 2), n(13, 0.5, 5), n(13.5, 2.5, 9),
  n(16, 2, 8), n(18, 1, 7), n(19, 1, 5),
  n(20, 2, 4), n(22, 1, 0),
  n(24, 1.5, 2), n(25.5, 0.5, 4), n(26, 1, 5),
  n(28, 1, 7), n(29, 0.5, 11), n(29.5, 2.5, 9),
];
// A' restates A but climbs at the end instead of settling, handing off to the outro.
const MENU_LEAD_A2: Note[] = [
  ...MENU_LEAD_A.filter((note) => note.beat < 24),
  n(24, 1, 2), n(25, 0.5, 4), n(25.5, 0.5, 7), n(26, 2, 12),
  n(28, 1, 11), n(29.5, 0.5, 9), n(30, 2, 7),
];
const menuFluteNotes: Note[] = [
  ...phrase(4, 4, MENU_LEAD_A),
  ...phrase(12, 4, MENU_LEAD_A),
  ...phrase(20, 4, MENU_LEAD_B),
  ...phrase(28, 4, MENU_LEAD_A2),
];

// A distant three-note horn run + landing, a soft pre-echo of runThemeA's fanfare pickup:
// arena PA bleeding into the lobby.
const MENU_HORN_ECHO: Note[] = [
  n(3, 1 / 3, 0, 0.7), n(3 + 1 / 3, 1 / 3, 2, 0.75), n(3 + 2 / 3, 1 / 3, 4, 0.8), n(4, 2, 9, 0.8),
];

// Celesta answers on the repeat sections only (the classic Ichinose "new voice on the
// restatement"): ascending chord-tone triples at phrase tails.
const MENU_SPARKLE: Array<[bar: number, semis: number[]]> = [
  [12, [0, 2, 4]], [14, [5, 7, 9]], [16, [4, 7, 11]], [18, [2, 5, 9]],
  [28, [0, 2, 4]], [30, [5, 7, 9]], [32, [4, 7, 11]], [34, [2, 5, 9]],
];

const menuParts: Part[] = [
  {
    id: 'menuStrings',
    rootHz: F_COMP,
    voice: STRINGS,
    gain: 0.16,
    notes: perBar(0, 44, 4, (bar) =>
      MENU_CHORDS[bar].map((semi) => n(0, 4, semi, menuStringsVel(bar)))
    ),
  },
  {
    id: 'menuEp',
    rootHz: F_COMP,
    voice: EP,
    gain: 0.42,
    pan: -0.2,
    notes: [
      // Intro: pedaled 8th-note broken chords, alone with the strings.
      ...perBar(0, 4, 4, (bar) => {
        const [t1, t2, t3, t4] = tones4(MENU_CHORDS[bar]);
        return [t1, t2, t3, t4, t1 + 12, t4, t3, t2].map((semi, k) => n(k * 0.5, 1, semi, 0.75));
      }),
      // Then the laid-back comp: downbeat and the and-of-2 push.
      ...perBar(4, 44, 4, (bar) => [
        ...MENU_CHORDS[bar].map((semi) => n(0, 1.8, semi, 0.85)),
        ...MENU_CHORDS[bar].map((semi) => n(2.5, 1.2, semi, 0.7)),
      ]),
    ],
  },
  {
    id: 'menuBass',
    rootHz: F_BASS,
    voice: FUNK_BASS,
    gain: 0.55,
    notes: [
      ...perBar(2, 42, 4, (bar) => {
        const root = MENU_ROOTS[bar];
        const next = MENU_ROOTS[(bar + 1) % 44];
        return [n(0, 1.75, root, 1), n(2, 1, root + 7, 0.85), n(3.5, 0.5, next - 1, 0.6)];
      }),
      ...perBar(42, 44, 4, () => [n(0, 4, 0, 0.8)]),
    ],
  },
  {
    id: 'menuOrgan',
    rootHz: F_COMP,
    voice: ORGAN,
    gain: 0.08,
    pan: 0.18,
    notes: perBar(12, 36, 4, (bar) => [
      ...MENU_CHORDS[bar].map((semi) => n(1.5, 0.5, semi, 0.8)),
      ...MENU_CHORDS[bar].map((semi) => n(3.5, 0.4, semi, 0.7)),
    ]),
  },
  {
    id: 'menuPizz',
    rootHz: F_COMP,
    voice: PIZZ,
    gain: 0.12,
    pan: -0.3,
    notes: perBar(12, 36, 4, (bar) => {
      const [t1, t2, t3] = tones4(MENU_CHORDS[bar]);
      return [n(1.5, 0.3, t1, 0.75), n(1.5, 0.3, t3, 0.75), n(3.5, 0.3, t2, 0.75), n(3.5, 0.3, t3, 0.75)];
    }),
  },
  { id: 'menuFlute', rootHz: F_LEAD, voice: FLUTE, gain: 0.3, pan: 0.15, notes: menuFluteNotes },
  { id: 'menuBreath', rootHz: 1600, voice: BREATH, gain: 0.05, pan: 0.15, notes: chiff(menuFluteNotes) },
  {
    id: 'menuCelesta',
    rootHz: F_HIGH,
    voice: CELESTA,
    gain: 0.14,
    pan: 0.35,
    notes: MENU_SPARKLE.flatMap(([bar, semis]) =>
      semis.map((semi, k) => n(bar * 4 + 2 + k * 0.5, 0.5, semi, 0.7))
    ),
  },
  {
    id: 'menuHorns',
    rootHz: F_LEAD,
    voice: { ...BRASS, env: { ...BRASS.env, releaseMs: 400 } },
    gain: 0.06,
    pan: -0.5,
    notes: [...phrase(18, 4, MENU_HORN_ECHO), ...phrase(34, 4, MENU_HORN_ECHO)],
  },
  {
    id: 'menuGlock',
    rootHz: F_HIGH,
    voice: GLOCK,
    gain: 0.12,
    pan: 0.4,
    notes: [
      ...[11, 19, 35].flatMap((bar) => [7, 11, 14].map((semi, k) => n(bar * 4 + 2 + k * 0.5, 0.55, semi, 0.8))),
      ...[11, 14, 19].map((semi, k) => n(27 * 4 + 2 + k * 0.5, 0.55, semi, 0.8)),
      ...[0, 4, 7].map((semi, k) => n(41 * 4 + k * 0.5, 0.6, semi, 0.8)), // the close
    ],
  },
  {
    id: 'menuKick',
    rootHz: 1400,
    voice: KICK,
    gain: 0.24,
    notes: perBar(4, 40, 4, () => [n(0, 0.3, 0, 1), n(2.5, 0.3, 0, 0.7)]),
  },
  {
    id: 'menuBrush',
    rootHz: 1200,
    voice: BRUSH,
    gain: 0.1,
    pan: 0.06,
    notes: perBar(4, 40, 4, () => [n(1, 0.25, 0, 0.9), n(3, 0.25, 0, 0.8)]),
  },
  {
    id: 'menuShaker',
    rootHz: 8000,
    voice: SHAKER,
    gain: 0.05,
    pan: -0.2,
    notes: perBar(20, 36, 4, () => Array.from({ length: 8 }, (_, k) => n(k * 0.5, 0.12, 0, 0.5))),
  },
];

export const menuTheme: MusicTrack = {
  bpm: 88,
  bars: 44,
  beatsPerBar: 4,
  gain: 0.82,
  parts: menuParts,
  fx: { reverb: { roomSize: 0.62, damping: 0.5, wet: 0.22, dry: 1 }, busDrive: 1.1 },
};

// =============================================================================
// runThemeA: "Banner Day". G major, 112 BPM, 88 bars (3:09). The bright anthem: an
// original pentatonic fanfare hook with a triplet pickup, orchestra hits on 1 and the
// and-of-3, ghost-note funk bass, gospel organ, brass stabs, and claps. Form: intro -
// A1 - A2 - B1 - B2 - breakdown - A' (flute countermelody) - +2 lift (two passes,
// E7->D7 pivot home) - return - resolved Gadd9 outro. Drum fills mark every section
// boundary (bars 7/23/39/47/55/71) and never the final bar.
// Semitones from G: G=0 A=2 B=4 C=5 D=7 E=9 F=10 F#=11.
// =============================================================================

const G_BASS = midi(31); // G1
const G_COMP = midi(55); // G3
const G_LEAD = midi(67); // G4
const G_HIGH = midi(79); // G5
const G_TIMP = midi(43); // G2

const R_INTRO = [chord(0, 'maj'), chord(0, 'maj'), chord(5, 'maj7'), chord(5, 'maj7'), chord(0, 'maj'), chord(0, 'maj'), chord(2, 'm7'), chord(7, 'dom7')];
// I-iii-IV-V-vi-ii-V-I: the groove row, with a real ii-V (Am7-D7) pull home.
const R_A = [chord(0, 'maj'), chord(4, 'm7'), chord(5, 'maj7'), chord(7, 'dom7'), chord(9, 'm7'), chord(2, 'm7'), chord(7, 'dom7'), chord(0, 'maj')];
// I - bVII(F!) - IV - I - vi - V/V(A7!) - V - I: the fanfare row's borrowed lift and
// secondary dominant.
const R_B = [chord(0, 'maj'), chord(10, 'maj'), chord(5, 'maj'), chord(0, 'maj'), chord(9, 'm7'), chord(2, 'dom7'), chord(7, 'dom7'), chord(0, 'maj')];
const R_BRK = [chord(0, 'maj'), chord(0, 'maj'), chord(9, 'm7'), chord(9, 'm7'), chord(5, 'maj7'), chord(5, 'maj7'), chord(2, 'm7'), chord(7, 'dom7')];
// The +2 truck-driver lift: R_B in A major (voicings octave-folded to stay in register).
const R_LIFT1 = [chord(2, 'maj'), chord(0, 'maj'), chord(7, 'maj'), chord(2, 'maj'), chord(11, 'm7'), chord(4, 'dom7'), chord(9, 'dom7'), chord(2, 'maj')];
// Second lift pass ends E7 -> D7: D7 is IV of A AND V7 of G, the pivot that lands home.
const R_LIFT2 = [...R_LIFT1.slice(0, 7), chord(7, 'dom7')];
const R_RET2 = [chord(0, 'maj'), chord(5, 'maj7'), chord(0, 'maj'), chord(5, 'maj7'), chord(2, 'm7'), chord(7, 'dom7'), chord(0, 'add9'), chord(0, 'add9')];

// Per-bar timeline: intro 0-7, A1 8-15, A2 16-23, B1 24-31, B2 32-39, breakdown 40-47,
// A' 48-55, lift1 56-63, lift2 64-71, return 72-79, outro 80-87.
const RUNA_CHORDS = [...R_INTRO, ...R_A, ...R_A, ...R_B, ...R_B, ...R_BRK, ...R_A, ...R_LIFT1, ...R_LIFT2, ...R_B, ...R_RET2];
const RUNA_ROOTS = [
  [0, 0, 5, 5, 0, 0, 2, 7],
  [0, 4, 5, 7, 9, 2, 7, 0],
  [0, 4, 5, 7, 9, 2, 7, 0],
  [0, 10, 5, 0, 9, 2, 7, 0],
  [0, 10, 5, 0, 9, 2, 7, 0],
  [0, 0, 9, 9, 5, 5, 2, 7],
  [0, 4, 5, 7, 9, 2, 7, 0],
  [2, 0, 7, 2, 11, 4, 9, 2],
  [2, 0, 7, 2, 11, 4, 9, 7],
  [0, 10, 5, 0, 9, 2, 7, 0],
  [0, 5, 0, 5, 2, 7, 0, 0],
].flat();

// The hot blocks (fanfare/lift sections) share arrangement: hits, claps, 16ths.
const RUNA_HOT: Array<[from: number, to: number]> = [[24, 40], [56, 72]];
// Groove blocks: full kit + comp, lead-free or countermelody.
const RUNA_GROOVE: Array<[from: number, to: number]> = [[8, 24], [48, 56], [72, 80]];
const RUNA_HIT_BARS = [24, 28, 32, 36, 56, 60, 64, 68];

// The original fanfare hook (32 beats over one 8-bar R_B row): a rising "da-da-da-DAAA"
// pentatonic shape that overshoots to the sixth, a chantable D-D-D answer, a climb to
// the A5 peak over the V/V, then a balanced descent home. Its triplet pickup lives in
// the preceding bar (and again mid-pass before beat 16).
const HOOK_PICKUP: Note[] = [n(3, 1 / 3, 0, 0.8), n(3 + 1 / 3, 1 / 3, 2, 0.85), n(3 + 2 / 3, 1 / 3, 4, 0.9)];
const HOOK_PASS1: Note[] = [
  n(0, 1.5, 9, 1), n(1.5, 0.5, 7, 0.9), n(2, 1.5, 12, 1), n(3.5, 0.5, 9, 0.85),
  n(4, 1, 7, 0.9), n(5, 0.5, 5, 0.8), n(5.5, 0.5, 2, 0.8), n(6, 1.5, 0, 0.85),
  n(8, 0.5, 7, 0.95), n(8.5, 0.5, 7, 0.9), n(9, 0.75, 7, 1),
  n(10, 0.5, 9, 0.9), n(10.5, 0.5, 7, 0.85), n(11, 1, 4, 0.85),
  n(12, 0.5, 2, 0.8), n(12.5, 0.5, 4, 0.85), n(13, 2, 7, 0.95),
  n(15, 1 / 3, 0, 0.8), n(15 + 1 / 3, 1 / 3, 2, 0.85), n(15 + 2 / 3, 1 / 3, 4, 0.9),
  n(16, 1.5, 9, 1), n(17.5, 0.5, 12, 0.9), n(18, 1, 14, 0.95), n(19, 1, 12, 0.9),
  n(20, 2, 14, 1), // the peak: A5 held over the A7 secondary dominant
  n(22, 0.5, 16, 0.9), n(22.5, 1.5, 14, 0.85),
  n(24, 1, 11, 0.95), n(25, 0.5, 9, 0.85), n(25.5, 0.5, 7, 0.85), n(26, 1, 4, 0.85), n(27, 1, 2, 0.8),
  n(28, 2.5, 0, 0.9),
];
// Pass 2 swaps the settled ending for a climb to G5 that rings over the boundary fill.
const HOOK_PASS2: Note[] = [
  ...HOOK_PASS1.slice(0, -1),
  n(28, 1, 7, 0.9), n(29, 0.5, 9, 0.9), n(29.5, 0.5, 11, 0.95), n(30, 2, 12, 1),
];

// Flute countermelody for A' (guide tones over R_A) and its breakdown teaser.
const RUNA_COUNTER: Note[] = [
  n(0, 3, 4, 0.8), n(3, 1, 2, 0.8), n(4, 4, 2, 0.8),
  n(8, 2, 4, 0.8), n(10, 2, 7, 0.8), n(12, 3, 5, 0.8), n(15, 1, 4, 0.8),
  n(16, 4, 7, 0.8), n(20, 2, 5, 0.8), n(22, 2, 9, 0.8),
  n(24, 3, 11, 0.8), n(27, 1, 9, 0.8), n(28, 3.5, 7, 0.8),
];
const RUNA_TEASER: Note[] = [
  n(0, 1.5, 9, 0.6), n(1.5, 0.5, 7, 0.55), n(2, 1.5, 12, 0.6),
  n(4, 1, 7, 0.55), n(5.5, 0.5, 4, 0.5), n(6, 1.5, 2, 0.5),
];

// The snare fill cell used at every section boundary.
const SNARE_FILL: Note[] = [n(2, 0.25, 0, 0.6), n(2.5, 0.25, 0, 0.7), n(3, 0.25, 0, 0.8), n(3.25, 0.25, 0, 0.85), n(3.5, 0.25, 0, 0.95), n(3.75, 0.25, 0, 1)];

function runaStringsVel(bar: number): number {
  if (bar < 8) return 0.7;
  if (bar < 24) return 0.85;
  if (bar < 40) return 1;
  if (bar < 48) return 0.9;
  if (bar < 56) return 0.85;
  if (bar < 72) return 1;
  if (bar < 80) return 0.85;
  return 0.8;
}

/** The ghost-note 16th funk cell: root anchors, ghosted repeats, a b7 lean, and a
 *  chromatic approach into the next bar's root. */
function funkCell(root: number, next: number): Note[] {
  return [
    n(0, 0.5, root, 1), n(0.75, 0.25, root, 0.45),
    n(1, 0.5, root + 7, 0.9), n(1.75, 0.25, root + 12, 0.5),
    n(2, 0.5, root, 1), n(2.75, 0.25, root + 10, 0.45),
    n(3, 0.5, root + 7, 0.85), n(3.75, 0.25, next - 1, 0.7),
  ];
}

const runaParts: Part[] = [
  {
    id: 'runStrings',
    rootHz: G_COMP,
    voice: STRINGS,
    gain: 0.1,
    notes: perBar(0, 88, 4, (bar) =>
      RUNA_CHORDS[bar].map((semi) => n(0, 4, semi, runaStringsVel(bar)))
    ),
  },
  {
    id: 'runBass',
    rootHz: G_BASS,
    voice: FUNK_BASS,
    gain: 0.55,
    notes: [
      ...perBar(4, 8, 4, (bar) => [n(0, 1.75, RUNA_ROOTS[bar], 0.9), n(2, 1.5, RUNA_ROOTS[bar] + 7, 0.8)]),
      ...[[8, 40] as const, [48, 80] as const].flatMap(([from, to]) =>
        perBar(from, to, 4, (bar) => funkCell(RUNA_ROOTS[bar], RUNA_ROOTS[(bar + 1) % 88]))
      ),
      ...perBar(40, 48, 4, (bar) => [
        n(0, 1.5, RUNA_ROOTS[bar], 0.95), n(2, 1, RUNA_ROOTS[bar] + 7, 0.8), n(3.5, 0.5, RUNA_ROOTS[(bar + 1) % 88] - 1, 0.6),
      ]),
      ...perBar(80, 86, 4, (bar) => [n(0, 2, RUNA_ROOTS[bar], 0.9), n(2, 2, RUNA_ROOTS[bar] + 7, 0.75)]),
      ...perBar(86, 88, 4, () => [n(0, 4, 0, 0.8)]),
    ],
  },
  {
    id: 'runPizz',
    rootHz: G_COMP,
    voice: PIZZ,
    gain: 0.14,
    pan: -0.3,
    notes: [
      // 8th-note ostinato in the groove blocks (plus the intro from bar 4)...
      ...[[4, 24] as const, [48, 56] as const, [72, 80] as const].flatMap(([from, to]) =>
        perBar(from, to, 4, (bar) => {
          const [t1, t2, t3] = tones4(RUNA_CHORDS[bar]);
          return [t1, t3, t1 + 12, t3, t2, t3, t1 + 12, t3].map((semi, k) =>
            n(k * 0.5, 0.35, semi, k % 2 === 0 ? 0.9 : 0.6)
          );
        })
      ),
      // ...doubling to 16th arps in the hot blocks (the Gen IV subdivision shift).
      ...RUNA_HOT.flatMap(([from, to]) =>
        perBar(from, to, 4, (bar) => {
          const [t1, t2, t3, t4] = tones4(RUNA_CHORDS[bar]);
          return [
            ...[t1, t2, t3, t4].map((semi, k) => n(k * 0.25, 0.22, semi, 0.8)),
            ...[t3, t2, t4, t1 + 12].map((semi, k) => n(2 + k * 0.25, 0.22, semi, 0.8)),
          ];
        })
      ),
    ],
  },
  {
    id: 'runEp',
    rootHz: G_COMP,
    voice: EP,
    gain: 0.4,
    pan: -0.22,
    notes: [
      ...RUNA_GROOVE.flatMap(([from, to]) =>
        perBar(from, to, 4, (bar) => [
          ...RUNA_CHORDS[bar].map((semi) => n(0, 1.5, semi, 0.85)),
          ...RUNA_CHORDS[bar].map((semi) => n(2.5, 1.4, semi, 0.7)),
        ])
      ),
      ...perBar(40, 48, 4, (bar) => RUNA_CHORDS[bar].map((semi) => n(0, 2.5, semi, 0.55))),
      ...perBar(80, 88, 4, (bar) => RUNA_CHORDS[bar].map((semi) => n(0, 3, semi, 0.6))),
    ],
  },
  {
    id: 'runOrgan',
    rootHz: G_COMP,
    voice: ORGAN,
    gain: 0.09,
    pan: 0.15,
    notes: [
      ...[[16, 24] as const, [48, 56] as const, [72, 80] as const].flatMap(([from, to]) =>
        perBar(from, to, 4, (bar) => [
          ...RUNA_CHORDS[bar].map((semi) => n(1.5, 0.5, semi, 0.8)),
          ...RUNA_CHORDS[bar].map((semi) => n(3.5, 0.4, semi, 0.7)),
        ])
      ),
      // The gospel push in the hot blocks: on the downbeat and the and-of-2.
      ...RUNA_HOT.flatMap(([from, to]) =>
        perBar(from, to, 4, (bar) => [
          ...RUNA_CHORDS[bar].map((semi) => n(0, 1, semi, 0.9)),
          ...RUNA_CHORDS[bar].map((semi) => n(2.5, 0.5, semi, 0.8)),
        ])
      ),
    ],
  },
  {
    id: 'runBrass',
    rootHz: G_LEAD,
    voice: BRASS,
    gain: 0.11,
    pan: -0.2,
    // Top-two chord tones answering on the offbeats; tacet through the pivot bars 70-71
    // and the whole return so the hook's soft restatement has air.
    notes: [[24, 40] as const, [56, 70] as const].flatMap(([from, to]) =>
      perBar(from, to, 4, (bar) => {
        const tones = RUNA_CHORDS[bar].slice(-2);
        return [
          ...tones.map((semi) => n(1.5, 0.4, semi, 0.85)),
          ...tones.map((semi) => n(3.25, 0.3, semi, 0.8)),
        ];
      })
    ),
  },
  {
    id: 'runOrchHit',
    rootHz: G_COMP,
    voice: ORCH_HIT,
    gain: 0.2,
    notes: RUNA_HIT_BARS.flatMap((bar) =>
      [...RUNA_CHORDS[bar], RUNA_CHORDS[bar][0] - 12].flatMap((semi) => [
        n(bar * 4, 0.6, semi, 1),
        n(bar * 4 + 2.5, 0.6, semi, 0.9),
      ])
    ),
  },
  {
    id: 'runHitNoise',
    rootHz: 3000,
    voice: HIT_NOISE,
    gain: 0.09,
    notes: RUNA_HIT_BARS.flatMap((bar) => [n(bar * 4, 0.6, 0, 1), n(bar * 4 + 2.5, 0.6, 0, 0.9)]),
  },
  {
    id: 'runClap',
    rootHz: 1000,
    voice: CLAP,
    gain: 0.14,
    pan: 0.1,
    notes: [
      ...RUNA_HOT.flatMap(([from, to]) =>
        perBar(from, to, 4, (bar) => [
          n(1, 0.2, 0, 1),
          n(3, 0.2, 0, 1),
          // The and-of-4 lift every 4th bar, pushing into the next phrase.
          ...((bar - 3) % 4 === 0 ? [n(3.5, 0.2, 0, 0.6)] : []),
        ])
      ),
      ...perBar(72, 80, 4, () => [n(1, 0.2, 0, 0.7), n(3, 0.2, 0, 0.7)]),
    ],
  },
  {
    id: 'runLead',
    rootHz: G_LEAD,
    voice: LEAD_FM,
    gain: 0.3,
    pan: 0.2,
    notes: [
      ...phrase(23, 4, HOOK_PICKUP),
      ...phrase(24, 4, HOOK_PASS1),
      ...phrase(31, 4, HOOK_PICKUP),
      ...phrase(32, 4, HOOK_PASS2),
      ...phrase(55, 4, transpose(HOOK_PICKUP, 2)),
      ...phrase(56, 4, transpose(HOOK_PASS1, 2)),
      ...phrase(63, 4, transpose(HOOK_PICKUP, 2)),
      ...phrase(64, 4, transpose(HOOK_PASS2, 2)),
      ...phrase(71, 4, scaleVel(HOOK_PICKUP, 0.85)),
      ...phrase(72, 4, scaleVel(HOOK_PASS1, 0.85)),
    ],
  },
  {
    id: 'runFlute',
    rootHz: G_HIGH,
    voice: FLUTE,
    gain: 0.16,
    pan: -0.25,
    notes: [...phrase(44, 4, RUNA_TEASER), ...phrase(48, 4, RUNA_COUNTER)],
  },
  {
    id: 'runGlock',
    rootHz: G_HIGH,
    voice: GLOCK,
    gain: 0.12,
    pan: 0.35,
    notes: [
      ...[31, 39].flatMap((bar) => [12, 14, 19].map((semi, k) => n(bar * 4 + 2 + k * 0.5, 0.5, semi, 0.8))),
      ...[63, 71].flatMap((bar) => [14, 16, 21].map((semi, k) => n(bar * 4 + 2 + k * 0.5, 0.5, semi, 0.8))),
    ],
  },
  {
    id: 'runTimpani',
    rootHz: G_TIMP,
    voice: TIMPANI,
    gain: 0.3,
    notes: [
      n(0, 1, 0, 0.9), n(8 * 4, 1, 0, 0.8), n(24 * 4, 1, 0, 0.9),
      // The roll onto the new tonic ahead of the +2 lift (strokes overlap and ring).
      n(55 * 4 + 3, 0.9, 2, 0.5), n(55 * 4 + 3.25, 0.9, 2, 0.6), n(55 * 4 + 3.5, 0.9, 2, 0.75), n(55 * 4 + 3.75, 0.9, 2, 0.9),
      n(56 * 4, 1, 2, 1), n(72 * 4, 1, 0, 0.9), n(80 * 4, 1, 0, 0.7),
    ],
  },
  {
    id: 'runKick',
    rootHz: 1500,
    voice: KICK,
    gain: 0.5,
    notes: [
      ...perBar(6, 8, 4, () => [n(0, 0.3, 0, 0.8), n(2, 0.3, 0, 0.8)]),
      ...perBar(8, 86, 4, (bar) => [
        n(0, 0.3, 0, 1),
        n(2, 0.3, 0, 0.95),
        ...(RUNA_HOT.some(([from, to]) => bar >= from && bar < to) ? [n(2.75, 0.3, 0, 0.7)] : []),
      ]),
    ],
  },
  {
    id: 'runSnare',
    rootHz: 2200,
    voice: SNARE,
    gain: 0.24,
    pan: 0.05,
    notes: [
      ...perBar(8, 40, 4, (bar) => [n(1, 0.25, 0, bar < 24 ? 0.85 : 1), n(3, 0.25, 0, bar < 24 ? 0.85 : 1)]),
      ...perBar(48, 84, 4, (bar) => {
        const vel = bar >= 80 ? 0.65 : bar >= 72 ? 0.85 : bar >= 56 ? 1 : 0.85;
        return [n(1, 0.25, 0, vel), n(3, 0.25, 0, vel)];
      }),
      ...FILL_BARS.flatMap((bar) => phrase(bar, 4, SNARE_FILL)),
    ],
  },
  {
    id: 'runTomLow',
    rootHz: 1200,
    voice: TOM_LOW,
    gain: 0.3,
    pan: -0.2,
    notes: [
      ...phrase(7, 4, [n(3.5, 0.3, 0, 0.9), n(3.75, 0.3, 0, 1)]),
      ...[23, 39].flatMap((bar) => phrase(bar, 4, [n(3.5, 0.3, 0, 0.9), n(3.75, 0.3, 0, 1)])),
      ...phrase(47, 4, [n(2.5, 0.3, 0, 0.7), n(3, 0.3, 0, 0.85), n(3.5, 0.3, 0, 1)]),
      ...phrase(55, 4, [n(3.75, 0.3, 0, 1)]),
      ...phrase(71, 4, [n(3.5, 0.3, 0, 0.9), n(3.75, 0.3, 0, 1)]),
    ],
  },
  {
    id: 'runTomHigh',
    rootHz: 1400,
    voice: TOM_HIGH,
    gain: 0.22,
    pan: 0.15,
    notes: [
      ...[23, 39].flatMap((bar) => phrase(bar, 4, [n(3, 0.3, 0, 0.8)])),
      ...phrase(55, 4, [n(3.25, 0.3, 0, 0.8)]),
      ...phrase(71, 4, [n(3, 0.3, 0, 0.8), n(3.25, 0.3, 0, 0.85)]),
    ],
  },
  {
    id: 'runHat',
    rootHz: 9000,
    voice: HAT,
    gain: 0.1,
    pan: -0.15,
    notes: [
      ...[[6, 24] as const, [48, 56] as const, [72, 80] as const].flatMap(([from, to]) =>
        perBar(from, to, 4, () =>
          Array.from({ length: 8 }, (_, k) => n(k * 0.5, 0.12, 0, k % 2 === 0 ? 1 : 0.55))
        )
      ),
      ...RUNA_HOT.flatMap(([from, to]) =>
        perBar(from, to, 4, () =>
          Array.from({ length: 16 }, (_, k) =>
            n(k * 0.25, 0.08, 0, k % 4 === 0 ? 1 : k % 2 === 0 ? 0.65 : 0.45)
          )
        )
      ),
    ],
  },
  {
    id: 'runOpenHat',
    rootHz: 9000,
    voice: OPEN_HAT,
    gain: 0.08,
    pan: -0.1,
    notes: [15, 23, 31, 39, 55, 63, 71, 79].map((bar) => n(bar * 4 + 3.5, 0.4, 0, 0.7)),
  },
];

export const runThemeA: MusicTrack = {
  bpm: 112,
  bars: 88,
  beatsPerBar: 4,
  gain: 0.8,
  parts: runaParts,
  fx: {
    reverb: { roomSize: 0.52, damping: 0.55, wet: 0.17, dry: 1 },
    delay: { beats: 0.75, feedback: 0.28, mix: 0.1, damp: 0.45 },
    busDrive: 1.15,
  },
};

// =============================================================================
// runThemeB: "Neon Court". C Dorian, 112 BPM, 88 bars (3:09). The night-game contrast:
// halftime boom-bap backbeat, sub bass, muted offbeat plucks, an EP minor-pentatonic
// riff, and a flugelhorn hook that lifts into the relative major (Eb) - terracing
// instead of a truck-driver, with Bb7 (V7 of Eb) as the pivot. Straight grid (swing
// would flam against gameEnergy's straight 16ths). Fewer orchestra hits: night
// restraint. Ends resolved on a Cm add9.
// Semitones from C: C=0 D=2 Eb=3 F=5 G=7 Ab=8 A=9 Bb=10.
// =============================================================================

const C_SUB = midi(36); // C2
const C_COMP = midi(48); // C3
const C_EP = midi(60); // C4
const C_FLUTE = midi(72); // C5
const C_BELL = midi(84); // C6

// Cm add9 voicing for the final resolution.
const CM_ADD9 = [0, 3, 7, 14];

const B_INTRO = [chord(0, 'm7'), chord(0, 'm7'), chord(8, 'maj7'), chord(10, 'maj'), chord(0, 'm7'), chord(0, 'm7'), chord(8, 'maj7'), chord(10, 'maj')];
// i-i-IV7-IV7-bVII-bIII-ii-v: the Dorian groove row (F7 is Dorian's bright major IV).
const B_A = [chord(0, 'm7'), chord(0, 'm7'), chord(5, 'dom7'), chord(5, 'dom7'), chord(10, 'maj7'), chord(3, 'maj7'), chord(2, 'm7'), chord(7, 'min')];
// The same row steering into Eb: its last bar becomes Bb7 = V7 of Eb, the pivot.
const B_A_PIVOT = [...B_A.slice(0, 7), chord(10, 'dom7')];
// The relative-major lift, in Eb: I-IV-I-V-vi-IV-ii-V7 with a real ii-V (Fm7-Bb7).
const B_EB = [chord(3, 'maj'), chord(8, 'maj'), chord(3, 'maj'), chord(10, 'maj'), chord(0, 'm7'), chord(8, 'maj'), chord(5, 'm7'), chord(10, 'dom7')];
const B_BRK = [chord(0, 'm7'), chord(0, 'm7'), chord(8, 'maj7'), chord(8, 'maj7'), chord(10, 'maj7'), chord(10, 'maj7'), chord(2, 'm7'), chord(7, 'min')];
const B_RET1 = [chord(0, 'm7'), chord(0, 'm7'), chord(5, 'dom7'), chord(5, 'dom7'), chord(8, 'maj7'), chord(10, 'maj'), chord(0, 'm7'), chord(0, 'm7')];
const B_RET2 = [chord(0, 'm7'), chord(8, 'maj7'), chord(10, 'maj'), chord(7, 'min'), chord(8, 'maj7'), chord(10, 'maj'), CM_ADD9, CM_ADD9];

// Timeline: intro 0-7, A1 8-15, A2 16-23 (pivot), Eb1 24-31, Eb2 32-39, breakdown
// 40-47, A' 48-55 (pivot), Eb1' 56-63, Eb2' 64-71, return 72-79, outro 80-87.
const RUNB_CHORDS = [...B_INTRO, ...B_A, ...B_A_PIVOT, ...B_EB, ...B_EB, ...B_BRK, ...B_A_PIVOT, ...B_EB, ...B_EB, ...B_RET1, ...B_RET2];
const RUNB_ROOTS = [
  [0, 0, 8, 10, 0, 0, 8, 10],
  [0, 0, 5, 5, 10, 3, 2, 7],
  [0, 0, 5, 5, 10, 3, 2, 10],
  [3, 8, 3, 10, 0, 8, 5, 10],
  [3, 8, 3, 10, 0, 8, 5, 10],
  [0, 0, 8, 8, 10, 10, 2, 7],
  [0, 0, 5, 5, 10, 3, 2, 10],
  [3, 8, 3, 10, 0, 8, 5, 10],
  [3, 8, 3, 10, 0, 8, 5, 10],
  [0, 0, 5, 5, 8, 10, 0, 0],
  [0, 8, 10, 7, 8, 10, 0, 0],
].flat();

// The EP riff sits on the Cm7/F7 bar pairs; other comp bars get plain stabs.
const RUNB_RIFF_BARS = [16, 18, 48, 50, 72, 74, 78];
const RUNB_COMP_BARS = [12, 13, 14, 15, 20, 21, 22, 23, 52, 53, 54, 55, 76, 77];

// The night hook (32 beats over one 8-bar B_EB row): a syncopated entry leaping a
// stacked-fourth to Eb5, leaning on the 6 color tone, peaking on F5 over the ii of the
// ii-V, then resolving to G (the fifth of the coming Cm).
const NIGHT_HOOK1: Note[] = [
  n(0.5, 0.5, 7, 0.9), n(1, 0.5, 10, 0.95), n(1.5, 2, 15, 1),
  n(4.5, 0.5, 12, 0.85), n(5, 0.5, 10, 0.85), n(5.5, 1.5, 8, 0.9),
  n(8, 1, 7, 0.85), n(9.5, 0.5, 10, 0.85), n(10, 2, 12, 0.95),
  n(12, 1.5, 14, 0.95), n(13.5, 0.5, 12, 0.85), n(14, 1.5, 10, 0.9),
  n(16, 1, 15, 0.95), n(17, 0.5, 12, 0.85), n(17.5, 1.5, 10, 0.9),
  n(20, 1, 8, 0.85), n(21, 1, 12, 0.9), n(22, 1, 15, 0.95),
  n(24, 2, 17, 1), // the peak: F5 over Fm7
  n(26, 0.5, 15, 0.9), n(26.5, 0.5, 12, 0.85),
  n(28, 1, 14, 0.9), n(29, 1, 10, 0.85), n(30, 1.5, 7, 0.85),
];
// Pass 2 hangs on Eb5 instead: a common-tone resolution straight into Cm.
const NIGHT_HOOK2: Note[] = [
  ...NIGHT_HOOK1.slice(0, -3),
  n(28, 0.5, 10, 0.9), n(28.5, 0.5, 12, 0.9), n(29, 0.5, 14, 0.95), n(29.5, 2.5, 15, 1),
];

// The EP riff: a two-bar C-minor-pentatonic cell.
const RIFF_BAR1: Note[] = [n(0.5, 0.5, 10, 0.9), n(1, 0.5, 7, 0.8), n(1.75, 0.25, 3, 0.7), n(2.5, 1, 0, 0.9)];
const RIFF_BAR2: Note[] = [n(1.5, 0.5, 2, 0.75), n(2, 1.5, 3, 0.85)];

// The flute descant over the final Eb pass (the loop's peak).
const NIGHT_DESCANT: Note[] = [
  n(0, 3, 7, 0.8), n(3, 1, 10, 0.8), n(4, 4, 12, 0.8),
  n(8, 2, 10, 0.8), n(10, 2, 7, 0.8), n(12, 4, 14, 0.8),
  n(16, 2, 15, 0.8), n(18, 2, 12, 0.8), n(20, 4, 8, 0.8),
  n(24, 2, 8, 0.8), n(26, 2, 12, 0.8), n(28, 2, 14, 0.8), n(30, 2, 10, 0.8),
];

const NIGHT_FILL: Note[] = [n(2.5, 0.25, 0, 0.6), n(3, 0.25, 0, 0.75), n(3.25, 0.25, 0, 0.85), n(3.5, 0.25, 0, 0.95), n(3.75, 0.25, 0, 1)];

function runbStringsVel(bar: number): number {
  if (bar < 24) return 0.8;
  if (bar < 40) return 1;
  if (bar < 48) return 0.85;
  if (bar < 56) return 0.8;
  if (bar < 72) return 1;
  return 0.75;
}

/** The night sub-bass cell: root anchor, ghosts, the b7 lean, an octave pop, and a
 *  chromatic slide into the next bar. */
function subCell(root: number, next: number): Note[] {
  return [
    n(0, 0.75, root, 1), n(1, 0.25, root, 0.4),
    n(1.5, 0.5, root + 10, 0.85), n(2.25, 0.25, root, 0.45),
    n(2.5, 0.75, root + 7, 0.9), n(3.5, 0.25, root + 12, 0.55),
    n(3.75, 0.25, next - 1, 0.65),
  ];
}

const runbParts: Part[] = [
  {
    id: 'nightStrings',
    rootHz: C_COMP,
    voice: STRINGS,
    gain: 0.11,
    notes: perBar(8, 88, 4, (bar) =>
      RUNB_CHORDS[bar].map((semi) => n(0, 4, semi, runbStringsVel(bar)))
    ),
  },
  {
    id: 'nightSub',
    rootHz: C_SUB,
    voice: SUB_BASS,
    gain: 0.58,
    notes: [
      ...perBar(4, 8, 4, (bar) => [n(0, 1.75, RUNB_ROOTS[bar], 0.9), n(2.5, 1.25, RUNB_ROOTS[bar], 0.8)]),
      ...[[8, 40] as const, [48, 80] as const].flatMap(([from, to]) =>
        perBar(from, to, 4, (bar) => subCell(RUNB_ROOTS[bar], RUNB_ROOTS[(bar + 1) % 88]))
      ),
      ...perBar(40, 48, 4, (bar) => [n(0, 1.5, RUNB_ROOTS[bar], 0.95), n(2.5, 1, RUNB_ROOTS[bar] + 7, 0.8)]),
      ...perBar(80, 86, 4, (bar) => [n(0, 2, RUNB_ROOTS[bar], 0.9), n(2, 1.5, RUNB_ROOTS[bar] + 7, 0.7)]),
      ...perBar(86, 88, 4, () => [n(0, 4, 0, 0.8)]),
    ],
  },
  {
    id: 'nightEpPad',
    rootHz: C_EP,
    voice: EP,
    gain: 0.38,
    pan: 0.2,
    // The intro's lonely dyads: root and fifth ringing over nothing.
    notes: perBar(0, 8, 4, (bar) => {
      const [t1, , t3] = tones4(RUNB_CHORDS[bar]);
      return [n(0, 3, t1, 0.6), n(0, 3, t3, 0.6)];
    }),
  },
  {
    id: 'nightEpRiff',
    rootHz: C_EP,
    voice: EP_SHORT,
    gain: 0.38,
    pan: 0.2,
    notes: [
      ...RUNB_RIFF_BARS.flatMap((bar) => [...phrase(bar, 4, RIFF_BAR1), ...phrase(bar + 1, 4, RIFF_BAR2)]),
      ...RUNB_COMP_BARS.flatMap((bar) => [
        ...RUNB_CHORDS[bar].map((semi) => n(bar * 4 + 0.5, 0.5, semi, 0.7)),
        ...RUNB_CHORDS[bar].map((semi) => n(bar * 4 + 2.5, 1, semi, 0.7)),
      ]),
    ],
  },
  {
    id: 'nightPluck',
    rootHz: C_COMP,
    voice: MUTE_PLUCK,
    gain: 0.1,
    pan: 0.3,
    notes: [[8, 40] as const, [48, 80] as const].flatMap(([from, to]) =>
      perBar(from, to, 4, (bar) => {
        const [t1, t2, t3] = tones4(RUNB_CHORDS[bar]);
        return [t1, t2, t1, t3].map((semi, k) => n(0.5 + k, 0.25, semi, 0.7));
      })
    ),
  },
  {
    id: 'nightLead',
    rootHz: C_EP,
    voice: FLUGEL,
    gain: 0.28,
    pan: -0.2,
    notes: [
      ...phrase(24, 4, NIGHT_HOOK1),
      ...phrase(32, 4, NIGHT_HOOK2),
      ...phrase(56, 4, NIGHT_HOOK1),
      ...phrase(64, 4, NIGHT_HOOK2),
      ...phrase(76, 4, scaleVel(NIGHT_HOOK1.slice(0, 6), 0.7)),
    ],
  },
  {
    id: 'nightFlute',
    rootHz: C_FLUTE,
    voice: FLUTE,
    gain: 0.15,
    pan: -0.3,
    notes: phrase(64, 4, NIGHT_DESCANT),
  },
  {
    id: 'nightBell',
    rootHz: C_BELL,
    voice: CELESTA,
    gain: 0.12,
    pan: 0.35,
    notes: [
      ...[30, 38, 62, 70].flatMap((bar) => [3, 7, 12].map((semi, k) => n(bar * 4 + 2 + k * 0.5, 0.5, semi, 0.7))),
      ...[14, 10, 7].map((semi, k) => n(84 * 4 + k, 0.75, semi, 0.6)), // the outro twinkle
    ],
  },
  {
    id: 'nightOrchHit',
    rootHz: C_COMP,
    voice: ORCH_HIT,
    gain: 0.18,
    notes: [56, 60, 64, 68].flatMap((bar) =>
      [...RUNB_CHORDS[bar], RUNB_CHORDS[bar][0] - 12].flatMap((semi) => [
        n(bar * 4, 0.6, semi, 0.95),
        n(bar * 4 + 2.5, 0.6, semi, 0.85),
      ])
    ),
  },
  {
    id: 'nightHitNoise',
    rootHz: 3000,
    voice: HIT_NOISE,
    gain: 0.08,
    notes: [56, 60, 64, 68].flatMap((bar) => [n(bar * 4, 0.6, 0, 0.95), n(bar * 4 + 2.5, 0.6, 0, 0.85)]),
  },
  {
    id: 'nightKick',
    rootHz: 1500,
    voice: KICK,
    gain: 0.52,
    notes: perBar(8, 86, 4, (bar) => {
      if (bar >= 40 && bar < 48) return [n(0, 0.3, 0, 1), n(2.5, 0.3, 0, 0.85)];
      return [
        n(0, 0.3, 0, 1),
        n(0.75, 0.3, 0, 0.7),
        n(2.5, 0.3, 0, 0.85),
        ...(bar % 2 === 0 ? [n(3.25, 0.3, 0, 0.6)] : []),
      ];
    }),
  },
  {
    id: 'nightSnare',
    rootHz: 2200,
    voice: SNARE,
    gain: 0.26,
    pan: 0.05,
    // The halftime backbeat: one fat snare on beat 2 (doubled by nightSnareClap).
    notes: [
      ...perBar(8, 40, 4, () => [n(2, 0.25, 0, 1)]),
      ...perBar(48, 84, 4, (bar) => [n(2, 0.25, 0, bar >= 80 ? 0.7 : 1)]),
      ...FILL_BARS.flatMap((bar) => phrase(bar, 4, NIGHT_FILL)),
    ],
  },
  {
    id: 'nightSnareClap',
    rootHz: 1000,
    voice: CLAP,
    gain: 0.12,
    pan: -0.05,
    notes: [
      ...perBar(8, 40, 4, () => [n(2, 0.2, 0, 1)]),
      ...perBar(48, 84, 4, (bar) => [n(2, 0.2, 0, bar >= 80 ? 0.7 : 1)]),
    ],
  },
  {
    id: 'nightHat',
    rootHz: 9000,
    voice: HAT,
    gain: 0.1,
    pan: -0.15,
    notes: [
      ...[[8, 40] as const, [48, 56] as const, [72, 80] as const].flatMap(([from, to]) =>
        perBar(from, to, 4, () => [
          ...Array.from({ length: 8 }, (_, k) => n(k * 0.5, 0.12, 0, k % 2 === 0 ? 0.9 : 0.5)),
          n(1.75, 0.08, 0, 0.5),
          n(3.75, 0.08, 0, 0.5),
        ])
      ),
      ...perBar(56, 72, 4, () =>
        Array.from({ length: 16 }, (_, k) => n(k * 0.25, 0.08, 0, k % 4 === 0 ? 1 : k % 2 === 0 ? 0.65 : 0.45))
      ),
    ],
  },
  {
    id: 'nightOpenHat',
    rootHz: 9000,
    voice: OPEN_HAT,
    gain: 0.08,
    pan: -0.1,
    notes: [15, 23, 31, 39, 55, 63, 71].map((bar) => n(bar * 4 + 3.5, 0.4, 0, 0.7)),
  },
  {
    id: 'nightShaker',
    rootHz: 8000,
    voice: SHAKER,
    gain: 0.05,
    pan: 0.25,
    notes: perBar(56, 72, 4, () =>
      Array.from({ length: 8 }, (_, k) => n(k * 0.5 + 0.25, 0.08, 0, 0.5))
    ),
  },
];

export const runThemeB: MusicTrack = {
  bpm: 112,
  bars: 88,
  beatsPerBar: 4,
  gain: 0.8,
  parts: runbParts,
  fx: {
    reverb: { roomSize: 0.58, damping: 0.5, wet: 0.2, dry: 1 },
    delay: { beats: 1.5, feedback: 0.32, mix: 0.14, damp: 0.5 },
    busDrive: 1.12,
  },
};

// =============================================================================
// gameEnergy: the key-safe percussion layer faded in during the live game. 112 BPM
// (matches both run themes, test-enforced), 16 bars (~34s). 16th hats and offbeat
// shaker, tom cells with rolls at bars 7/15, backbeat claps with an and-of-4 lift, a
// crowd-stomp build in the back half (16th-note pickup pairs into the claps - a
// variation, deliberately NOT the iconic stomp-stomp-clap cell), and a riser swelling
// into the loop downbeat. No pitched content, so it sits under either theme.
// =============================================================================

const energyRiser: Part = {
  id: 'energyRiser',
  rootHz: 600,
  voice: {
    osc: 'noise',
    noiseSeed: 23,
    freqTo: 4000,
    sweep: 'exp',
    filter: { baseHz: 400, peakHz: 6000, q: 0.8, attackMs: 4000, decayMs: 0, sustain: 1, releaseMs: 250 },
    env: { attackMs: 4000, decayMs: 0, sustain: 1, releaseMs: 250 },
  },
  gain: 0.11,
  notes: [n(56, 8, 0)], // a 2-bar swell into the wrap (intentional for the hype layer)
};

export const gameEnergy: MusicTrack = {
  bpm: 112,
  bars: 16,
  beatsPerBar: 4,
  gain: 0.7,
  parts: [
    {
      id: 'energyHat',
      rootHz: 10000,
      voice: ENERGY_HAT,
      gain: 0.13,
      pan: 0.2,
      notes: perBar(0, 16, 4, () =>
        Array.from({ length: 16 }, (_, k) => n(k * 0.25, 0.08, 0, k % 4 === 0 ? 1 : k % 2 === 0 ? 0.6 : 0.45))
      ),
    },
    {
      id: 'energyShaker',
      rootHz: 8000,
      voice: SHAKER,
      gain: 0.06,
      pan: -0.25,
      notes: perBar(0, 16, 4, () => Array.from({ length: 8 }, (_, k) => n(k * 0.5 + 0.25, 0.08, 0, 0.5))),
    },
    {
      id: 'energyTomLow',
      rootHz: 1200,
      voice: TOM_LOW,
      gain: 0.32,
      pan: -0.2,
      notes: [
        ...perBar(0, 14, 4, () => [n(0, 0.3, 0, 1), n(1.5, 0.3, 0, 0.9), n(2.5, 0.3, 0, 0.95)]),
        ...[7, 15].flatMap((bar) =>
          phrase(bar, 4, [n(3, 0.3, 0, 0.6), n(3.25, 0.3, 0, 0.7), n(3.5, 0.3, 0, 0.85), n(3.75, 0.3, 0, 1)])
        ),
      ],
    },
    {
      id: 'energyTomHigh',
      rootHz: 1400,
      voice: TOM_HIGH,
      gain: 0.22,
      pan: 0.15,
      notes: [
        ...perBar(0, 16, 4, (bar) => (bar % 2 === 0 ? [n(3.25, 0.3, 0, 0.7)] : [])),
        ...[7, 15].flatMap((bar) => phrase(bar, 4, [n(2.5, 0.3, 0, 0.5), n(2.75, 0.3, 0, 0.6)])),
      ],
    },
    {
      id: 'energyClap',
      rootHz: 1000,
      voice: ENERGY_CLAP,
      gain: 0.2,
      pan: -0.1,
      notes: perBar(0, 16, 4, () => [n(1, 0.2, 0, 1), n(3, 0.2, 0, 1), n(3.5, 0.2, 0, 0.7)]),
    },
    {
      id: 'energyStomp',
      rootHz: 500,
      voice: STOMP,
      gain: 0.24,
      notes: perBar(8, 16, 4, () => [n(0.5, 0.3, 0, 0.8), n(0.75, 0.3, 0, 0.9), n(2.5, 0.3, 0, 0.8), n(2.75, 0.3, 0, 0.9)]),
    },
    energyRiser,
  ],
  fx: { reverb: { roomSize: 0.4, damping: 0.6, wet: 0.1, dry: 1 } },
};

export const MUSIC_TRACKS = {
  menuTheme,
  runThemeA,
  runThemeB,
  gameEnergy,
} satisfies Record<string, MusicTrack>;

export type MusicName = keyof typeof MUSIC_TRACKS;
