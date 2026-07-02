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
import { Canvas, toGrayscale } from '../src/art/pixelCanvas';
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

// Android 12+ shows the splash image masked to a centered circle: the icon
// canvas is 288dp and only the middle 192dp circle is visible. The Android
// splash is therefore the square mark alone, inset so every drawn pixel stays
// inside that circle (the mark's art spans ~0.72 of its logical canvas).
const SPLASH_ANDROID_CANVAS = 1024;
// 0.75 of 1024. Safe because the mark's farthest opaque pixel sits within 13 of
// the 32-grid center (unit-tested), and 13/16 * 768/2 = 312 < the 341px mask
// radius (192dp of 288dp).
const SPLASH_ANDROID_ART = 768;

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

/** A fresh jimp image of `c` (any aspect), nearest-neighbor scaled by an integer
 * factor so its longest side lands at or just above `minLongSide`. Keeping the
 * factor integral keeps every logical pixel an even block. */
function renderedTall(c: Canvas, minLongSide: number): JimpImage {
  const factor = Math.ceil(minLongSide / Math.max(c.w, c.h));
  const img = toJimp(c);
  img.resize({
    w: c.w * factor,
    h: c.h * factor,
    mode: ResizeStrategy.NEAREST_NEIGHBOR,
  });
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

  const master = buildMaster();
  const mark = buildMark();

  // iOS light + base icon: opaque navy master, 1024.
  const icon = rendered(master, 1024);
  assertOpaque(icon, 'icon.png');
  await write(icon, 'icon.png');

  // iOS 18 appearance variants: dark keeps the mark on transparency (the system
  // paints its own dark backdrop); tinted is the same art collapsed to grayscale
  // for the system to recolor. Alpha is allowed (and expected) in both.
  await write(rendered(mark, 1024), 'icon-dark.png');
  await write(rendered(toGrayscale(mark), 1024), 'icon-tinted.png');

  // Web favicon: same master at an integer 2x of the logical grid, so the tiny
  // PNG keeps even pixel blocks instead of 1.5x mush.
  await write(rendered(master, 64), 'favicon.png');

  // Splash lockup (iOS): mark + wordmark on transparent, canvas cropped tight to
  // the art (the splash bg paints the navy).
  await write(renderedTall(buildSplash(), 1024), 'splash-icon.png');

  // Splash (Android): square mark only, inset for the 12+ circular splash mask.
  await write(
    centered(rendered(mark, SPLASH_ANDROID_ART), SPLASH_ANDROID_CANVAS),
    'splash-icon-android.png'
  );

  // Android adaptive foreground: transparent, mark inside the safe zone.
  await write(
    centered(rendered(mark, FG_ART), FG_CANVAS),
    'android-icon-foreground.png'
  );

  // Android adaptive background: opaque navy + faint court arc.
  await write(rendered(buildBackground(), FG_CANVAS), 'android-icon-background.png');

  // Android monochrome themed layer: flat ink silhouette in the safe zone.
  await write(
    centered(rendered(buildSilhouette(), MONO_ART), MONO_CANVAS),
    'android-icon-monochrome.png'
  );

  console.log(`\nWrote 9 icon assets to ${outDir}`);
  console.log('Verify by eye before committing:');
  console.log('  qlmanage -t -s 512 -o /tmp assets/images/icon.png && open /tmp/icon.png.png');
}

void main();
