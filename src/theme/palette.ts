/**
 * Constrained retro palette. The codebase scatters arbitrary hex values across
 * components; this is the single named source they should migrate to (touched
 * components migrate first, see docs/roadmap.md). Keeping the palette small is
 * part of the 8-bit read: a limited, deliberate set of colors.
 */
export const palette = {
  // Surfaces
  bgDeep: '#1A1A2E', // app background
  bgCourt: '#2D3142', // court / play area
  bgPanel: '#0E0E1A', // HUD panels (replaces rgba(0,0,0,0.7))
  ink: '#F5F5F5', // primary text (warm white, not pure #fff)
  inkDim: '#9A9AB0', // secondary text

  // Accents
  gold: '#FFD54F', // selection, energy, titles (also the legendary rarity and S++ apex, pulsing)
  orange: '#FF9800', // brand highlight, special (also the S+ class)
  courtLine: '#FF7A1A', // bright orange court accent

  // Tier ramp: one cool -> warm -> gold language shared by item rarity and player class, so power
  // reads the same everywhere. common/rare/epic/legendary line up with class C/B/S/S++; the floor
  // (D = inkDim), the A bridge (magenta), and S+ (orange) fill in the 7-step class ladder. Blue
  // (steelBlue), gold, inkDim, and orange are reused from the sections around this one.
  rarePurple: '#9B5CFF', // rare rarity + class B: a saturated royal violet
  epicRed: '#FF2D55', // epic rarity + class S: scarlet crimson, kept distinct from the coral missRed
  classMagenta: '#D24DC8', // class A: the magenta bridge between purple and red
  chrome: '#2DD4BF', // reward-screen + reward-node chrome (teal), distinct from every rarity color

  // Outcome semantics
  makeGreen: '#66BB6A',
  makeGreenLt: '#81C784',
  missRed: '#EF5350',
  missRedLt: '#E57373',
  steelBlue: '#42A5F5', // steal / block cool pop
  flame: '#FF6B35', // on-fire hot streak aura and callout

  // Team colors
  homeTeam: '#66BB6A',
  homeTeamAccent: '#FFD54F', // brand gold trim for "Your Squad"
  awayTeam: '#EF5350',

  // Condition semantics (aliases, no new hex): energy pips and injury badges read
  // green/gold/red, and an injury reuses the lighter miss red.
  energyHigh: '#66BB6A', // = makeGreen
  energyMid: '#FFD54F', // = gold
  energyLow: '#EF5350', // = missRed
  injury: '#E57373', // = missRedLt

  // Utility
  gridLine: 'rgba(255,255,255,0.12)',
  scanline: 'rgba(0,0,0,0.18)',
  shadow: '#000000',
} as const;

export type PaletteColor = keyof typeof palette;
