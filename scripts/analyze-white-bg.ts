/**
 * Analyze white background in legend headshots.
 *
 * For each player: count white pixels (R>240,G>240,B>240), check alpha channel
 * of white vs non-white pixels, and whether white is on edges/corners.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Jimp } from 'jimp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const here = __dirname;
const imgDir = join(here, '..', 'assets', 'player-images');

const players = [
  'lebron-james',
  'michael-jordan',
  'kobe-bryant',
  'magic-johnson',
  'larry-bird',
];

async function analyze(slug: string) {
  const path = join(imgDir, `${slug}.png`);
  const buf = readFileSync(path);
  const img = await Jimp.fromBuffer(buf);
  const { width, height } = img.bitmap;
  const data = img.bitmap.data;

  let whiteCount = 0;
  let whiteAlphaZero = 0;
  let whiteAlphaNonZero = 0;
  let whiteAlphaValues: number[] = [];
  let nonWhiteAlphaValues: number[] = [];
  let edgeWhite = 0; // white pixels on the outer 2px border
  let cornerWhite = 0; // white in the 4 corners (2x2 each)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];
      const isWhite = r > 240 && g > 240 && b > 240;

      if (isWhite) {
        whiteCount++;
        whiteAlphaValues.push(a);
        if (a === 0) whiteAlphaZero++;
        else whiteAlphaNonZero++;

        // Edge check (outer 2px)
        if (
          x < 2 ||
          x >= width - 2 ||
          y < 2 ||
          y >= height - 2
        ) {
          edgeWhite++;
        }

        // Corner check (2x2 corners)
        if (
          (x < 2 && y < 2) ||
          (x >= width - 2 && y < 2) ||
          (x < 2 && y >= height - 2) ||
          (x >= width - 2 && y >= height - 2)
        ) {
          cornerWhite++;
        }
      } else {
        nonWhiteAlphaValues.push(a);
      }
    }
  }

  const totalPixels = width * height;
  const whitePct = ((whiteCount / totalPixels) * 100).toFixed(2);
  const avgWhiteAlpha =
    whiteAlphaValues.length > 0
      ? (
          whiteAlphaValues.reduce((s, v) => s + v, 0) /
          whiteAlphaValues.length
        ).toFixed(1)
      : 0;
  const avgNonWhiteAlpha =
    nonWhiteAlphaValues.length > 0
      ? (
          nonWhiteAlphaValues.reduce((s, v) => s + v, 0) /
          nonWhiteAlphaValues.length
        ).toFixed(1)
      : 0;

  return {
    slug,
    dimensions: `${width}x${height}`,
    totalPixels,
    whiteCount,
    whitePct,
    whiteAlphaZero,
    whiteAlphaNonZero,
    avgWhiteAlpha,
    avgNonWhiteAlpha,
    edgeWhite,
    cornerWhite,
    edgeWhitePct: ((edgeWhite / whiteCount) * 100).toFixed(1),
    cornerWhitePct: ((cornerWhite / whiteCount) * 100).toFixed(1),
  };
}

async function main() {
  console.log('=== White Background Analysis ===\n');
  const results = [];
  for (const slug of players) {
    try {
      const r = await analyze(slug);
      results.push(r);
    } catch (e) {
      console.error(`Error analyzing ${slug}:`, e);
    }
  }

  for (const r of results) {
    console.log(`--- ${r.slug} (${r.dimensions}) ---`);
    console.log(`  Total pixels:          ${r.totalPixels}`);
    console.log(`  White pixels (R/G/B>240): ${r.whiteCount} (${r.whitePct}%)`);
    console.log(`  White alpha=0 (transparent): ${r.whiteAlphaZero}`);
    console.log(`  White alpha>0 (opaque):    ${r.whiteAlphaNonZero}`);
    console.log(`  Avg white alpha:           ${r.avgWhiteAlpha}`);
    console.log(`  Avg non-white alpha:       ${r.avgNonWhiteAlpha}`);
    console.log(`  White on edges:            ${r.edgeWhite} (${r.edgeWhitePct}%)`);
    console.log(`  White in corners:          ${r.cornerWhite} (${r.cornerWhitePct}%)`);

    // Determine if white is likely a background
    if (r.whiteAlphaNonZero > 0 && r.whiteAlphaZero === 0) {
      console.log(`  => White is FULLY OPAQUE — likely a baked-in background`);
    } else if (r.whiteAlphaZero > 0 && r.whiteAlphaNonZero > 0) {
      console.log(`  => White is PARTIALLY transparent — anti-aliased edges`);
    } else if (r.whiteAlphaZero > 0 && r.whiteAlphaNonZero === 0) {
      console.log(`  => White is FULLY transparent — should be invisible`);
    }

    if (r.cornerWhite > 0) {
      console.log(`  => White present in corners — confirms background`);
    }
    console.log('');
  }
}

main();
