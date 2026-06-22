/**
 * Offline NBA dataset baker. Pulls ratings from the NBA 2K API
 * (https://www.nba2kapi.com) for a curated set of players and writes
 * src/data/nba-players.json. The app NEVER calls the API at runtime, so the
 * sim stays deterministic, offline, and the API key never ships.
 *
 * Usage:
 *   NBA2K_API_KEY=your_key npx tsx scripts/fetch-nba.ts
 *
 * Optional:
 *   NBA2K_API_BASE   override the API base URL (default below)
 *
 * The key is read from the environment only. Do not hardcode it or commit it.
 * Team colors live in src/data/nba-teams.json and are maintained by hand (the
 * ratings API does not provide reliable brand colors); this script leaves that
 * file untouched. Curate WHO appears by editing the ROSTER list below.
 */

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapRatingsToStats, type RawRatings } from '../src/game/nba-map';

type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';
type Era = 'historical' | 'modern';

/** Who to bake, with the metadata the ratings API does not give us cleanly. */
interface RosterEntry {
  slug: string;
  teamAbbr: string;
  era: Era;
  position: Position;
  jerseyNumber: number;
}

// Edit this list to change the baked pool. Slugs match the API's player slugs.
const ROSTER: RosterEntry[] = [
  { slug: 'michael-jordan', teamAbbr: 'CHI', era: 'historical', position: 'SG', jerseyNumber: 23 },
  { slug: 'magic-johnson', teamAbbr: 'LAL', era: 'historical', position: 'PG', jerseyNumber: 32 },
  { slug: 'larry-bird', teamAbbr: 'BOS', era: 'historical', position: 'SF', jerseyNumber: 33 },
  { slug: 'kareem-abdul-jabbar', teamAbbr: 'LAL', era: 'historical', position: 'C', jerseyNumber: 33 },
  { slug: 'hakeem-olajuwon', teamAbbr: 'HOU', era: 'historical', position: 'C', jerseyNumber: 34 },
  { slug: 'tim-duncan', teamAbbr: 'SAS', era: 'historical', position: 'PF', jerseyNumber: 21 },
  { slug: 'shaquille-oneal', teamAbbr: 'LAL', era: 'historical', position: 'C', jerseyNumber: 34 },
  { slug: 'kobe-bryant', teamAbbr: 'LAL', era: 'historical', position: 'SG', jerseyNumber: 24 },
  { slug: 'allen-iverson', teamAbbr: 'PHI', era: 'historical', position: 'PG', jerseyNumber: 3 },
  { slug: 'scottie-pippen', teamAbbr: 'CHI', era: 'historical', position: 'SF', jerseyNumber: 33 },
  { slug: 'lebron-james', teamAbbr: 'LAL', era: 'modern', position: 'SF', jerseyNumber: 23 },
  { slug: 'stephen-curry', teamAbbr: 'GSW', era: 'modern', position: 'PG', jerseyNumber: 30 },
  { slug: 'kevin-durant', teamAbbr: 'PHX', era: 'modern', position: 'SF', jerseyNumber: 35 },
  { slug: 'giannis-antetokounmpo', teamAbbr: 'MIL', era: 'modern', position: 'PF', jerseyNumber: 34 },
  { slug: 'nikola-jokic', teamAbbr: 'DEN', era: 'modern', position: 'C', jerseyNumber: 15 },
  { slug: 'joel-embiid', teamAbbr: 'PHI', era: 'modern', position: 'C', jerseyNumber: 21 },
  { slug: 'luka-doncic', teamAbbr: 'DAL', era: 'modern', position: 'PG', jerseyNumber: 77 },
  { slug: 'jayson-tatum', teamAbbr: 'BOS', era: 'modern', position: 'SF', jerseyNumber: 0 },
  { slug: 'devin-booker', teamAbbr: 'PHX', era: 'modern', position: 'SG', jerseyNumber: 1 },
  { slug: 'damian-lillard', teamAbbr: 'MIL', era: 'modern', position: 'PG', jerseyNumber: 0 },
  { slug: 'anthony-davis', teamAbbr: 'LAL', era: 'modern', position: 'PF', jerseyNumber: 3 },
  { slug: 'jimmy-butler', teamAbbr: 'MIA', era: 'modern', position: 'SF', jerseyNumber: 22 },
  { slug: 'ja-morant', teamAbbr: 'MEM', era: 'modern', position: 'PG', jerseyNumber: 12 },
  { slug: 'shai-gilgeous-alexander', teamAbbr: 'OKC', era: 'modern', position: 'SG', jerseyNumber: 2 },
];

const API_BASE = process.env.NBA2K_API_BASE ?? 'https://www.nba2kapi.com';
const API_KEY = process.env.NBA2K_API_KEY;

async function fetchPlayer(slug: string): Promise<{
  name: string;
  overall: number;
  ratings: RawRatings;
}> {
  const res = await fetch(`${API_BASE}/api/players/slug/${slug}`, {
    headers: { 'X-API-Key': API_KEY as string },
  });
  if (!res.ok) {
    throw new Error(`${slug}: HTTP ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as Record<string, unknown>;
  // The payload nests differ between API versions; accept the common shapes.
  const data = (body.data ?? body) as Record<string, unknown>;
  const ratings = (data.attributes ?? data) as RawRatings;
  const name = String(data.name ?? slug);
  const overall = Number(
    (ratings.overall ?? ratings.overallAttribute ?? 75) as number
  );
  return { name, overall, ratings };
}

async function main(): Promise<void> {
  if (!API_KEY) {
    console.error(
      'NBA2K_API_KEY is not set. Run:\n' +
        '  NBA2K_API_KEY=your_key npx tsx scripts/fetch-nba.ts'
    );
    process.exit(1);
  }

  const players = [];
  for (const entry of ROSTER) {
    try {
      const { name, overall, ratings } = await fetchPlayer(entry.slug);
      players.push({
        name,
        slug: entry.slug,
        teamAbbr: entry.teamAbbr,
        era: entry.era,
        position: entry.position,
        jerseyNumber: entry.jerseyNumber,
        overall,
        stats: mapRatingsToStats(ratings),
      });
      console.log(`ok   ${entry.slug} -> ${name} (${overall})`);
    } catch (err) {
      console.warn(`skip ${entry.slug}: ${(err as Error).message}`);
    }
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const out = join(here, '..', 'src', 'data', 'nba-players.json');
  writeFileSync(out, JSON.stringify(players, null, 2) + '\n');
  console.log(`\nWrote ${players.length} players to ${out}`);
}

main();
