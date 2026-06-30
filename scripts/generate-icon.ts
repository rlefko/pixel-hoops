/**
 * Offline app-icon baker. Renders the single pixel-art mark (src/art/iconArt.ts)
 * to every icon asset under assets/images, nearest-neighbor upscaled so the
 * stored PNGs read as crisp 8-bit blocks. The app NEVER draws icons at runtime: it
 * bundles the committed PNGs, so the assets stay deterministic and CI never runs
 * this script. Same shape as scripts/generate-sfx.ts and scripts/pixelate-logos.ts.
 *
 *   npx tsx scripts/generate-icon.ts        (or: npm run gen:icon)
 *
 * Run-once-occasionally. After running, EYEBALL the output (the team verifies art
 * by sight, not by geometry) before committing, e.g.:
 *   qlmanage -t -s 512 -o /tmp assets/images/icon.png && open /tmp/icon.png.png
 *   open assets/images/{splash-icon,android-icon-foreground,android-icon-monochrome}.png
 */

import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Jimp, ResizeStrategy } from 'jimp';
import { Canvas } from '../src/art/pixelCanvas';
import {
  buildMark,
  buildMaster,
  buildBackground,
  buildSilhouette,
  buildSplash,
} from '../src/art/iconArt';

// Android adaptive layers reserve a center safe zone the launcher mask never
// clips; we keep art well inside it (foreground <= 66%, monochrome <= 72%).
const FG_CANVAS = 512;
const FG_ART = 320; // 0.625 of 512, comfortably inside the 66% circle
const MONO_CANVAS = 432;
const MONO_ART = 256; // 0.59 of 432, inside the 72dp safe zone

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'assets', 'images');

type JimpImage = InstanceType<typeof Jimp>;

/** Copy a pure Canvas into a same-size jimp bitmap (no scaling yet). */
function toJimp(c: Canvas): JimpImage {
  const img = new Jimp({ width: c.w, height: c.h, color: 0x00000000 });
  img.bitmap.data.set(c.data);
  return img;
}

/** A fresh jimp image of `c`, nearest-neighbor scaled to `px` square. */
function rendered(c: Canvas, px: number): JimpImage {
  const img = toJimp(c);
  img.resize({ w: px, h: px, mode: ResizeStrategy.NEAREST_NEIGHBOR });
  return img;
}

/** Throw if any pixel is not fully opaque (Apple rejects icons with
 * transparency; the master fills navy first, so this should always hold). */
function assertOpaque(img: JimpImage, name: string): void {
  const data = img.bitmap.data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) {
      throw new Error(`${name} has a transparent pixel; iOS requires no alpha`);
    }
  }
}

async function write(img: JimpImage, name: string): Promise<void> {
  await img.write(join(outDir, name) as `${string}.png`);
  console.log(`ok   ${name}  (${img.bitmap.width}x${img.bitmap.height})`);
}

/** Center `art` inside a transparent square canvas of `size` (adaptive layers). */
function centered(art: JimpImage, size: number): JimpImage {
  const base = new Jimp({ width: size, height: size, color: 0x00000000 });
  const offset = Math.round((size - art.bitmap.width) / 2);
  base.composite(art, offset, offset);
  return base;
}

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });

  // iOS + base icon: opaque navy master, 1024.
  const icon = rendered(buildMaster(), 1024);
  assertOpaque(icon, 'icon.png');
  await write(icon, 'icon.png');

  // Web favicon: same master, tiny.
  await write(rendered(buildMaster(), 48), 'favicon.png');

  // Splash: mark + wordmark on transparent (splash bg paints the navy).
  await write(rendered(buildSplash(), 1024), 'splash-icon.png');

  // Android adaptive foreground: transparent, mark inside the safe zone.
  await write(
    centered(rendered(buildMark(), FG_ART), FG_CANVAS),
    'android-icon-foreground.png'
  );

  // Android adaptive background: opaque navy + faint court arc.
  await write(rendered(buildBackground(), FG_CANVAS), 'android-icon-background.png');

  // Android monochrome themed layer: flat ink silhouette in the safe zone.
  await write(
    centered(rendered(buildSilhouette(), MONO_ART), MONO_CANVAS),
    'android-icon-monochrome.png'
  );

  console.log(`\nWrote 6 icon assets to ${outDir}`);
  console.log('Verify by eye before committing:');
  console.log('  qlmanage -t -s 512 -o /tmp assets/images/icon.png && open /tmp/icon.png.png');
}

void main();
