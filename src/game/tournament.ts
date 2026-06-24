import type { Archetype } from '@/types/player';
import { createPlayer } from '@/types/player';
import type { Roster, RosterPlayer, Position } from '@/types/roster';
import {
  POSITIONS,
  POSITION_ARCHETYPE,
  ARCHETYPE_POSITION,
} from '@/types/roster';
import type { GamePlan, Focus, Pace } from '@/types/tactics';
import type { RNG } from './rng';
import { clamp, scaleStatsToLevel } from './stat-scaling';
import {
  pickRealTeam,
  realPlayerToRosterPlayer,
  legendForTeam,
  modernStartersForTeam,
  freeAgentPool,
} from './player-pool';
import type { RealPlayer } from '@/types/nba';

// Re-exported so existing importers (and tests) can keep using
// `@/game/tournament` as the entry point for difficulty scaling.
export { getStatRangeForLevel } from './stat-scaling';

// ---------------------------------------------------------------------------
// Streetball name generator
// ---------------------------------------------------------------------------

// Large realistic pools so procedural fill-ins (deep benches, exhausted real
// pools) read like real players, not corny streetball handles. ~64 x ~64 keeps
// repeats rare, and no quoted "nickname" gimmick.
const FIRST_NAMES = [
  'Marcus', 'Andre', 'Devin', 'Tyler', 'Brandon', 'Cameron', 'Malik', 'Isaiah',
  'Trey', 'Darius', 'Xavier', 'Terrence', 'Jalen', 'Anthony', 'Carlos', 'Miguel',
  'Dennis', 'Victor', 'Derrick', 'Eric', 'Aaron', 'Tobias', 'Caleb', 'Cole',
  'Grant', 'Keegan', 'Spencer', 'Kyle', 'Norman', 'Gary', 'Jamal', 'Bradley',
  'Quinn', 'Elijah', 'Josiah', 'Amir', 'Trevor', 'Garrett', 'Mason', 'Hunter',
  'Bryce', 'Dalton', 'Preston', 'Julian', 'Marquis', 'Roman', 'Andres', 'Lorenzo',
  'Theo', 'Ivan', 'Bruno', 'Marko', 'Niko', 'Emeka', 'Dejan', 'Lucas',
  'Mateo', 'Andrei', 'Damon', 'Reggie', 'Solomon', 'Curtis', 'Maurice', 'Vincent',
];

const LAST_NAMES = [
  'Coleman', 'Bishop', 'Hayes', 'Foster', 'Caldwell', 'Sutton', 'Vance', 'Mercer',
  'Sterling', 'Holloway', 'Avery', 'Dawson', 'Reyes', 'Castillo', 'Mendez', 'Sullivan',
  'Hampton', 'Calloway', 'Ferguson', 'Whitfield', 'Sinclair', 'Barnett', 'Hollis', 'Granger',
  'Lockhart', 'Ashford', 'Carver', 'Easton', 'Faulkner', 'Garrison', 'Harlow', 'Jennings',
  'Kingsley', 'Langston', 'Mathis', 'Norwood', 'Oakley', 'Prescott', 'Radford', 'Stratton',
  'Thorne', 'Underwood', 'Vaughn', 'Winslow', 'Yates', 'Abbott', 'Boone', 'Chambers',
  'Ellison', 'Fletcher', 'Gibson', 'Harmon', 'Ingram', 'Jefferson', 'Kemp', 'Lawson',
  'Maddox', 'Nash', 'Osborne', 'Patton', 'Rollins', 'Singleton', 'Tanner', 'Walters',
];

/** Generate a random realistic opponent name (no nickname). */
export function generateOpponentName(): string {
  return `${FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]}`;
}

// ---------------------------------------------------------------------------
// Archetype selection by difficulty band
// ---------------------------------------------------------------------------

/** Which archetypes appear in each difficulty band (1-7) and how heavily. */
const ARCHETYPE_WEIGHTS: Record<string, Record<Archetype, number>> = {
  '1': {
    'point-guard': 5,
    'shooting-guard': 3,
    'small-forward': 2,
    'power-forward': 1,
    center: 1,
  },
  '2': {
    'point-guard': 4,
    'shooting-guard': 3,
    'small-forward': 3,
    'power-forward': 2,
    center: 2,
  },
  '3': {
    'point-guard': 3,
    'shooting-guard': 3,
    'small-forward': 3,
    'power-forward': 3,
    center: 3,
  },
  '4': {
    'point-guard': 2,
    'shooting-guard': 3,
    'small-forward': 3,
    'power-forward': 4,
    center: 4,
  },
  '5': {
    'point-guard': 1,
    'shooting-guard': 2,
    'small-forward': 3,
    'power-forward': 5,
    center: 5,
  },
  '6': {
    'point-guard': 1,
    'shooting-guard': 1,
    'small-forward': 2,
    'power-forward': 5,
    center: 5,
  },
  '7': {
    'point-guard': 0,
    'shooting-guard': 1,
    'small-forward': 1,
    'power-forward': 5,
    center: 5,
  },
};

/** Map a continuous difficulty level (~5-10) to an integer archetype band 1-7,
 * preserving the old progression: guard-heavy early, big-heavy late. */
function levelToBand(level: number): number {
  return clamp(Math.round(level - 4), 1, 7);
}

/** The archetypes (and weights) that appear at a given difficulty level. */
export function archetypeWeightsForLevel(level: number): Record<Archetype, number> {
  return ARCHETYPE_WEIGHTS[String(levelToBand(level))] ?? ARCHETYPE_WEIGHTS['1'];
}

// ---------------------------------------------------------------------------
// Seeded 5-on-5 team generation (auto-sim path)
// ---------------------------------------------------------------------------

const TEAM_NAMES = [
  'Downtown Ballers',
  'The Reapers',
  'Asphalt Kings',
  'Night Owls',
  'Concrete Giants',
  'The Hustlers',
  'Rim Wreckers',
  'Court Vipers',
  'Steel City',
  'The Renegades',
  'Skyline Crew',
  'Backstreet Saints',
];

/** Seeded realistic player name (the auto-sim analog of generateOpponentName). */
function generateNameSeeded(rng: RNG): string {
  return `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
}

/** Seeded team name for an opponent squad. */
export function generateTeamName(rng: RNG): string {
  return rng.pick(TEAM_NAMES);
}

/** Build a five, one player per position, via the seeded RNG. */
function buildSeededFive(rng: RNG, scaleLevel?: number): RosterPlayer[] {
  return POSITIONS.map((position: Position) => {
    const archetype = POSITION_ARCHETYPE[position];
    const base = createPlayer(generateNameSeeded(rng), archetype, rng.int);
    const player =
      scaleLevel !== undefined
        ? { ...base, stats: scaleStatsToLevel(base.stats, scaleLevel, rng) }
        : base;
    return { player, position };
  });
}

/** The player's starting roster: five baseline players, one per position. */
export function buildStartingRoster(rng: RNG): Roster {
  return { starters: buildSeededFive(rng), bench: [] };
}

/** A single fake, difficulty-scaled player for the given floor position. */
function fakePlayerAt(
  position: Position,
  level: number,
  rng: RNG
): RosterPlayer {
  const archetype = POSITION_ARCHETYPE[position];
  const base = createPlayer(generateNameSeeded(rng), archetype, rng.int);
  return {
    player: { ...base, stats: scaleStatsToLevel(base.stats, level, rng) },
    position,
  };
}

/** Wrap a real player as a difficulty-scaled roster player: real identity, scaled stats. */
function scaledFromReal(rp: RealPlayer, level: number, rng: RNG): RosterPlayer {
  const base = realPlayerToRosterPlayer(rp);
  return {
    ...base,
    player: {
      ...base.player,
      stats: scaleStatsToLevel(base.player.stats, level, rng),
    },
  };
}

/**
 * A real franchise starter at `position`, difficulty-scaled so the curve holds
 * while the opponent wears a real name, team, and jersey number. Falls back to a
 * procedural fake when the franchise has no real starter at the slot.
 */
function realStarterAt(
  position: Position,
  level: number,
  rng: RNG,
  pool: RealPlayer[]
): RosterPlayer {
  const matches = pool.filter((p) => p.position === position);
  if (matches.length === 0) return fakePlayerAt(position, level, rng);
  return scaledFromReal(rng.pick(matches), level, rng);
}

/** Bench players an opponent carries for in-game rotation. */
const OPPONENT_BENCH_SIZE = 3;

/**
 * A difficulty-scaled opponent: a real NBA franchise (name + colors) fielding its
 * REAL starting five (scaled to the node's difficulty level, so balance holds),
 * with a procedural fallback per slot when the franchise lacks a real there. A
 * boss additionally is headlined by that franchise's all-time LEGEND (unscaled,
 * gold) at the legend's own position. Regular games never field a legend. Seeded.
 *
 * DETERMINISM: the franchise identity is the FIRST RNG draw (`pickRealTeam`).
 * The run map previews each opponent's color from that exact draw before the
 * game is built (see src/game/opponent-preview.ts), so `pickRealTeam` MUST stay
 * first. The boss-legend draw follows immediately, then the per-slot starters.
 */
export function generateOpponentTeam(
  level: number,
  rng: RNG,
  opts?: { isBoss?: boolean; extraLegend?: boolean }
): { name: string; roster: Roster; colorHex: string; accentHex: string } {
  const team = pickRealTeam(rng); // MUST remain the first draw
  const isBoss = opts?.isBoss ?? false;
  const pool = modernStartersForTeam(team.abbreviation);

  // Every boss is headlined by its own franchise legend (unscaled, gold) at the
  // legend's natural position; the other four slots are real franchise starters.
  // A high League tier can stack a SECOND legend at a different slot.
  let legend: RosterPlayer | null = null;
  let legendSlot: Position | null = null;
  let legend2: RosterPlayer | null = null;
  let legend2Slot: Position | null = null;
  if (isBoss) {
    legend = legendForTeam(team.abbreviation, rng);
    if (legend) legendSlot = legend.position;
    if (opts?.extraLegend) {
      const l2 = legendForTeam(team.abbreviation, rng);
      if (l2 && l2.position !== legendSlot) {
        legend2 = l2;
        legend2Slot = l2.position;
      }
    }
  }

  const starters = POSITIONS.map((position) => {
    if (legend && legendSlot === position) return legend;
    if (legend2 && legend2Slot === position) return legend2;
    return realStarterAt(position, level, rng, pool);
  });
  // A short bench so opponents rotate too (procedural fakes only).
  const bench = Array.from({ length: OPPONENT_BENCH_SIZE }, () =>
    fakePlayerAt(rng.pick(POSITIONS), level, rng)
  );
  return {
    name: `${team.city} ${team.name}`,
    roster: { starters, bench },
    colorHex: team.primaryHex,
    accentHex: team.secondaryHex,
  };
}

/** One procedural, difficulty-scaled recruit (archetype weighted by run depth). */
function fakeRecruit(level: number, rng: RNG): RosterPlayer {
  const weights = Object.entries(archetypeWeightsForLevel(level)) as [
    Archetype,
    number,
  ][];
  const archetype = rng.weightedPick(weights);
  const base = createPlayer(generateNameSeeded(rng), archetype, rng.int);
  return {
    player: { ...base, stats: scaleStatsToLevel(base.stats, level, rng) },
    position: ARCHETYPE_POSITION[archetype],
  };
}

/**
 * Deterministic recruit candidates for a recruit node, scaled to the node's
 * difficulty level. Keepable recruits are real free agents drawn from the
 * modern-starter pool, skipping any player in `exclude` (the squad already owns
 * them) and any already offered this visit; a procedural player backfills when
 * the pool runs dry. Real all-time legends are never keepable here: they surface
 * only as the rare on-loan legendary offer, gated separately by the run machine.
 */
export function generateRecruitOffers(
  level: number,
  count: number,
  rng: RNG,
  exclude: Set<string> = new Set()
): RosterPlayer[] {
  const pool = freeAgentPool();
  const taken = new Set(exclude);
  const offers: RosterPlayer[] = [];
  for (let i = 0; i < count; i++) {
    const available = pool.filter((p) => !taken.has(p.name));
    if (available.length === 0) {
      offers.push(fakeRecruit(level, rng));
      continue;
    }
    const chosen = rng.pick(available);
    taken.add(chosen.name);
    offers.push(scaledFromReal(chosen, level, rng));
  }
  return offers;
}

/**
 * The player's starting five: five real "free agents", one per position, drawn
 * deterministically from the modern-starter pool with no duplicate players.
 * Authored (unscaled) ratings, so a fresh roster fields recognizable real
 * talent. A procedural player backfills any position the pool cannot cover.
 */
export function pickFreeAgentFive(rng: RNG): RosterPlayer[] {
  const pool = freeAgentPool();
  const used = new Set<string>();
  return POSITIONS.map((position) => {
    const matches = pool.filter(
      (p) => p.position === position && !used.has(p.slug)
    );
    if (matches.length === 0) {
      const archetype = POSITION_ARCHETYPE[position];
      return { player: createPlayer(generateNameSeeded(rng), archetype, rng.int), position };
    }
    const chosen = rng.pick(matches);
    used.add(chosen.slug);
    return realPlayerToRosterPlayer(chosen);
  });
}

/**
 * Pick a game plan that suits a roster: guard-heavy teams run and shoot,
 * big-heavy teams grind inside. Used to give opponents distinct tendencies.
 */
export function planForRoster(roster: Roster): GamePlan {
  let guards = 0;
  let bigs = 0;
  for (const rp of roster.starters) {
    if (rp.position === 'PG' || rp.position === 'SG') guards += 1;
    else if (rp.position === 'PF' || rp.position === 'C') bigs += 1;
  }
  let focus: Focus = 'balanced';
  let pace: Pace = 'balanced';
  if (guards > bigs) {
    focus = 'outside';
    pace = 'fast';
  } else if (bigs > guards) {
    focus = 'inside';
    pace = 'slow';
  }
  return { pace, focus, starPlayerIndex: null };
}
