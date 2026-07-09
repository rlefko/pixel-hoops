#!/usr/bin/env tsx
/**
 * Generate `src/data/nba-player-ids.json` — a mapping of player slugs to
 * NBA.com CDN player IDs (the numeric ID used in headshot URLs like
 * `https://cdn.nba.com/headshots/nba/latest/260x190/{id}.png`).
 *
 * Data source: NBA.com's players page. The Next.js app embeds a `__NEXT_DATA__`
 * JSON block containing all current NBA players with their `PERSON_ID` (the
 * NBA.com CDN player ID) and `PLAYER_SLUG`. This endpoint is reliable and
 * does not require authentication.
 *
 * For historical players not on the current NBA.com players page, the script
 * falls back to basketball-reference.com individual player pages, which embed
 * an `nba.com/player/{id}` link. These are fetched one-at-a-time with delays
 * to avoid rate-limiting (429).
 *
 * Usage:
 *   npx tsx scripts/gen-player-ids.ts
 *
 * The script is idempotent — running it multiple times produces the same
 * output (it always re-fetches from NBA.com and overwrites).
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'src', 'data');
const OUT_FILE = join(outDir, 'nba-player-ids.json');

// ---------------------------------------------------------------------------
// Player loading
// ---------------------------------------------------------------------------

interface BakedPlayer {
  name: string;
  slug: string;
}

function loadSlugs(): BakedPlayer[] {
  const legends = JSON.parse(readFileSync(join(outDir, 'nba-legends.json'), 'utf8')) as BakedPlayer[];
  const pool = JSON.parse(readFileSync(join(outDir, 'nba-pool.json'), 'utf8')) as BakedPlayer[];
  const seen = new Set<string>();
  const players: BakedPlayer[] = [];
  for (const p of [...legends, ...pool]) {
    if (seen.has(p.slug)) continue;
    seen.add(p.slug);
    players.push(p);
  }
  return players;
}

// ---------------------------------------------------------------------------
// Name normalization
// ---------------------------------------------------------------------------

/** "LeBron James" → "lebron-james" */
function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------
// NBA.com players page (primary source — current NBA players)
// ---------------------------------------------------------------------------

/**
 * Fetch the NBA.com players page and extract the embedded `__NEXT_DATA__` JSON.
 * Returns a map of slug → NBA.com CDN player ID.
 */
async function fetchNbaComPlayers(): Promise<Map<string, number>> {
  const url = 'https://www.nba.com/players';
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn(`  NBA.com players page returned HTTP ${res.status}`);
      return new Map();
    }
    const text = await res.text();
    const match = text.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/);
    if (!match) {
      console.warn('  Could not find __NEXT_DATA__ in NBA.com players page');
      return new Map();
    }
    const json = JSON.parse(match[1]);
    const players = json.props?.pageProps?.players;
    if (!Array.isArray(players)) {
      console.warn('  No players array found in __NEXT_DATA__');
      return new Map();
    }

    const slugToId = new Map<string, number>();
    for (const p of players) {
      const slug = p.PLAYER_SLUG;
      const id = p.PERSON_ID;
      if (slug && id) {
        slugToId.set(slug, id);
      }
    }
    console.log(`  Found ${slugToId.size} players on NBA.com`);
    return slugToId;
  } catch (err) {
    console.warn(`  Could not fetch NBA.com players page: ${err instanceof Error ? err.message : err}`);
    return new Map();
  }
}

// ---------------------------------------------------------------------------
// Basketball-reference fallback (historical players)
// ---------------------------------------------------------------------------

const BBREF_BASE = 'https://www.basketball-reference.com';

/**
 * Convert a display name to a basketball-reference player slug.
 *
 * bbr slug pattern: [last[0..3]][first[0..2]][NN]
 * e.g. "LeBron James" → "jamesle01"
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

/**
 * Fetch a basketball-reference player page and extract the NBA.com player ID.
 * Returns null if not found or if no NBA.com link is present.
 * Also returns null on 429 (rate limited) to signal the caller to stop.
 */
async function fetchBbrefNbaId(bbrSlug: string): Promise<number | null | 'rate-limited'> {
  const url = `${BBREF_BASE}/players/${bbrSlug[0]}/${bbrSlug}.html`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 429) return 'rate-limited';
    if (!res.ok) return null;
    const text = await res.text();
    const match = text.match(/nba\.com\/player\/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  } catch {
    return null;
  }
}

/**
 * Try multiple bbr slug variants (01, 02, 03...) until one yields an NBA.com ID.
 * Returns 'rate-limited' to signal the caller to stop.
 */
async function fetchBbrefNbaIdWithRetries(
  name: string,
  baseSlug: string
): Promise<number | null | 'rate-limited'> {
  const id = await fetchBbrefNbaId(baseSlug);
  if (id === 'rate-limited') return 'rate-limited';
  if (id !== null) return id;

  for (let i = 2; i <= 99; i++) {
    const variant = baseSlug.slice(0, -2) + String(i).padStart(2, '0');
    const result = await fetchBbrefNbaId(variant);
    if (result === 'rate-limited') return 'rate-limited';
    if (result !== null) return result;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('Loading project players...');
  const players = loadSlugs();
  console.log(`  ${players.length} unique players (legends + pool)\n`);

  // Phase 1: Get current NBA players from NBA.com (fast, reliable)
  console.log('Phase 1: Fetching NBA.com current players...');
  const nbaComSlugs = await fetchNbaComPlayers();

  // Phase 2: Match project players against NBA.com slugs
  const result: Record<string, number> = {};
  let unmatched: string[] = [];
  let matched = 0;

  // Build a reverse lookup: project slug → NBA.com slug
  // The NBA.com PLAYER_SLUG format matches our slug format (lowercase-hyphen).
  const nbaComBySlug = new Map<string, number>();
  for (const [slug, id] of nbaComSlugs) {
    nbaComBySlug.set(slug, id);
  }

  for (const player of players) {
    const slug = player.slug;

    // Direct slug match (NBA.com slug format matches our format)
    const nbaId = nbaComBySlug.get(slug);
    if (nbaId !== undefined) {
      result[slug] = nbaId;
      matched += 1;
      continue;
    }

    // Name-based match: try to find by normalizing the display name
    const normalized = nameToSlug(player.name);
    const nameMatch = nbaComBySlug.get(normalized);
    if (nameMatch !== undefined) {
      result[slug] = nameMatch;
      matched += 1;
      continue;
    }

    // Suffix match: some NBA.com slugs have numeric suffixes (e.g., "jimmy-butler-iii")
    // Try matching our slug as a prefix of the NBA.com slug
    let found = false;
    for (const [nbaSlug, nbaId2] of nbaComBySlug) {
      if (nbaSlug.startsWith(slug + '-') || nbaSlug.startsWith(slug + '_')) {
        result[slug] = nbaId2;
        matched += 1;
        found = true;
        break;
      }
    }
    if (found) continue;

    unmatched.push(slug);
  }

  console.log(`  Matched ${matched} of ${players.length} from NBA.com\n`);

  // Phase 3: Fallback — basketball-reference for historical players
  if (unmatched.length > 0) {
    console.log(`Phase 2: Falling back to basketball-reference for ${unmatched.length} players...`);
    console.log('  (This may take a while due to rate limiting)\n');

    let bbrMatched = 0;
    const remaining: string[] = [];
    let rateLimited = false;

    for (const slug of unmatched) {
      if (rateLimited) {
        remaining.push(slug);
        continue;
      }

      const player = players.find((p) => p.slug === slug);
      if (!player) continue;

      const bbrSlug = nameToBbrefSlug(player.name);
      if (!bbrSlug) {
        console.warn(`  skip ${slug}: could not construct bbr slug`);
        remaining.push(slug);
        continue;
      }

      const nbaId = await fetchBbrefNbaIdWithRetries(player.name, bbrSlug);
      if (nbaId === 'rate-limited') {
        console.log('  basketball-reference is rate-limiting; skipping remaining players');
        rateLimited = true;
        remaining.push(slug);
        continue;
      }
      if (nbaId !== null) {
        result[slug] = nbaId;
        bbrMatched += 1;
        console.log(`  ${slug} → ${nbaId} (${bbrSlug})`);
      } else {
        remaining.push(slug);
      }

      // Small delay between bbr requests to avoid 429
      await new Promise((r) => setTimeout(r, 800));
    }

    console.log(`  bbr matched: ${bbrMatched}`);
    if (remaining.length > 0) {
      console.log(`  still unmatched: ${remaining.length}`);
      unmatched = remaining;
    }
  }

  // Sort output by slug for deterministic, readable output
  const sorted = Object.fromEntries(
    Object.entries(result).sort(([a], [b]) => a.localeCompare(b))
  );

  // Write output
  writeFileSync(OUT_FILE, JSON.stringify(sorted, null, 2) + '\n');
  console.log(`\nWrote ${Object.keys(sorted).length} player IDs to ${OUT_FILE}`);
  console.log(`  Matched:  ${Object.keys(sorted).length}`);
  console.log(`  Unmatched: ${unmatched.length} (could not find NBA.com ID)`);

  if (unmatched.length > 0) {
    console.log('\nUnmatched players:');
    for (const slug of unmatched) {
      const player = players.find((p) => p.slug === slug);
      console.log(`  - ${slug} (${player?.name ?? 'unknown'})`);
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
