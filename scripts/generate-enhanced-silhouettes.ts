/**
 * Enhanced silhouette baker. Reads existing player headshots, strips their
 * backgrounds, and produces 64×64 dark-silhouette portraits with deterministic
 * procedural facial features.
 *
 *   npx tsx scripts/generate-enhanced-silhouettes.ts
 *
 * Pipeline per player:
 *   read headshot → flood-fill remove background → extract silhouette shape →
 *   scale/center into 64×64 → fill dark navy → extend to shoulders →
 *   paint procedural facial features (hashSeed-driven) → binarize alpha →
 *   save as enr-{slug}.png
 *
 * Deterministic: same headshot + same slug always produces the same output.
 * Idempotent: skips players that already have an enr-*.png file.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Jimp } from 'jimp';
import { hashSeed } from '../src/game/rng';

// ── Constants ────────────────────────────────────────────────────────────────

const here = dirname(fileURLToPath(import.meta.url));
const outputDir = join(here, '..', 'assets', 'player-images');

const OUT_SIZE = 64;
const ALPHA_CUTOFF = 128;

const BATCH_SIZE = 20;

// Feature style buckets (indices into style arrays)
const EYE_STYLES = ['simple', 'detailed', 'narrow', 'wide'] as const;
const NOSE_STYLES = ['line', 'dot', 'hook', 'flat'] as const;
const MOUTH_STYLES = ['smile', 'neutral', 'line', 'open'] as const;
const BROW_STYLES = ['flat', 'arched', 'angled', 'thick'] as const;

// ── Flood-fill background removal (copied from generate-headshots.ts) ────────

/**
 * Remove a solid background from a Jimp image using BFS flood-fill.
 *
 * Samples the background color from all 4 corners, picks the most frequent
 * corner color, then floods from every edge pixel whose color is within
 * ±30 of the background. Only pixels connected to the border become
 * transparent.
 *
 * Returns `true` on success, `false` when >90 % of pixels were removed
 * (likely an all-white / all-same-color image).
 */
function removeBackground(img: Jimp): boolean {
  const { width, height, bitmap } = img;
  if (width === 0 || height === 0) return true;
  const data = bitmap.data; // Uint8ClampedArray (RGBA)

  // --- 1. Sample the 4 corners to find the background color ---
  const corners: [number, number][] = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];

  const colorCounts = new Map<string, number>();
  for (const [cx, cy] of corners) {
    const i = (cy * width + cx) * 4;
    const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
    colorCounts.set(key, (colorCounts.get(key) ?? 0) + 1);
  }

  let bgKey = '';
  let bgCount = 0;
  for (const [key, count] of colorCounts) {
    if (count > bgCount) {
      bgCount = count;
      bgKey = key;
    }
  }
  const [br, bg, bb] = bgKey.split(',').map(Number);

  // --- 2. BFS flood-fill from all edge pixels ---
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  // Determine if image is fully opaque (no alpha channel) — typical of JPG sources.
  // For opaque images, seed from any edge pixel matching background color.
  // For transparent images (CDN PNGs), seed only from transparent edge pixels.
  const allOpaque = corners.every(([cx, cy]) => {
    const i = (cy * width + cx) * 4 + 3;
    return data[i] === 255;
  });

  // Helper: should this edge pixel be seeded?
  function shouldSeed(byteOffset: number): boolean {
    const pixelMatchesBg = Math.abs(data[byteOffset] - br) <= 30 && Math.abs(data[byteOffset + 1] - bg) <= 30 && Math.abs(data[byteOffset + 2] - bb) <= 30;
    if (allOpaque) return pixelMatchesBg;
    return data[byteOffset + 3] === 0 && pixelMatchesBg;
  }

  // Seed queue with edge pixels that match the background color
  for (let x = 0; x < width; x++) {
    // Top row
    if (!visited[x] && shouldSeed(x * 4)) {
      visited[x] = 1;
      queue.push(x);
    }
    // Bottom row
    const bottom = (height - 1) * width + x;
    if (!visited[bottom] && shouldSeed(bottom * 4)) {
      visited[bottom] = 1;
      queue.push(bottom);
    }
  }
  for (let y = 0; y < height; y++) {
    // Left column
    const left = y * width;
    if (!visited[left] && shouldSeed(left * 4)) {
      visited[left] = 1;
      queue.push(left);
    }
    // Right column
    const right = y * width + (width - 1);
    if (!visited[right] && shouldSeed(right * 4)) {
      visited[right] = 1;
      queue.push(right);
    }
  }

  const dirs = [-1, 1, -width, width];

  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const px = idx % width;
    const py = (idx - px) / width;
    const pi = idx * 4;

    data[pi + 3] = 0;

    for (const d of dirs) {
      const ni = idx + d;
      if (ni < 0 || ni >= width * height) continue;

      const nx = ni % width;
      const ny = (ni - nx) / width;
      if (Math.abs(nx - px) > 1 || Math.abs(ny - py) > 1) continue;

      if (visited[ni]) continue;

      const ni4 = ni * 4;
      if (
        Math.abs(data[ni4] - br) <= 30 &&
        Math.abs(data[ni4 + 1] - bg) <= 30 &&
        Math.abs(data[ni4 + 2] - bb) <= 30
      ) {
        visited[ni] = 1;
        queue.push(ni);
      }
    }
  }

  const totalPixels = width * height;
  const removed = queue.length;
  return removed <= totalPixels * 0.9;
}

// ── Helper: pick style by hash seed ─────────────────────────────────────────

function pickStyle<T>(arr: readonly T[], seed: number): T {
  return arr[(seed >>> 0) % arr.length];
}

// ── Facial feature drawing helpers ──────────────────────────────────────────

/**
 * Draw a pixel in feature color on the canvas.
 * Only draws if the pixel is currently the silhouette color (prevents
 * overwriting features with features).
 */
function plotFeature(
  img: Jimp,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  if (x < 0 || x >= OUT_SIZE || y < 0 || y >= OUT_SIZE) return;
  img.scan(x, y, width, height, (fx, fy, idx) => {
    const r = img.bitmap.data[idx + 0];
    const g = img.bitmap.data[idx + 1];
    const b = img.bitmap.data[idx + 2];
    // Only overwrite silhouette pixels (dark navy), not background
    if (r <= 40 && g <= 40 && b <= 50) {
      img.bitmap.data[idx + 0] = 0xc8;
      img.bitmap.data[idx + 1] = 0xc8;
      img.bitmap.data[idx + 2] = 0xd0;
      img.bitmap.data[idx + 3] = 0xff;
    }
  });
}

/** Draw eyes at y=28, centered at x=22 and x=42. */
function drawEyes(
  img: Jimp,
  style: (typeof EYE_STYLES)[number],
  seed: number,
): void {
  const eyeY = 28;
  const positions = [
    { x: 22, w: 10 }, // left eye
    { x: 42, w: 10 }, // right eye
  ];

  for (const pos of positions) {
    switch (style) {
      case 'simple': {
        // 2 thin horizontal lines (top and bottom of eye)
        plotFeature(img, pos.x, eyeY - 1, pos.w, 1);
        plotFeature(img, pos.x, eyeY + 1, pos.w, 1);
        break;
      }
      case 'detailed': {
        // Small dot in center with outline ring
        plotFeature(img, pos.x + 4, eyeY, 2, 1); // center dot
        plotFeature(img, pos.x + 1, eyeY - 1, 8, 1); // top outline
        plotFeature(img, pos.x + 1, eyeY + 1, 8, 1); // bottom outline
        plotFeature(img, pos.x, eyeY, 1, 3); // left outline
        plotFeature(img, pos.x + 9, eyeY, 1, 3); // right outline
        break;
      }
      case 'narrow': {
        // Thin line
        plotFeature(img, pos.x + 2, eyeY, pos.w - 4, 1);
        break;
      }
      case 'wide': {
        // Wider lines
        plotFeature(img, pos.x, eyeY - 1, pos.w, 1);
        plotFeature(img, pos.x, eyeY + 1, pos.w, 1);
        plotFeature(img, pos.x, eyeY + 2, pos.w, 1);
        break;
      }
    }
  }

  // Optional: slight asymmetry via seed (one eye slightly different)
  if ((seed >>> 0) % 3 === 0) {
    const leftEyeX = 22;
    plotFeature(img, leftEyeX + 4, eyeY, 1, 1);
  }
}

/** Draw nose at x=32, y=36-40. */
function drawNose(img: Jimp, style: (typeof NOSE_STYLES)[number]): void {
  const noseX = 32;

  switch (style) {
    case 'line':
      plotFeature(img, noseX, 36, 1, 5);
      break;
    case 'dot':
      plotFeature(img, noseX, 38, 1, 1);
      break;
    case 'hook':
      // Small L-shape: vertical then horizontal to the right
      plotFeature(img, noseX, 36, 1, 3);
      plotFeature(img, noseX, 39, 2, 1);
      break;
    case 'flat':
      plotFeature(img, noseX - 1, 38, 3, 1);
      break;
  }
}

/** Draw mouth at y=48, x=26-38. */
function drawMouth(img: Jimp, style: (typeof MOUTH_STYLES)[number]): void {
  const mouthY = 48;

  switch (style) {
    case 'smile': {
      // Curved line: wider in middle, narrower at edges
      plotFeature(img, 26, mouthY, 1, 1);
      plotFeature(img, 28, mouthY, 1, 1);
      plotFeature(img, 30, mouthY + 1, 1, 1);
      plotFeature(img, 32, mouthY + 1, 1, 1);
      plotFeature(img, 34, mouthY, 1, 1);
      plotFeature(img, 36, mouthY, 1, 1);
      plotFeature(img, 38, mouthY - 1, 1, 1);
      break;
    }
    case 'neutral': {
      // Straight line
      plotFeature(img, 28, mouthY, 8, 1);
      break;
    }
    case 'line': {
      // Thin horizontal
      plotFeature(img, 30, mouthY, 4, 1);
      break;
    }
    case 'open': {
      // Slight curve (like a gentle U)
      plotFeature(img, 28, mouthY, 1, 1);
      plotFeature(img, 30, mouthY + 1, 1, 1);
      plotFeature(img, 32, mouthY + 1, 1, 1);
      plotFeature(img, 34, mouthY + 1, 1, 1);
      plotFeature(img, 36, mouthY, 1, 1);
      break;
    }
  }
}

/** Draw eyebrows at y=23, x=20-44. */
function drawEyebrows(
  img: Jimp,
  style: (typeof BROW_STYLES)[number],
  seed: number,
): void {
  const browY = 23;
  const leftX = 22;
  const rightX = 42;

  switch (style) {
    case 'flat': {
      plotFeature(img, leftX - 2, browY, 6, 1);
      plotFeature(img, rightX - 2, browY, 6, 1);
      break;
    }
    case 'arched': {
      // Curved up
      plotFeature(img, leftX - 2, browY + 1, 1, 1);
      plotFeature(img, leftX - 1, browY, 1, 1);
      plotFeature(img, leftX, browY, 1, 1);
      plotFeature(img, leftX + 1, browY, 1, 1);
      plotFeature(img, leftX + 2, browY + 1, 1, 1);

      plotFeature(img, rightX - 2, browY + 1, 1, 1);
      plotFeature(img, rightX - 1, browY, 1, 1);
      plotFeature(img, rightX, browY, 1, 1);
      plotFeature(img, rightX + 1, browY, 1, 1);
      plotFeature(img, rightX + 2, browY + 1, 1, 1);
      break;
    }
    case 'angled': {
      // Diagonal down (more intense look)
      plotFeature(img, leftX - 2, browY, 1, 1);
      plotFeature(img, leftX - 1, browY + 1, 1, 1);
      plotFeature(img, leftX, browY + 1, 2, 1);
      plotFeature(img, leftX + 2, browY + 2, 1, 1);

      plotFeature(img, rightX - 2, browY + 2, 1, 1);
      plotFeature(img, rightX, browY + 1, 2, 1);
      plotFeature(img, rightX + 1, browY, 1, 1);
      plotFeature(img, rightX + 2, browY, 1, 1);
      break;
    }
    case 'thick': {
      // Wider lines
      plotFeature(img, leftX - 2, browY, 6, 2);
      plotFeature(img, rightX - 2, browY, 6, 2);
      break;
    }
  }

  // Subtle asymmetry: one brow slightly higher sometimes
  if ((seed >>> 0) % 5 === 0) {
    plotFeature(img, leftX + 1, browY - 1, 4, 1);
  }
}

/** Draw small ear indicators on left/right edges. */
function drawEars(img: Jimp, seed: number): void {
  const earY = 28;
  // Only draw ears for some players (seed-gated)
  if ((seed >>> 0) % 2 !== 0) return;

  // Left ear
  plotFeature(img, 10, earY, 1, 8);
  // Right ear
  plotFeature(img, 53, earY, 1, 8);
}

/** Draw jawline curve at bottom of face. */
function drawJaw(img: Jimp): void {
  // Subtle curve: wider at bottom, narrowing toward chin
  plotFeature(img, 26, 54, 1, 1);
  plotFeature(img, 28, 55, 1, 1);
  plotFeature(img, 30, 55, 1, 1);
  plotFeature(img, 32, 55, 1, 1);
  plotFeature(img, 34, 55, 1, 1);
  plotFeature(img, 36, 55, 1, 1);
  plotFeature(img, 38, 54, 1, 1);
}

// ── Silhouette creation ─────────────────────────────────────────────────────

/**
 * Build a 64×64 silhouette from a headshot image.
 *
 * 1. Remove background via flood-fill
 * 2. Autocrop and contain into 64×64
 * 3. Fill with dark navy silhouette color
 * 4. Extend shape downward for shoulders
 */
function buildSilhouette(img: Jimp): Jimp {
  // Step 1: Remove background
  removeBackground(img);

  // Step 2: Autocrop transparent borders
  img.autocrop();

  // Step 3: Contain into 64×64, centered
  img.contain({ w: OUT_SIZE, h: OUT_SIZE });

  // Step 4: Create a fresh 64×64 canvas and stamp the shape onto it
  const result = new Jimp({ width: OUT_SIZE, height: OUT_SIZE, color: 0x00000000 });

  // Stamp the processed image onto the result (centered)
  result.composite(img, 0, 0);

  // Step 5: Fill all non-transparent pixels with silhouette color
  result.scan(0, 0, OUT_SIZE, OUT_SIZE, (x, y, idx) => {
    const a = result.bitmap.data[idx + 3];
    if (a > 0) {
      result.bitmap.data[idx + 0] = 0x1a;
      result.bitmap.data[idx + 1] = 0x1a;
      result.bitmap.data[idx + 2] = 0x2e;
    }
  });

  // Step 6: Extend shape downward for shoulders
  extendShoulders(result);

  // Step 7: Binarize alpha
  result.scan(0, 0, OUT_SIZE, OUT_SIZE, (_x, _y, idx) => {
    const a = result.bitmap.data[idx + 3];
    result.bitmap.data[idx + 3] = a < ALPHA_CUTOFF ? 0 : 255;
  });

  return result;
}

/**
 * Extend the silhouette shape downward to include shoulders.
 *
 * Shoulders: curved bottom, wider than head (~50px at bottom, ~30px at neck),
 * extending to y=63 (canvas bottom).
 */
function extendShoulders(img: Jimp): void {
  // Find the bottom of the existing head shape
  let headBottom = OUT_SIZE;
  for (let y = OUT_SIZE - 1; y >= 0; y--) {
    for (let x = 0; x < OUT_SIZE; x++) {
      const idx = (y * OUT_SIZE + x) * 4 + 3;
      if (img.bitmap.data[idx] > 0) {
        headBottom = y;
        break;
      }
    }
    if (headBottom < OUT_SIZE) break;
  }

  // Find the horizontal center of the shape
  let centerX = Math.floor(OUT_SIZE / 2);
  let minX = OUT_SIZE;
  let maxX = 0;
  for (let y = 0; y < headBottom; y++) {
    for (let x = 0; x < OUT_SIZE; x++) {
      const idx = (y * OUT_SIZE + x) * 4 + 3;
      if (img.bitmap.data[idx] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  centerX = Math.floor((minX + maxX) / 2);

  // Shoulder parameters
  const shoulderTop = headBottom; // starts right below the head
  const shoulderBottom = OUT_SIZE - 1; // y=63
  const neckWidth = Math.max(maxX - minX, 16); // neck is at least 16px wide
  const shoulderWidth = 50; // shoulders extend ~50px wide at bottom
  const neckWidthAtTop = Math.floor(neckWidth * 0.6); // neck tapers up

  // Draw shoulder shape row by row with smooth curve
  for (let y = shoulderTop; y <= shoulderBottom; y++) {
    const t = (y - shoulderTop) / Math.max(shoulderBottom - shoulderTop, 1); // 0..1
    // Ease-in curve: shoulders widen more in the lower half
    const easedT = t * t;
    const currentWidth = Math.floor(neckWidthAtTop + (shoulderWidth - neckWidthAtTop) * easedT);
    const left = centerX - Math.floor(currentWidth / 2);
    const right = centerX + Math.floor(currentWidth / 2);

    // Draw shoulder row
    for (let x = left; x <= right; x++) {
      if (x < 0 || x >= OUT_SIZE) continue;
      const idx = (y * OUT_SIZE + x) * 4 + 3;
      if (img.bitmap.data[idx] === 0) {
        // New shoulder pixel — set to silhouette color
        img.bitmap.data[idx - 3] = 0x1a;
        img.bitmap.data[idx - 2] = 0x1a;
        img.bitmap.data[idx - 1] = 0x2e;
        img.bitmap.data[idx] = 0xff;
      }
    }
  }
}

// ── Feature painting ────────────────────────────────────────────────────────

/**
 * Paint procedural facial features onto a silhouette.
 * All feature styles are selected deterministically from the slug via hashSeed.
 */
function paintFeatures(img: Jimp, slug: string): void {
  const seed = hashSeed(slug);

  const eyeStyle = pickStyle(EYE_STYLES, seed);
  const noseStyle = pickStyle(NOSE_STYLES, seed >>> 4);
  const mouthStyle = pickStyle(MOUTH_STYLES, seed >>> 8);
  const browStyle = pickStyle(BROW_STYLES, seed >>> 12);

  drawEyebrows(img, browStyle, seed);
  drawEyes(img, eyeStyle, seed);
  drawNose(img, noseStyle);
  drawMouth(img, mouthStyle);
  drawEars(img, seed);
  drawJaw(img);
}

// ── File discovery ──────────────────────────────────────────────────────────

/**
 * List all .png files in the output directory that are headshots
 * (not sil-*.png or enr-*.png).
 */
function discoverHeadshots(): string[] {
  if (!existsSync(outputDir)) {
    console.error(`Error: output directory not found: ${outputDir}`);
    process.exit(1);
  }

  const files = readdirSync(outputDir);
  return files
    .filter((f) => f.endsWith('.png'))
    .filter((f) => !f.startsWith('sil-') && !f.startsWith('enr-'))
    .sort();
}

// ── Main ────────────────────────────────────────────────────────────────────

async function processOne(
  filename: string,
  slug: string,
  _total: number,
  _index: number,
): Promise<{ ok: boolean; skipped: boolean }> {
  const outputPath = join(outputDir, `enr-${slug}.png`);

  // Idempotent: skip if output already exists
  if (existsSync(outputPath)) {
    return { ok: true, skipped: true };
  }

  const inputPath = join(outputDir, filename);

  // Validate input file
  if (!existsSync(inputPath)) {
    console.warn(`⚠️  Input file missing: ${filename}`);
    return { ok: false, skipped: false };
  }

  try {
    // Read and process
    const img = await Jimp.fromBuffer(readFileSync(inputPath));
    const silhouette = buildSilhouette(img);
    paintFeatures(silhouette, slug);

    // Final binarize alpha pass (double-check)
    silhouette.scan(0, 0, OUT_SIZE, OUT_SIZE, (_x, _y, idx) => {
      const a = silhouette.bitmap.data[idx + 3];
      silhouette.bitmap.data[idx + 3] = a < ALPHA_CUTOFF ? 0 : 255;
    });

    // Write output
    mkdirSync(outputDir, { recursive: true });
    await silhouette.write(
      outputPath as `${string}.png`,
    );

    return { ok: true, skipped: false };
  } catch (err) {
    console.warn(`⚠️  Failed to process ${filename}: ${err}`);
    return { ok: false, skipped: false };
  }
}

async function main(): Promise<void> {
  const headshots = discoverHeadshots();

  if (headshots.length === 0) {
    console.log('No headshots found in assets/player-images/.');
    console.log('Run generate-headshots.ts first to create headshots.');
    return;
  }

  console.log(`Found ${headshots.length} headshots to process.`);
  console.log(`Output: ${outputDir}/enr-*.png`);
  console.log(`Resolution: ${OUT_SIZE}×${OUT_SIZE}`);
  console.log('');

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < headshots.length; i += BATCH_SIZE) {
    const batch = headshots.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((f, bi) => {
        const slug = f.replace(/\.png$/, '');
        return processOne(f, slug, headshots.length, i + bi);
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value.skipped) {
          skipped++;
        } else if (result.value.ok) {
          processed++;
        } else {
          failed++;
        }
      } else {
        failed++;
      }
    }

    const done = Math.min(i + BATCH_SIZE, headshots.length);
    console.log(`  Progress: ${done}/${headshots.length} (${Math.round((done / headshots.length) * 100)}%)`);
  }

  console.log('');
  console.log(`Done! ${processed} generated, ${skipped} skipped (already exist), ${failed} failed out of ${headshots.length} headshots.`);
}

void main();
