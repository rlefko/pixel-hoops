/**
 * Offline silhouette baker. Generates ~20 deterministic pixel-art silhouette PNGs
 * for fake/generated players who don't have real NBA headshots.
 *
 *   npx tsx scripts/generate-silhouette.ts
 *
 * Pipeline per silhouette: draw on a 16x16 logical grid → posterize (4 levels)
 * → binarize alpha (kills AA halo) → nearest-neighbor upscale to 32x32.
 *
 * Run-occasionally. Commit the generated assets/player-images/sil-*.png so CI
 * builds without ever running this script.
 */

import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Jimp, ResizeStrategy } from 'jimp';
import { Canvas, hexToRgba } from '../src/art/pixelCanvas';

// ── Palette ────────────────────────────────────────────────────────────────

const SKIN_TONES = [
  '#F2C8A0', // light
  '#E0A878', // light-medium
  '#C68642', // medium
  '#8D5524', // dark-medium
  '#5C3A21', // dark
];

const HAIR_COLORS = [
  '#1A1A1A', // black
  '#3B2314', // dark brown
  '#6B3A2A', // brown
  '#B85C2A', // red
  '#999999', // gray
];

const BG_COLORS = [
  '#1A1A2E', // dark navy
  '#16213E', // navy
  '#0F3460', // deep blue
  '#1B1B2F', // near-black
  '#232342', // purple-navy
  '#1A2A3A', // teal-navy
  '#2A1A2A', // plum
  '#1A2A1A', // forest
  '#2A2A1A', // olive
  '#2A1A1A', // maroon
];

// ── Hair templates (16x16 char arrays; '1' = hair pixel, '.' = transparent) ──

const HAIR_SHORT: string[] = [
  '................',
  '................',
  '................',
  '0000000000000000',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
];

const HAIR_LONG: string[] = [
  '................',
  '................',
  '................',
  '0000000000000000',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
];

const HAIR_BALD: string[] = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
];

const HAIR_CURLY: string[] = [
  '................',
  '................',
  '0000000000000000',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
];

const HAIR_AFRO: string[] = [
  '................',
  '0000000000000000',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
];

const HAIR_MOHAWK: string[] = [
  '................',
  '0000000000000000',
  '0111000000000110',
  '0111000000000110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
];

const HAIR_BUN: string[] = [
  '................',
  '0000000000000000',
  '0111000000000110',
  '0111000000000110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
];

const HAIR_PONYTAIL: string[] = [
  '................',
  '0000000000000000',
  '0111000000000110',
  '0111000000000110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
];

const HAIR_BOWL: string[] = [
  '................',
  '0000000000000000',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
];

const HAIR_WAVY: string[] = [
  '................',
  '................',
  '................',
  '0000000000000000',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
];

const HAIR_UNDERCUT: string[] = [
  '................',
  '0000000000000000',
  '0111000000000110',
  '0111000000000110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
];

const HAIR_DREADLOCKS: string[] = [
  '................',
  '0000000000000000',
  '0111000000000110',
  '0111000000000110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
];

const HAIR_SPiky: string[] = [
  '................',
  '0000000000000000',
  '0111000000000110',
  '0111000000000110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
];

const HAIR_FROPTAC: string[] = [
  '................',
  '0000000000000000',
  '0111000000000110',
  '0111000000000110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
];

const HAIR_SIDEPART: string[] = [
  '................',
  '0000000000000000',
  '0111000000000110',
  '0111000000000110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
];

const HAIR_TWEEZER: string[] = [
  '................',
  '0000000000000000',
  '0111000000000110',
  '0111000000000110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
  '0111111111111110',
];

// ── Drawing helpers ────────────────────────────────────────────────────────

const GRID = 16;

/** Draw a row-array hair pattern onto the canvas at the given row offset. */
function drawHairArray(c: Canvas, rows: string[], rowOffset: number): void {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '1') {
        c.plot(x, y + rowOffset, HAIR_COLOR);
      }
    }
  }
}

// Mutable references so drawing functions can pick up template values
let SKIN: ReturnType<typeof hexToRgba>;
let HAIR_COLOR: ReturnType<typeof hexToRgba>;
let BG: ReturnType<typeof hexToRgba>;

/** Draw the shoulder/base shape (rows 10-15). */
function drawShoulders(c: Canvas): void {
  c.fillRect(0, 10, 16, 6, SKIN);
  // Slight neck indentation
  c.fillRect(5, 9, 6, 1, SKIN);
}

/** Draw the head shape (oval-ish, rows 0-9). */
function drawHead(c: Canvas): void {
  // Head oval centered at (8, 4.5) with rx=5, ry=4.5
  c.ellipse(8, 4.5, 5, 4.5, SKIN);
  // Chin extension
  c.fillRect(5, 8, 6, 2, SKIN);
}

// ── Silhouette templates ───────────────────────────────────────────────────

interface SilTemplate {
  name: string;
  hair: string[];
  skinIndex: number;
  hairColorIndex: number;
  bgIndex: number;
}

const TEMPLATES: SilTemplate[] = [
  { name: 'short-light', hair: HAIR_SHORT, skinIndex: 0, hairColorIndex: 0, bgIndex: 0 },
  { name: 'short-med', hair: HAIR_SHORT, skinIndex: 2, hairColorIndex: 1, bgIndex: 1 },
  { name: 'long-light', hair: HAIR_LONG, skinIndex: 0, hairColorIndex: 2, bgIndex: 2 },
  { name: 'curly-dark', hair: HAIR_CURLY, skinIndex: 4, hairColorIndex: 0, bgIndex: 3 },
  { name: 'afro-deep', hair: HAIR_AFRO, skinIndex: 4, hairColorIndex: 0, bgIndex: 4 },
  { name: 'mohawk-dark', hair: HAIR_MOHAWK, skinIndex: 3, hairColorIndex: 0, bgIndex: 5 },
  { name: 'bun-light', hair: HAIR_BUN, skinIndex: 0, hairColorIndex: 3, bgIndex: 6 },
  { name: 'ponytail-tan', hair: HAIR_PONYTAIL, skinIndex: 1, hairColorIndex: 1, bgIndex: 7 },
  { name: 'bowl-dark', hair: HAIR_BOWL, skinIndex: 3, hairColorIndex: 0, bgIndex: 8 },
  { name: 'wavy-light', hair: HAIR_WAVY, skinIndex: 1, hairColorIndex: 4, bgIndex: 9 },
  { name: 'undercut-tan', hair: HAIR_UNDERCUT, skinIndex: 2, hairColorIndex: 2, bgIndex: 0 },
  { name: 'dreadlocks-deep', hair: HAIR_DREADLOCKS, skinIndex: 4, hairColorIndex: 1, bgIndex: 1 },
  { name: 'spiky-med', hair: HAIR_SPiky, skinIndex: 2, hairColorIndex: 3, bgIndex: 2 },
  { name: 'froptac-dark', hair: HAIR_FROPTAC, skinIndex: 3, hairColorIndex: 0, bgIndex: 3 },
  { name: 'sidepart-tan', hair: HAIR_SIDEPART, skinIndex: 1, hairColorIndex: 2, bgIndex: 4 },
  { name: 'tweezer-light', hair: HAIR_TWEEZER, skinIndex: 0, hairColorIndex: 4, bgIndex: 5 },
  { name: 'bald-light', hair: HAIR_BALD, skinIndex: 0, hairColorIndex: 4, bgIndex: 6 },
  { name: 'bald-dark', hair: HAIR_BALD, skinIndex: 4, hairColorIndex: 4, bgIndex: 7 },
  { name: 'long-blonde', hair: HAIR_LONG, skinIndex: 1, hairColorIndex: 4, bgIndex: 8 },
  { name: 'curly-red', hair: HAIR_CURLY, skinIndex: 2, hairColorIndex: 3, bgIndex: 9 },
];

// ── Jimp pipeline ──────────────────────────────────────────────────────────

/** Copy a pure Canvas into a jimp bitmap, then posterize → binarize alpha →
 * nearest-neighbor upscale to 32x32. */
function renderSilhouette(c: Canvas): Promise<Jimp> {
  return new Promise((resolve) => {
    const img = new Jimp({ width: c.w, height: c.h, color: 0x00000000 });
    img.bitmap.data.set(c.data);

    // 1. Posterize: collapse each channel to 4 levels for chunky 8-bit look
    img.posterize(4);

    // 2. Binarize alpha: soft AA pixels become fully transparent/opaque
    img.scan(0, 0, img.width, img.height, (_x, _y, idx) => {
      const a = img.bitmap.data[idx + 3];
      img.bitmap.data[idx + 3] = a < 128 ? 0 : 255;
    });

    // 3. Nearest-neighbor upscale to 32x32
    img.resize({
      w: 32,
      h: 32,
      mode: ResizeStrategy.NEAREST_NEIGHBOR,
    });

    resolve(img);
  });
}

// ── Main ───────────────────────────────────────────────────────────────────

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'assets', 'player-images');

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });

  for (let i = 0; i < TEMPLATES.length; i++) {
    const t = TEMPLATES[i];

    // Set template-specific colors
    SKIN = hexToRgba(SKIN_TONES[t.skinIndex]);
    HAIR_COLOR = hexToRgba(HAIR_COLORS[t.hairColorIndex]);
    BG = hexToRgba(BG_COLORS[t.bgIndex]);

    // Build canvas: background → shoulders → head → hair
    const c = new Canvas(GRID, GRID, BG);
    drawShoulders(c);
    drawHead(c);
    // Hair starts at row 0, sitting on top of the head (head top is ~row 0-1)
    drawHairArray(c, t.hair, 0);

    // Render and save
    const img = await renderSilhouette(c);
    const filename = `sil-${i}.png`;
    await img.write(join(outDir, filename) as `${string}.png`);
    console.log(`ok   ${filename}  (${img.bitmap.width}x${img.bitmap.height})`);
  }

  console.log(`\nWrote ${TEMPLATES.length} silhouettes to ${outDir}`);
  console.log('Verify by eye before committing:');
  console.log('  ls -la assets/player-images/sil-*.png');
}

void main();
