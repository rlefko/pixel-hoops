import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Jimp, ResizeStrategy } from 'jimp';

const here = dirname(fileURLToPath(import.meta.url));
const outputDir = join(here, '..', 'assets', 'player-images');

const POSTERIZE_LEVELS = 8;
const ALPHA_CUTOFF = 128;
const GRID_SIZE = 40;
const OUT_SIZE = 32;
const BATCH_SIZE = 10;

async function pixelateOne(
  slug: string,
  playerId?: number,
): Promise<boolean> {
  let img: Jimp | null = null;

  // Strategy 1: NBA.com CDN (only if we have a player ID)
  if (playerId) {
    try {
      const url = `https://cdn.nba.com/headshots/nba/latest/260x190/${playerId}.png`;
      const res = await fetch(url);
      if (res.ok) {
        img = await Jimp.fromBuffer(Buffer.from(await res.arrayBuffer()));
      }
    } catch {
      // Fall through to Strategy 2
    }
  }

  // Strategy 2: 2K API playerImage (works for all players)
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
    console.warn(`⚠️  Failed to fetch headshot for ${slug}`);
    return false;
  }

  // Jimp pipeline
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

  const dir = join(outputDir, '');
  import('node:fs').then(fs => fs.mkdirSync(dir, { recursive: true }));
  await img.write(join(outputDir, `${slug}.png`) as `${string}.png`);
  return true;
}

async function main(): Promise<void> {
  const idsPath = join(here, '..', 'src', 'data', 'nba-player-ids.json');
  const playerIds: Record<string, number> = JSON.parse(
    readFileSync(idsPath, 'utf-8'),
  );

  const legendsPath = join(here, '..', 'src', 'data', 'nba-legends.json');
  const poolPath = join(here, '..', 'src', 'data', 'nba-pool.json');
  const legends = JSON.parse(readFileSync(legendsPath, 'utf-8'));
  const pool = JSON.parse(readFileSync(poolPath, 'utf-8'));

  const entries: { slug: string; playerId?: number }[] = [];
  for (const p of [...legends, ...pool]) {
    const slug = p.slug;
    const playerId = playerIds[slug];
    entries.push({ slug, playerId });
  }

  console.log(`Total entries: ${entries.length}`);
  console.log(`With CDN IDs: ${entries.filter(e => e.playerId).length}`);
  console.log(`Without CDN IDs: ${entries.filter(e => !e.playerId).length}`);

  // Test just first batch
  const batch = entries.slice(0, BATCH_SIZE);
  console.log(`Testing batch: ${batch.map(e => e.slug).join(', ')}`);

  let successCount = 0;
  let failCount = 0;

  const results = await Promise.allSettled(
    batch.map((e) => pixelateOne(e.slug, e.playerId)),
  );
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value === true) {
      successCount++;
    } else {
      failCount++;
    }
  }

  console.log(`\nBatch result: ${successCount} succeeded, ${failCount} failed`);
}

void main();
