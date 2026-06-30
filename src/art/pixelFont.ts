/**
 * Minimal 5x7 pixel font, just the glyphs the splash wordmark needs ("PIXEL" and
 * "HOOPS"). A hand-drawn bitmap font keeps the splash wordmark in the same chunky
 * 8-bit register as the in-app Press Start 2P title (HomeScreen renders "PIXEL"
 * in ink and "HOOPS" in orange) without pulling a TTF rasterizer into the Node
 * generator. Pure: no jimp/Node imports.
 */
import { Canvas, type RGBA } from './pixelCanvas';

const GLYPH_W = 5;
export const GLYPH_H = 7;
const GAP = 1; // blank column between glyphs
const ADVANCE = GLYPH_W + GAP;

// Each glyph is 7 rows of 5 columns; '#' is an inked pixel, anything else blank.
const GLYPHS: Record<string, string[]> = {
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};

/** Total pixel width a string occupies (glyphs separated by one blank column). */
export function textWidth(text: string): number {
  return text.length === 0 ? 0 : text.length * ADVANCE - GAP;
}

/**
 * Stamp `text` into `canvas` with its top-left at (x, y), one color. Unknown
 * characters are skipped (advancing as a blank), so callers stay limited to the
 * supported glyph set above.
 */
export function drawText(
  canvas: Canvas,
  text: string,
  x: number,
  y: number,
  color: RGBA
): void {
  let penX = x;
  for (const char of text) {
    const glyph = GLYPHS[char];
    if (glyph) {
      for (let row = 0; row < GLYPH_H; row++) {
        const line = glyph[row];
        for (let col = 0; col < GLYPH_W; col++) {
          if (line[col] === '#') canvas.plot(penX + col, y + row, color);
        }
      }
    }
    penX += ADVANCE;
  }
}
