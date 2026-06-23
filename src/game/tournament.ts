import type { Archetype } from '@/types/player';
import {
  createPlayer,
  type Player,
  type PlayerStats,
  randomInt,
  SKILL_STAT_KEYS,
} from '@/types/player';
import type { Roster, RosterPlayer, Position } from '@/types/roster';
import {
  POSITIONS,
  POSITION_ARCHETYPE,
  ARCHETYPE_POSITION,
} from '@/types/roster';
import type { GamePlan, Focus, Pace } from '@/types/tactics';
import type { RNG } from './rng';
import { clamp, getRoundStatRange, scaleStatsToRound } from './stat-scaling';
import { pickRealTeam, realPlayerAt, realLegendAt } from './player-pool';

// Re-exported so existing importers (and tests) can keep using
// `@/game/tournament` as the entry point for round scaling.
export { getRoundStatRange } from './stat-scaling';

// ---------------------------------------------------------------------------
// Streetball name generator
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  'Slam',
  'Flash',
  'Ice',
  'Tank',
  'Sky',
  'Dagger',
  'Blaze',
  'Sticky',
  "Lil' Pockets",
  'Bullet',
  'Switchblade',
  'Slick',
  'Freak',
  'Beast',
  'Macho',
  'Thunder',
  'Viper',
  'Ghost',
  'Reaper',
  'Havoc',
];

const LAST_NAMES = [
  'Marcus',
  'Rivera',
  "O'Neal Jr.",
  'Chen',
  'Washington',
  'Carter',
  'Delgado',
  'Petrov',
  'Okafor',
  'McRebound',
  'Basketball Smith',
  'The Wall',
  'Quick',
  'Money',
  'Danger',
  'Steele',
  'Banks',
  'Cross',
];

/** Generate a random streetball-sounding opponent name. */
export function generateOpponentName(): string {
  return `${FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]} "${LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]}"`;
}

// ---------------------------------------------------------------------------
// Archetype selection by round
// ---------------------------------------------------------------------------

/** Which archetypes appear at each round and how heavily weighted. */
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

/** Weighted random archetype selection for a given round. */
function pickArchetype(round: number): Archetype {
  const weights = ARCHETYPE_WEIGHTS[String(Math.min(round, 7))];
  if (!weights) return 'point-guard';

  const entries = Object.entries(weights) as [Archetype, number][];
  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * totalWeight;

  for (const [archetype, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return archetype;
  }

  return 'point-guard'; // Fallback
}

// ---------------------------------------------------------------------------
// Stat scaling by round
// ---------------------------------------------------------------------------

/** Scale the archetypes that appear at a given round. */
export function getRoundArchetypeWeights(
  round: number
): Record<Archetype, number> {
  return (
    ARCHETYPE_WEIGHTS[String(Math.min(round, 7))] ?? ARCHETYPE_WEIGHTS['1']
  );
}

// ---------------------------------------------------------------------------
// Opponent generation
// ---------------------------------------------------------------------------

/** Generate a procedurally-scaled opponent for the given tournament round. */
export function generateOpponent(round: number, playerName?: string): Player {
  const archetype = pickArchetype(round);
  const name = playerName ?? generateOpponentName();
  const basePlayer = createPlayer(name, archetype);
  const range = getRoundStatRange(round);

  // Scale each skill rating within the round's range with some variance;
  // condition ratings (stamina/durability) carry over unscaled.
  const stats: PlayerStats = { ...basePlayer.stats };
  for (const key of SKILL_STAT_KEYS) {
    stats[key] = clamp(basePlayer.stats[key] + randomInt(-1, 2), range.min, range.max);
  }

  return { ...basePlayer, stats };
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

/** Seeded streetball name (the auto-sim analog of generateOpponentName). */
function generateNameSeeded(rng: RNG): string {
  return `${rng.pick(FIRST_NAMES)} "${rng.pick(LAST_NAMES)}"`;
}

/** Seeded team name for an opponent squad. */
export function generateTeamName(rng: RNG): string {
  return rng.pick(TEAM_NAMES);
}

/** Build a five, one player per position, via the seeded RNG. */
function buildSeededFive(rng: RNG, scaleRound?: number): RosterPlayer[] {
  return POSITIONS.map((position: Position) => {
    const archetype = POSITION_ARCHETYPE[position];
    const base = createPlayer(generateNameSeeded(rng), archetype, rng.int);
    const player =
      scaleRound !== undefined
        ? { ...base, stats: scaleStatsToRound(base.stats, scaleRound, rng) }
        : base;
    return { player, position };
  });
}

/** The player's starting roster: five baseline players, one per position. */
export function buildStartingRoster(rng: RNG): Roster {
  return { starters: buildSeededFive(rng), bench: [] };
}

/**
 * Per-five chance a regular opponent fields a single franchise legend, ramping
 * by round. Legends never appear before round 3, and at most one per five, so a
 * real on the opposing team stays a rare, recognizable threat.
 */
function regularLegendChance(round: number): number {
  if (round <= 2) return 0;
  if (round <= 4) return 0.08;
  if (round === 5) return 0.12;
  return 0.15; // rounds 6-7
}

/**
 * Chance a boss fields a guest all-time legend (any franchise), ramping hard in
 * the later rounds so the finale escalates into a marquee matchup.
 */
function bossGuestChance(round: number): number {
  if (round <= 2) return 0;
  if (round === 3) return 0.05;
  if (round === 4) return 0.1;
  if (round === 5) return 0.2;
  if (round === 6) return 0.4;
  return 0.65; // round 7
}

/** A single fake, round-scaled player for the given floor position. */
function fakePlayerAt(
  position: Position,
  round: number,
  rng: RNG
): RosterPlayer {
  const archetype = POSITION_ARCHETYPE[position];
  const base = createPlayer(generateNameSeeded(rng), archetype, rng.int);
  return {
    player: { ...base, stats: scaleStatsToRound(base.stats, round, rng) },
    position,
  };
}

/** Bench players an opponent carries for in-game rotation. */
const OPPONENT_BENCH_SIZE = 3;

/**
 * A round-scaled opponent: a real NBA franchise identity (name + colors) staffed
 * with procedural fakes, plus, rarely, one real player. Regular games gate a
 * single FRANCHISE legend (a real on their own team) by round; bosses can field
 * a GUEST all-time legend from any team. Fully seeded.
 *
 * DETERMINISM: the franchise identity is the FIRST RNG draw (`pickRealTeam`).
 * The run map previews each opponent's color from that exact draw before the
 * game is built (see src/game/opponent-preview.ts), so `pickRealTeam` MUST stay
 * first. The legend/boss rolls follow immediately, then the per-slot fakes.
 */
export function generateOpponentTeam(
  round: number,
  rng: RNG,
  opts?: { isBoss?: boolean }
): { name: string; roster: Roster; colorHex: string; accentHex: string } {
  const team = pickRealTeam(rng); // MUST remain the first draw
  const isBoss = opts?.isBoss ?? false;

  // One roll decides whether this five carries a real legend, then (if so) which
  // slot. Bosses pull a guest legend from any franchise; regular games pull a
  // legend that actually plays for this franchise.
  const legendRoll = rng.next();
  let legendSlot: Position | null = null;
  let bossGuest: RosterPlayer | null = null;
  if (isBoss) {
    if (legendRoll < bossGuestChance(round)) {
      const slot = POSITIONS[rng.int(0, POSITIONS.length - 1)];
      bossGuest = realLegendAt(slot, rng);
    }
  } else if (legendRoll < regularLegendChance(round)) {
    legendSlot = POSITIONS[rng.int(0, POSITIONS.length - 1)];
  }

  const starters = POSITIONS.map((position) => {
    if (bossGuest && bossGuest.position === position) return bossGuest;
    if (legendSlot === position) {
      const legend = realPlayerAt(position, rng, team.abbreviation);
      if (legend) return legend; // franchise has a legend at this slot
    }
    return fakePlayerAt(position, round, rng);
  });
  // A short bench so opponents rotate too (procedural fakes only).
  const bench = Array.from({ length: OPPONENT_BENCH_SIZE }, () =>
    fakePlayerAt(rng.pick(POSITIONS), round, rng)
  );
  return {
    name: `${team.city} ${team.name}`,
    roster: { starters, bench },
    colorHex: team.primaryHex,
    accentHex: team.secondaryHex,
  };
}

/**
 * Deterministic recruit candidates for a recruit node, scaled to run depth.
 * Keepable recruits are procedural streetball players (archetypes weighted by
 * depth). Real players are never keepable; they surface only as the rare on-loan
 * legendary offer, gated separately by the run machine (see run-machine.ts).
 */
export function generateRecruitOffers(
  round: number,
  count: number,
  rng: RNG
): RosterPlayer[] {
  const weights = Object.entries(getRoundArchetypeWeights(round)) as [
    Archetype,
    number,
  ][];
  const offers: RosterPlayer[] = [];
  for (let i = 0; i < count; i++) {
    const archetype = rng.weightedPick(weights);
    const base = createPlayer(generateNameSeeded(rng), archetype, rng.int);
    offers.push({
      player: { ...base, stats: scaleStatsToRound(base.stats, round, rng) },
      position: ARCHETYPE_POSITION[archetype],
    });
  }
  return offers;
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
