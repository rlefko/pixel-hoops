/**
 * Download NBA player headshots from the NBA.com CDN (with 2K API fallback),
 * pixelate them to 8-bit style, and write 32x32 PNGs to assets/player-images/.
 *
 *   npx tsx scripts/generate-headshots.ts
 *
 * Pipeline per player: fetch the headshot PNG -> autocrop transparent border ->
 * contain into a 20x20 grid -> posterize for chunky 8-bit color (5 levels for
 * skin tone nuance) -> binarize alpha (kills anti-aliased halo) -> upscale
 * nearest-neighbor to 32x32 so stored pixels are crisp blocks.
 *
 * Sources (in priority order):
 *   1. NBA.com CDN:  https://cdn.nba.com/headshots/nba/latest/260x190/{id}.png
 *   2. 2K API:      https://api.nba2kapi.com/api/players?slug={slug}
 *      (returns playerImage URL for historical players missing from NBA CDN)
 *
 * Idempotent — safe to re-run. Failed fetches are silently skipped with a
 * warning, never an error.
 */

import { mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Jimp, ResizeStrategy } from 'jimp';

const here = dirname(fileURLToPath(import.meta.url));
const outputDir = join(here, '..', 'assets', 'player-images');

const POSTERIZE_LEVELS = 5;
const ALPHA_CUTOFF = 128;
const GRID_SIZE = 20;
const OUT_SIZE = 32;
const BATCH_SIZE = 10;
const RATE_LIMIT_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pixelateOne(
  playerId: number,
  slug: string,
): Promise<void> {
  let img: Jimp | null = null;

  // Strategy 1: NBA.com CDN
  try {
    const url = `https://cdn.nba.com/headshots/nba/latest/260x190/${playerId}.png`;
    const res = await fetch(url);
    if (res.ok) {
      img = await Jimp.fromBuffer(Buffer.from(await res.arrayBuffer()));
    }
  } catch {
    // Fall through to Strategy 2
  }

  // Strategy 2: 2K API playerImage (historical legends)
  if (!img) {
    try {
      const apiUrl = `https://api.nba2kapi.com/api/players?slug=${slug}`;
      const res = await fetch(apiUrl);
      if (res.ok) {
        const data = await res.json();
        const playerImage = data?.data?.playerImage;
        if (playerImage) {
          const imgRes = await fetch(playerImage);
          if (imgRes.ok) {
            img = await Jimp.fromBuffer(
              Buffer.from(await imgRes.arrayBuffer()),
            );
          }
        }
      }
    } catch {
      // Fall through to skip
    }
  }

  if (!img) {
    console.warn(`⚠️  Failed to fetch headshot for ${slug} (id: ${playerId})`);
    return;
  }

  // Jimp pipeline (same pattern as pixelate-logos.ts)
  img.autocrop();
  img.contain({ w: GRID_SIZE, h: GRID_SIZE });
  img.posterize(POSTERIZE_LEVELS);
  img.scan(0, 0, img.width, img.height, (_x, _y, idx) => {
    const a = img.bitmap.data[idx + 3];
    img.bitmap.data[idx + 3] = a < ALPHA_CUTOFF ? 0 : 255;
  });
  img.resize({
    w: OUT_SIZE,
    h: OUT_SIZE,
    mode: ResizeStrategy.NEAREST_NEIGHBOR,
  });

  mkdirSync(outputDir, { recursive: true });
  await img.write(join(outputDir, `${slug}.png`) as `${string}.png`);
}

async function main(): Promise<void> {
  // Read player IDs (slug -> NBA.com ID mapping)
  const idsPath = join(here, '..', 'src', 'data', 'nba-player-ids.json');
  const playerIds: Record<string, number> = JSON.parse(
    readFileSync(idsPath, 'utf-8'),
  );

  // Read player slugs from both pools
  const legendsPath = join(here, '..', 'src', 'data', 'nba-legends.json');
  const poolPath = join(here, '..', 'src', 'data', 'nba-pool.json');
  const legends = JSON.parse(readFileSync(legendsPath, 'utf-8'));
  const pool = JSON.parse(readFileSync(poolPath, 'utf-8'));

  // Build list of { slug, playerId } entries
  interface PlayerEntry {
    slug: string;
    playerId: number;
  }

  const entries: PlayerEntry[] = [];
  for (const p of [...legends, ...pool]) {
    const slug = p.slug;
    const playerId = playerIds[slug];
    if (slug && playerId) {
      entries.push({ slug, playerId });
    }
  }

  console.log(`Processing ${entries.length} players...`);

  let successCount = 0;
  let failCount = 0;

  // Process in batches to avoid overwhelming the CDN
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((e) => pixelateOne(e.playerId, e.slug)),
    );
    for (const result of results) {
      if (result.status === 'fulfilled') {
        successCount++;
      } else {
        failCount++;
        console.error(
          `FAIL ${result.reason?.message ?? 'unknown error'}`,
        );
      }
    }
    if (i + BATCH_SIZE < entries.length) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  console.log(
    `\nDone! ${successCount} succeeded, ${failCount} failed out of ${entries.length} players.`,
  );
}

void main();
