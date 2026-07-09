import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Jimp, ResizeStrategy } from 'jimp';

const ids = JSON.parse(readFileSync('src/data/nba-player-ids.json', 'utf-8'));
const legends = JSON.parse(readFileSync('src/data/nba-legends.json', 'utf-8'));
const pool = JSON.parse(readFileSync('src/data/nba-pool.json', 'utf-8'));

const entries: { slug: string; playerId?: number }[] = [];
for (const p of [...legends, ...pool]) {
  entries.push({ slug: p.slug, playerId: ids[p.slug] });
}

const POSTERIZE_LEVELS = 8;
const ALPHA_CUTOFF = 128;
const GRID_SIZE = 40;
const OUT_SIZE = 32;

async function pixelateOne(slug: string, playerId?: number): Promise<boolean> {
  let img: Jimp | null = null;
  if (playerId) {
    try {
      const url = `https://cdn.nba.com/headshots/nba/latest/260x190/${playerId}.png`;
      const res = await fetch(url);
      console.log(`CDN fetch for ${slug} - status: ${res.status} ok: ${res.ok}`);
      if (res.ok) {
        img = await Jimp.fromBuffer(Buffer.from(await res.arrayBuffer()));
        console.log(`Jimp loaded for ${slug} - size: ${img.bitmap.width}x${img.bitmap.height}`);
      }
    } catch (e) {
      console.log(`CDN exception for ${slug}: ${e.message}`);
    }
  }
  if (!img) {
    console.log(`No image for ${slug} - trying 2K API`);
  }
  if (!img) {
    try {
      const apiUrl = `https://api.nba2kapi.com/api/players?slug=${slug}`;
      const res = await fetch(apiUrl);
      console.log(`2K API for ${slug} - status: ${res.status}`);
      if (res.ok) {
        const data = await res.json();
        const playerImage = data?.data?.playerImage;
        if (playerImage) {
          console.log(`2K found image for ${slug}`);
        } else {
          console.log(`2K no image field for ${slug}`);
        }
      }
    } catch (e) {
      console.log(`2K exception for ${slug}: ${e.message}`);
    }
  }
  if (!img) {
    console.log(`FINAL: No image for ${slug}`);
    return false;
  }
  img.autocrop();
  img.contain({ w: GRID_SIZE, h: GRID_SIZE });
  img.posterize(POSTERIZE_LEVELS);
  img.scan(0, 0, img.width, img.height, (_x, _y, idx) => {
    const a = img.bitmap.data[idx + 3];
    img.bitmap.data[idx + 3] = a < ALPHA_CUTOFF ? 0 : 255;
  });
  img.resize({ w: OUT_SIZE, h: OUT_SIZE, mode: ResizeStrategy.NEAREST_NEIGHBOR });
  console.log(`SUCCESS for ${slug}`);
  return true;
}

async function main() {
  const withIds = entries.filter(e => e.playerId).slice(0, 3);
  for (const e of withIds) {
    const result = await pixelateOne(e.slug, e.playerId);
    console.log(`Result for ${e.slug}: ${result}`);
  }
}

void main();
