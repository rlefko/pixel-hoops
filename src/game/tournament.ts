import type { Archetype } from '@/types/player';
import { createPlayer } from '@/types/player';
import type { Roster, RosterPlayer, Position } from '@/types/roster';
import { POSITIONS, POSITION_ARCHETYPE } from '@/types/roster';
import type { GamePlan, Focus, Pace } from '@/types/tactics';
import type { RNG } from './rng';
import { clamp, scaleStatsToLevel } from './stat-scaling';
import {
  pickRealTeam,
  realPlayerToRosterPlayer,
  legendForTeam,
  modernStartersForTeam,
  poolByClass,
  freeAgentPool,
} from './player-pool';
import { anchorStatsToClass, classShift, classTargetOvr, scaleLegendToLevel } from './classes';
import { type LadderClass } from './difficulty-mode';
import type { PlayerClass } from './ratings';
import { isSpecialistStats } from './specialty';
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

/** Map a continuous difficulty level (~10-22 on the widened scale) to an integer
 * archetype band 1-7, preserving the old progression: guard-heavy early, big-heavy
 * late. The level lives in OVR space (doubled), so halve it before banding. */
function levelToBand(level: number): number {
  return clamp(Math.round(level / 2 - 4), 1, 7);
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

/**
 * A procedural player of a target class at a position. The ONLY source of D-class
 * players (the streetball floor the player starts with) and a last-resort fill
 * when a real-class pool is somehow empty; every class above D is otherwise a real
 * player. Builds an archetype-shaped line, anchors it into the class band, and
 * stamps the class so the card and draft read consistently.
 */
export function generatePlayerOfClass(
  cls: PlayerClass,
  position: Position,
  rng: RNG
): RosterPlayer {
  const archetype = POSITION_ARCHETYPE[position];
  const base = createPlayer(generateNameSeeded(rng), archetype, rng.int);
  // Spread the line across the class's OVR window by a random quality, so a fresh
  // class is not a row of identical overalls (a strong D vs a weak D).
  const targetOvr = classTargetOvr(cls, rng.next());
  return {
    player: { ...base, stats: anchorStatsToClass(base.stats, cls, position, targetOvr) },
    position,
    originalClass: cls,
  };
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
 * How far above the boss node's level a headlining legend is fielded. The legend is
 * scaled to `level + this` (preserving shape, never buffed past its natural ability),
 * so it is a tough headliner that grows with the run and only reaches full power on
 * the late maps / top ladders, instead of an unscaled OVR-20+ wall on the first map.
 */
const LEGEND_BOSS_PREMIUM = 2;

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

  // The headlining legend(s) are scaled toward the node level (a notch above the
  // other starters) instead of fielded at full, un-capped power, so an early-map boss
  // is a real fight rather than a wall. Their specialized shape, name, and ability are
  // kept; only the magnitude is brought down (and never up).
  const fieldLegend = (rp: RosterPlayer): RosterPlayer => ({
    ...rp,
    player: {
      ...rp.player,
      stats: scaleLegendToLevel(rp.player.stats, rp.position, level + LEGEND_BOSS_PREMIUM),
    },
  });
  const starters = POSITIONS.map((position) => {
    if (legend && legendSlot === position) return fieldLegend(legend);
    if (legend2 && legend2Slot === position) return fieldLegend(legend2);
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

/** Pick one untaken REAL player of a class, or null if that class pool is dry.
 * Recruits keep their real, class-banded ratings (they are not level-scaled): a
 * C-ladder recruit is a real C-class player. */
function pickRealOfClass(
  cls: PlayerClass,
  taken: Set<string>,
  rng: RNG
): RosterPlayer | null {
  const available = poolByClass(cls).filter((p) => !taken.has(p.name));
  if (available.length === 0) return null;
  return realPlayerToRosterPlayer(rng.pick(available));
}

/**
 * A real play-style specialist (elite blocking/stealing/strength/rebounding),
 * preferring the run's ladder class but widening to the whole pool so the recruit
 * pity can always surface one. Returns null only if every specialist is taken.
 */
export function pickSpecialistOfClass(
  cls: PlayerClass,
  taken: Set<string>,
  rng: RNG
): RosterPlayer | null {
  const atClass = poolByClass(cls).filter(
    (p) => !taken.has(p.name) && isSpecialistStats(p.stats)
  );
  const available =
    atClass.length > 0
      ? atClass
      : freeAgentPool().filter((p) => !taken.has(p.name) && isSpecialistStats(p.stats));
  if (available.length === 0) return null;
  return realPlayerToRosterPlayer(rng.pick(available));
}

/**
 * Deterministic recruit candidates for a recruit node. Offers are shaped by RARITY, not
 * ladder position (see recruitClassWeights): on the C/B/A ladders each offer is mostly the
 * ladder class (roster depth), with a small chance of the class below and a rare reach-up to
 * the class above. The reach-up is DISABLED when it would produce S or a legend (S+), so
 * lower ladders never leak S-class stars into your collection. On the S / S+ ladder offers
 * are a 60/40 mix of S and A, so even endless S-ladder replay only trickles S copies and an
 * S recruit stays a treat (the real S-ladder highlight is the separate, pity-gated legend
 * reveal). If a class pool is exhausted the pick falls back to the ladder class, then any
 * untaken real, then a procedural player. The map-progress argument is retained for
 * signature/back-compat; offers no longer ramp by map.
 */
export function generateRecruitOffers(
  ladderClass: LadderClass,
  mapProgress: number,
  count: number,
  rng: RNG,
  exclude: Set<string> = new Set()
): RosterPlayer[] {
  const weights = recruitClassWeights(ladderClass);
  const taken = new Set(exclude);
  const offers: RosterPlayer[] = [];
  for (let i = 0; i < count; i++) {
    const target = rng.weightedPick(weights);
    const chosen =
      pickRealOfClass(target, taken, rng) ??
      pickRealOfClass(ladderClass, taken, rng) ??
      pickAnyUntakenReal(taken, rng) ??
      generatePlayerOfClass(ladderClass, rng.pick(POSITIONS), rng);
    taken.add(chosen.player.name);
    offers.push(chosen);
  }
  return offers;
}

/**
 * Per-offer class weights, shaped by rarity. The S / S+ ladder mixes S with A (60/40) so S
 * stays scarce under repeat farming; every other ladder is ladder-primary with a little
 * depth below and a rare reach-up that is BARRED from producing S/S+ (so no A-ladder S leak).
 * classShift clamps at the ladder ends; the D class has no real pool, so it is dropped.
 */
function recruitClassWeights(ladderClass: LadderClass): [PlayerClass, number][] {
  if (ladderClass === 'S' || ladderClass === 'S+') {
    return [
      ['S', 60],
      ['A', 40],
    ];
  }
  const below = classShift(ladderClass, -1);
  const above = classShift(ladderClass, 1);
  const entries: [PlayerClass, number][] = [[ladderClass, 85]];
  if (below !== 'D') entries.push([below, 12]);
  if (above !== 'S' && above !== 'S+') entries.push([above, 3]);
  return entries;
}

/** Any untaken real from the whole class pool, for the rare exhausted-bucket case. */
function pickAnyUntakenReal(taken: Set<string>, rng: RNG): RosterPlayer | null {
  const available = freeAgentPool().filter((p) => !taken.has(p.name));
  if (available.length === 0) return null;
  return realPlayerToRosterPlayer(rng.pick(available));
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

/** Pick one untaken real of a class at a position, or null if none. */
function pickRealAtPosition(
  cls: PlayerClass,
  position: Position,
  used: Set<string>,
  rng: RNG
): RosterPlayer | null {
  const available = poolByClass(cls).filter(
    (p) => p.position === position && !used.has(p.slug)
  );
  if (available.length === 0) return null;
  const chosen = rng.pick(available);
  used.add(chosen.slug);
  return realPlayerToRosterPlayer(chosen);
}

/**
 * The player's starting twelve: 5 D-class (procedural streetball, one per
 * position) + 5 C-class + 2 B-class (real players). The only place D-class players
 * are seeded; every higher-class starter is a real NBA player. Deterministic.
 */
export function buildStartingTwelve(rng: RNG): RosterPlayer[] {
  const players: RosterPlayer[] = [];
  const used = new Set<string>();
  for (const position of POSITIONS) {
    players.push(generatePlayerOfClass('D', position, rng));
  }
  for (const position of POSITIONS) {
    players.push(pickRealAtPosition('C', position, used, rng) ?? generatePlayerOfClass('C', position, rng));
  }
  // Two B-class anchors: a guard and a big.
  for (const position of ['PG', 'C'] as Position[]) {
    players.push(pickRealAtPosition('B', position, used, rng) ?? generatePlayerOfClass('B', position, rng));
  }
  return players;
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
