/**
 * Offline NBA dataset baker. Pulls ratings from the NBA 2K API
 * (https://www.nba2kapi.com) and writes baked JSON under src/data. The app NEVER
 * calls the API at runtime, so the sim stays deterministic, offline, and the API
 * key never ships.
 *
 * Two modes:
 *   NBA2K_API_KEY=key npx tsx scripts/fetch-nba.ts --mode=legends   (default)
 *     Bakes the curated all-time-great LEGEND pool to src/data/nba-legends.json.
 *     One request per slug in ROSTER (~40). The `legendary` flag and each legend's
 *     signature `ability` are hand-maintained after a bake (the API gives neither).
 *
 *   NBA2K_API_KEY=key npx tsx scripts/fetch-nba.ts --mode=pool
 *     Bakes a LARGE real-player pool (~400-500 current players, all classes) to
 *     src/data/nba-pool.json. Uses the PAGINATED list endpoint (limit=100), so the
 *     whole pool is only ~7 requests: it never fans out per-slug. Each player is
 *     bucketed into a class (C/B/A/S) by 2K overall, and its in-game stats are
 *     anchored into that class's band (src/game/classes.ts) so a class badge always
 *     matches the scaling band. Pool players have no `ability` and are not legends.
 *
 * Rate limit: the 2K API allows 500 requests/day. A full re-bake of BOTH modes is
 * ~45 requests, far under the cap. A short delay is inserted between list pages.
 *
 * Optional env:
 *   NBA2K_API_BASE   override the API base URL (default below)
 *
 * The key is read from the environment only. Do not hardcode it or commit it.
 * Team colors live in src/data/nba-teams.json and are maintained by hand.
 */

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapRatingsToStats, type RawRatings } from '../src/game/nba-map';
import { anchorStatsToClass } from '../src/game/classes';
import { ovr, classForOvr, type PlayerClass } from '../src/game/ratings';
import teams from '../src/data/nba-teams.json';
import legendsData from '../src/data/nba-legends.json';

type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';
type Era = 'historical' | 'modern';

/** Who to bake (legend mode), with the metadata the ratings API does not give us cleanly. */
interface RosterEntry {
  slug: string;
  teamAbbr: string;
  era: Era;
  position: Position;
  jerseyNumber: number;
}

// Edit this list to change the baked LEGEND pool. Slugs match the API's player slugs.
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
  { slug: 'dominique-wilkins', teamAbbr: 'ATL', era: 'historical', position: 'SF', jerseyNumber: 21 },
  { slug: 'jason-kidd', teamAbbr: 'BKN', era: 'historical', position: 'PG', jerseyNumber: 5 },
  { slug: 'larry-johnson', teamAbbr: 'CHA', era: 'historical', position: 'PF', jerseyNumber: 2 },
  { slug: 'mark-price', teamAbbr: 'CLE', era: 'historical', position: 'PG', jerseyNumber: 25 },
  { slug: 'isiah-thomas', teamAbbr: 'DET', era: 'historical', position: 'PG', jerseyNumber: 11 },
  { slug: 'reggie-miller', teamAbbr: 'IND', era: 'historical', position: 'SG', jerseyNumber: 31 },
  { slug: 'chris-paul', teamAbbr: 'LAC', era: 'modern', position: 'PG', jerseyNumber: 3 },
  { slug: 'kevin-garnett', teamAbbr: 'MIN', era: 'historical', position: 'PF', jerseyNumber: 21 },
  { slug: 'zion-williamson', teamAbbr: 'NOP', era: 'modern', position: 'PF', jerseyNumber: 1 },
  { slug: 'patrick-ewing', teamAbbr: 'NYK', era: 'historical', position: 'C', jerseyNumber: 33 },
  { slug: 'tracy-mcgrady', teamAbbr: 'ORL', era: 'historical', position: 'SF', jerseyNumber: 1 },
  { slug: 'clyde-drexler', teamAbbr: 'POR', era: 'historical', position: 'SG', jerseyNumber: 22 },
  { slug: 'chris-webber', teamAbbr: 'SAC', era: 'historical', position: 'PF', jerseyNumber: 4 },
  { slug: 'vince-carter', teamAbbr: 'TOR', era: 'historical', position: 'SG', jerseyNumber: 15 },
  { slug: 'karl-malone', teamAbbr: 'UTA', era: 'historical', position: 'PF', jerseyNumber: 32 },
  { slug: 'gilbert-arenas', teamAbbr: 'WAS', era: 'historical', position: 'SG', jerseyNumber: 0 },
];

const API_BASE = process.env.NBA2K_API_BASE ?? 'https://api.nba2kapi.com';
const API_KEY = process.env.NBA2K_API_KEY;
const POSITIONS: readonly Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'src', 'data');

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Map the API's full team name ("Denver Nuggets") to our 3-letter abbreviation.
const TEAM_BY_FULLNAME = new Map<string, string>(
  (teams as { name: string; city: string; abbreviation: string }[]).map((t) => [
    `${t.city} ${t.name}`,
    t.abbreviation,
  ])
);

/** Lowercase hyphen slug ("Los Angeles Lakers" -> "los-angeles-lakers"). */
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Map our 3-letter abbreviation to the team's slug fragment, used to disambiguate
// an all-time card whose slug encodes the team (michael-jordan-all-time-chicago-bulls).
const ABBR_TO_TEAMSLUG = new Map<string, string>(
  (teams as { name: string; city: string; abbreviation: string }[]).map((t) => [
    t.abbreviation,
    slugify(`${t.city} ${t.name}`),
  ])
);

/** Expand a legacy 3-10 stat to the new elite band [6, 24] (a fallback for any
 * curated legend not present in the API, mirroring nba-map's scaleRatingElite). */
function expandEliteOld(old: number): number {
  return Math.round(6 + ((old - 3) / 7) * (24 - 6));
}

/** Deterministic jersey number (0-98) from a slug, for pool players (the API list
 * endpoint does not return one). */
function jerseyFromSlug(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return h % 99;
}

/** Bucket a 2K overall (0-99) into an intrinsic class. Reals span C-S; D is the
 * procedural floor and S+ is the hand-curated legend tier, handled elsewhere. */
function classFor2KOverall(overall: number): PlayerClass {
  if (overall >= 89) return 'S';
  if (overall >= 82) return 'A';
  if (overall >= 75) return 'B';
  return 'C';
}

function firstKnownPosition(positions: unknown): Position | null {
  if (!Array.isArray(positions)) return null;
  for (const p of positions) {
    if (typeof p === 'string' && (POSITIONS as readonly string[]).includes(p)) {
      return p as Position;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Legend mode (all-time + current lists)
// ---------------------------------------------------------------------------

interface LegendMeta {
  legendary?: boolean;
  ability?: string;
  stats?: Record<string, number>;
}

/**
 * Find the API card for a curated ROSTER entry. Modern players match their exact
 * current slug; historical greats live under `teamType=allt` with a team-encoded
 * slug ("michael-jordan-all-time-chicago-bulls"), so match the all-time variant,
 * preferring the one whose slug carries the entry's team.
 */
function matchCard(
  entry: RosterEntry,
  bySlug: Map<string, ApiListPlayer>,
  allt: ApiListPlayer[]
): ApiListPlayer | undefined {
  const exact = bySlug.get(entry.slug);
  if (exact) return exact;
  const variants = allt.filter((p) => p.slug?.startsWith(`${entry.slug}-all-time`));
  if (variants.length === 0) return undefined;
  const teamSlug = ABBR_TO_TEAMSLUG.get(entry.teamAbbr);
  const teamMatch = teamSlug && variants.find((p) => p.slug?.includes(teamSlug));
  return (
    teamMatch ||
    [...variants].sort((a, b) => Number(b.overall ?? 0) - Number(a.overall ?? 0))[0]
  );
}

async function bakeLegends(): Promise<void> {
  // Carry over the hand-maintained `legendary` flag, signature `ability`, and the
  // curated clutch flavor (the API has no clutch attribute) from the existing baked
  // file, keyed by slug, so a re-bake preserves them.
  const meta = new Map<string, LegendMeta>(
    (legendsData as ({ slug: string } & LegendMeta)[]).map((l) => [
      l.slug,
      { legendary: l.legendary, ability: l.ability, stats: l.stats },
    ])
  );

  const [curr, allt] = [await fetchAll('curr'), await fetchAll('allt')];
  const bySlug = new Map<string, ApiListPlayer>();
  for (const p of curr) if (p.slug) bySlug.set(p.slug, p); // modern players: exact slug

  const players = [];
  for (const entry of ROSTER) {
    const m = meta.get(entry.slug);
    const card = matchCard(entry, bySlug, allt);
    let stats;
    let overall: number;
    if (card?.attributes) {
      // Inject the real overall so missing attributes (e.g. clutch) fall back to the
      // player's level, not a flat 75. Bake into the 6-24 elite band.
      overall = Number(card.overall ?? 0);
      stats = mapRatingsToStats({ ...card.attributes, overall }, { elite: true });
      // The API exposes no "clutch": keep the curated, hand-tuned clutch flavor.
      if (typeof m?.stats?.clutch === 'number') stats.clutch = expandEliteOld(m.stats.clutch);
      console.log(`ok   ${entry.slug} -> ${card.name} (${overall}) [${card.slug}]`);
    } else if (m?.stats) {
      // Not in the API: expand the existing curated 3-10 line into the elite band.
      overall = Number((legendsData as ({ slug: string; overall?: number })[]).find((l) => l.slug === entry.slug)?.overall ?? 0);
      stats = Object.fromEntries(Object.entries(m.stats).map(([k, v]) => [k, expandEliteOld(v)]));
      console.log(`keep ${entry.slug} (not in API; expanded curated line)`);
    } else {
      console.warn(`skip ${entry.slug}: no API card and no curated fallback`);
      continue;
    }
    players.push({
      name: card?.name ?? entry.slug,
      slug: entry.slug,
      teamAbbr: entry.teamAbbr,
      era: entry.era,
      position: entry.position,
      jerseyNumber: entry.jerseyNumber,
      overall,
      legendary: m?.legendary ?? true,
      ability: m?.ability,
      stats,
    });
  }
  const out = join(outDir, 'nba-legends.json');
  writeFileSync(out, JSON.stringify(players, null, 2) + '\n');
  console.log(`\nWrote ${players.length} legends to ${out}`);
}

// ---------------------------------------------------------------------------
// Pool mode (paginated list)
// ---------------------------------------------------------------------------

interface ApiListPlayer {
  name?: string;
  slug?: string;
  team?: string;
  teamType?: string;
  positions?: unknown;
  overall?: number;
  attributes?: RawRatings;
}

async function fetchPage(
  cursor: string | null,
  teamType?: string
): Promise<{
  players: ApiListPlayer[];
  nextCursor: string | null;
}> {
  const url = new URL(`${API_BASE}/api/players`);
  url.searchParams.set('limit', '100');
  if (teamType) url.searchParams.set('teamType', teamType);
  if (cursor) url.searchParams.set('cursor', cursor);
  const res = await fetch(url, { headers: { 'X-API-Key': API_KEY as string } });
  if (!res.ok) throw new Error(`list: HTTP ${res.status} ${res.statusText}`);
  const body = (await res.json()) as {
    data?: ApiListPlayer[];
    meta?: { pagination?: { hasMore?: boolean; nextCursor?: string } };
  };
  const players = body.data ?? [];
  const pag = body.meta?.pagination;
  return { players, nextCursor: pag?.hasMore ? (pag.nextCursor ?? null) : null };
}

/** Page through every player of a teamType ("curr" current, "allt" all-time). */
async function fetchAll(teamType: string): Promise<ApiListPlayer[]> {
  const all: ApiListPlayer[] = [];
  let cursor: string | null = null;
  let page = 0;
  do {
    const { players, nextCursor } = await fetchPage(cursor, teamType);
    all.push(...players);
    cursor = nextCursor;
    page += 1;
    if (cursor) await sleep(300);
  } while (cursor && page < 12);
  console.log(`fetched ${all.length} ${teamType} players`);
  return all;
}

async function bakePool(): Promise<void> {
  const raw: ApiListPlayer[] = [];
  let cursor: string | null = null;
  let page = 0;
  do {
    const { players, nextCursor } = await fetchPage(cursor);
    raw.push(...players);
    cursor = nextCursor;
    page += 1;
    console.log(`page ${page}: +${players.length} (total ${raw.length})`);
    if (cursor) await sleep(300); // be polite between pages
  } while (cursor && page < 12);

  // Players already in the curated legend pool are the S+ tier; never duplicate
  // them into the C-S class pool.
  const legendSlugs = new Set((legendsData as { slug: string }[]).map((l) => l.slug));

  // The list endpoint can return a player under more than one team (recent-trade
  // ambiguity); keep one entry per slug, preferring the highest overall.
  const bySlug = new Map<string, ApiListPlayer>();
  for (const p of raw) {
    if (p.teamType && p.teamType !== 'curr') continue; // current rosters only
    if (!p.slug || legendSlugs.has(p.slug)) continue; // skip legends (S+ tier)
    const prev = bySlug.get(p.slug);
    if (!prev || Number(p.overall ?? 0) > Number(prev.overall ?? 0)) bySlug.set(p.slug, p);
  }

  const baked = [];
  let skipped = 0;
  for (const p of bySlug.values()) {
    const position = firstKnownPosition(p.positions);
    const teamAbbr = p.team ? TEAM_BY_FULLNAME.get(p.team) : undefined;
    const overall = Number(p.overall ?? 0);
    if (!position || !teamAbbr || !p.attributes || !p.slug || overall <= 0) {
      skipped += 1;
      continue;
    }
    const originalClass = classFor2KOverall(overall);
    const shape = mapRatingsToStats({ ...p.attributes, overall });
    const stats = anchorStatsToClass(shape, originalClass, position);
    baked.push({
      name: String(p.name ?? p.slug),
      slug: p.slug,
      teamAbbr,
      era: 'modern' as const,
      position,
      jerseyNumber: jerseyFromSlug(p.slug),
      overall,
      originalClass,
      stats,
    });
  }

  // Stable sort: team, then class (strong first), then name, so the file diffs cleanly.
  const classRank: Record<string, number> = { S: 0, A: 1, B: 2, C: 3 };
  baked.sort(
    (a, b) =>
      a.teamAbbr.localeCompare(b.teamAbbr) ||
      (classRank[a.originalClass] ?? 9) - (classRank[b.originalClass] ?? 9) ||
      a.name.localeCompare(b.name)
  );

  const out = join(outDir, 'nba-pool.json');
  writeFileSync(out, JSON.stringify(baked, null, 2) + '\n');

  const byClass: Record<string, number> = {};
  for (const p of baked) byClass[p.originalClass] = (byClass[p.originalClass] ?? 0) + 1;
  // Sanity: confirm the anchored in-game OVR reproduces the bucketed class.
  let mismatch = 0;
  for (const p of baked) if (classForOvr(ovr(p.stats, p.position)) !== p.originalClass) mismatch += 1;
  console.log(`\nWrote ${baked.length} pool players to ${out} (skipped ${skipped})`);
  console.log('class distribution:', JSON.stringify(byClass));
  console.log(`class/OVR mismatches: ${mismatch}`);
}

async function main(): Promise<void> {
  if (!API_KEY) {
    console.error('NBA2K_API_KEY is not set. Run:\n  NBA2K_API_KEY=your_key npx tsx scripts/fetch-nba.ts --mode=pool');
    process.exit(1);
  }
  const mode = (process.argv.find((a) => a.startsWith('--mode='))?.split('=')[1] ?? 'legends') as
    | 'legends'
    | 'pool';
  if (mode === 'pool') await bakePool();
  else await bakeLegends();
}

main();
