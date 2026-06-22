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
  gold: '#FFD54F', // selection, energy, titles
  orange: '#FF9800', // brand highlight, special
  courtLine: '#FF7A1A', // bright orange court accent

  // Outcome semantics
  makeGreen: '#66BB6A',
  makeGreenLt: '#81C784',
  missRed: '#EF5350',
  missRedLt: '#E57373',
  steelBlue: '#42A5F5', // steal / block cool pop

  // Team colors
  homeTeam: '#66BB6A',
  homeTeamAccent: '#FFD54F', // brand gold trim for "Your Squad"
  awayTeam: '#EF5350',

  // Card categories (from CardDisplay)
  offenseBg: '#1B5E20',
  offenseBorder: '#66BB6A',
  offenseText: '#E8F5E9',
  defenseBg: '#4A148C',
  defenseBorder: '#AB47BC',
  defenseText: '#F3E5F5',
  specialBg: '#E65100',
  specialBorder: '#FF9800',
  specialText: '#FFF3E0',

  // Utility
  gridLine: 'rgba(255,255,255,0.12)',
  scanline: 'rgba(0,0,0,0.18)',
  shadow: '#000000',
} as const;

export type PaletteColor = keyof typeof palette;
