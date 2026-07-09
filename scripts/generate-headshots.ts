/**
 * Download NBA player headshots from the NBA.com CDN (with basketball-reference
 * fallback), pixelate them to 8-bit style, and write 64x64 PNGs to
 * assets/player-images/.
 *
 *   npx tsx scripts/generate-headshots.ts
 *
 * Pipeline per player: fetch the headshot PNG -> white key BBR backgrounds ->
 * autocrop transparent border ->
 * contain into an 80x80 grid -> posterize for chunky 8-bit color (8 levels for
 * skin tone nuance) -> binarize alpha (kills anti-aliased halo) -> upscale
 * nearest-neighbor to 64x64 so stored pixels are crisp blocks.
 *
 * Sources (in priority order):
 *   1. NBA.com CDN:  https://cdn.nba.com/headshots/nba/latest/260x190/{id}.png
 *      (preferred for modern players with known IDs)
 *   2. Basketball-reference:
 *      https://www.basketball-reference.com/req/{timestamp}/images/headshots/{slug}.jpg
 *      (historical legends and any player missing a CDN ID)
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

const POSTERIZE_LEVELS = 8;
const ALPHA_CUTOFF = 128;
const GRID_SIZE = 80;
const OUT_SIZE = 64;
const BATCH_SIZE = 10;
const RATE_LIMIT_MS = 300;
const BBR_TIMESTAMP = '202605210';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Verified BBR headshot slugs for players whose slugs don't follow the
 * standard name-to-slug algorithm. The algorithm (last4 + first3 + "01")
 * doesn't match BBR's actual slug format for many historical players.
 *
 * This lookup is indexed by player slug (from nba-legends.json / nba-pool.json).
 */
const BBR_HEADSHOT_SLUGS: Record<string, string> = {
  // Historical legends — verified via BBR player pages
  'michael-jordan': 'jordami01',
  'magic-johnson': 'johnsma01',
  'larry-bird': 'birdla01',
  'kareem-abdul-jabbar': 'abdulka01',
  'shaquille-oneal': 'onealsh01',
  'lebron-james': 'jamesle01',
  'kobe-bryant': 'bryanko01',
  'tim-duncan': 'duncati01',
  'stephen-curry': 'curryst01',
  'hakeem-olajuwon': 'olajuha01',
  'scottie-pippen': 'pippesc01',
  'patrick-ewing': 'ewingpa01',
  'charles-barkley': 'barklch01',
  'dirk-nowitzki': 'nowitdi01',
  'kevin-garnett': 'garneke01',
  'dwyane-wade': 'wadedw01',
  'john-stockton': 'stockjo01',
  'oscar-robertson': 'roberos01',
  'bob-pettit': 'pettibo01',
};

/**
 * Convert a player's full name to a basketball-reference headshot slug.
 * Falls back to a heuristic when no verified slug exists.
 *
 *   "LeBron James"     -> "jamesle01"
 *   "Michael Jordan"   -> "jordami01" (via lookup)
 *   "Larry Bird"       -> "birdla01"
 *
 * Returns null when the name can't be parsed into a valid bbr slug.
 */
function nameToBbrefSlug(name: string): string | null {
  const cleaned = name.replace(/[^a-zA-Z\s]/g, '').trim();
  const parts = cleaned.split(/\s+/);
  if (parts.length < 2) return null;
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  if (lastName.length < 4) return null;
  const first3 = firstName.slice(0, 3).toLowerCase();
  const last4 = lastName.toLowerCase().slice(0, 4);
  return `${last4}${first3}01`;
}

type FetchSource = 'nba-cdn' | 'basketball-reference';

async function pixelateOne(
  slug: string,
  name: string,
  playerId?: number,
): Promise<{ ok: boolean; source: FetchSource | null }> {
  let img: Jimp | null = null;
  let source: FetchSource | null = null;

  // Strategy 1: NBA.com CDN (only if we have a player ID)
  if (playerId) {
    try {
      const url = `https://cdn.nba.com/headshots/nba/latest/260x190/${playerId}.png`;
      const res = await fetch(url);
      if (res.ok) {
        img = await Jimp.fromBuffer(Buffer.from(await res.arrayBuffer()));
        source = 'nba-cdn';
      }
    } catch {
      // Fall through to Strategy 2
    }
  }

  // Strategy 2: Basketball-reference headshot
  if (!img) {
    // Try verified lookup first, then fall back to heuristic
    const bbrSlug =
      BBR_HEADSHOT_SLUGS[slug] ?? nameToBbrefSlug(name);
    if (bbrSlug) {
      try {
        const url = `https://www.basketball-reference.com/req/${BBR_TIMESTAMP}/images/headshots/${bbrSlug}.jpg`;
        const res = await fetch(url);
        if (res.ok) {
          img = await Jimp.fromBuffer(Buffer.from(await res.arrayBuffer()));
          source = 'basketball-reference';
        }
      } catch {
        // Fall through to skip
      }
    }
  }

  if (!img) {
    console.warn(`⚠️  Failed to fetch headshot for ${slug} (${name})`);
    return { ok: false, source: null };
  }

  // Jimp pipeline (same pattern as pixelate-logos.ts)
  // Remove solid white backgrounds from BBR JPG sources (chroma key)
  img.scan(0, 0, img.width, img.height, (_x, _y, idx) => {
    const r = img.bitmap.data[idx + 0];
    const g = img.bitmap.data[idx + 1];
    const b = img.bitmap.data[idx + 2];
    if (r > 240 && g > 240 && b > 240) {
      img.bitmap.data[idx + 3] = 0;
    }
  });
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
  return { ok: true, source };
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

  // Build list of all { slug, name, playerId? } entries
  const entries: { slug: string; name: string; playerId?: number }[] = [];
  for (const p of [...legends, ...pool]) {
    const slug = p.slug;
    const name = p.name;
    const playerId = playerIds[slug];
    entries.push({ slug, name, playerId });
  }

  console.log(`Processing ${entries.length} players...`);
  console.log(
    `  With CDN IDs: ${entries.filter((e) => e.playerId).length}`,
  );
  console.log(
    `  Without CDN IDs (BBR fallback): ${entries.filter((e) => !e.playerId).length}`,
  );

  let successCount = 0;
  let failCount = 0;
  let nbaCdnCount = 0;
  let bbrCount = 0;

  // Process in batches to avoid overwhelming the CDN
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((e) => pixelateOne(e.slug, e.name, e.playerId)),
    );
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.ok) {
        successCount++;
        if (result.value.source === 'nba-cdn') nbaCdnCount++;
        else if (result.value.source === 'basketball-reference') bbrCount++;
      } else {
        failCount++;
      }
    }
    // Respect basketball-reference robots.txt: 3-second delay between requests
    if (i + BATCH_SIZE < entries.length) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  console.log(
    `\nDone! ${successCount} succeeded, ${failCount} failed out of ${entries.length} players.`,
  );
  console.log(`  NBA.com CDN: ${nbaCdnCount}`);
  console.log(`  Basketball-reference: ${bbrCount}`);
}

void main();
