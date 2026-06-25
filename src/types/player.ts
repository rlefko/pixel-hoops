/** Player archetypes that define stat distributions and playstyles. */
export type Archetype =
  | 'point-guard'
  | 'shooting-guard'
  | 'small-forward'
  | 'power-forward'
  | 'center';

/**
 * Core ratings on a granular scale: roughly 6 (worst) to 20 (elite) for normal
 * players (base 10), with curated greats reaching ~24 and a hard ceiling of 30
 * via upgrades, run-scoped training, and the toughest bosses. Ten ratings split
 * offense and defense the way real basketball does and add the intangibles
 * accurate sims model (IQ, stamina, durability). The UI keeps this approachable
 * by showing derived composites (OFF/DEF/ATH) and one OVR on the surface, with
 * the full breakdown one tap away (see src/game/ratings.ts).
 */
export interface PlayerStats {
  /** Rim finishing: layups, dunks, post scoring. */
  inside: number;
  /** Jump shooting: midrange and three. */
  outside: number;
  /** Ball handling and passing: drives, assists, ball security. */
  playmaking: number;
  /** Perimeter defense: contests jumpers and drives, forces steals. */
  perimeterD: number;
  /** Interior defense: rim protection, blocks, defensive rebounding. */
  interiorD: number;
  /** Speed, quickness, vertical: pace, transition, finishing burst. */
  athleticism: number;
  /** Basketball IQ: shot selection quality and turnover avoidance. */
  iq: number;
  /** Clutch: a small crunch-time nudge in close fourth quarters. */
  clutch: number;
  /** Stamina: fatigue pool size and how slowly energy drains. */
  stamina: number;
  /** Durability: resistance to injury from accumulated load. */
  durability: number;
}

/**
 * Every rating key, in a fixed order. Generation iterates this so seeded RNG
 * draws are stable: reordering would silently change every generated player.
 */
export const STAT_KEYS: readonly (keyof PlayerStats)[] = [
  'inside',
  'outside',
  'playmaking',
  'perimeterD',
  'interiorD',
  'athleticism',
  'iq',
  'clutch',
  'stamina',
  'durability',
];

/**
 * The eight skill ratings (everything except the two condition ratings). Round
 * scaling and training touch these; stamina/durability are game-state, not a
 * difficulty tier, so they are left out of round scaling.
 */
export const SKILL_STAT_KEYS: readonly (keyof PlayerStats)[] = [
  'inside',
  'outside',
  'playmaking',
  'perimeterD',
  'interiorD',
  'athleticism',
  'iq',
  'clutch',
];

/** A roster player with stats, archetype, and progression data. */
export interface Player {
  name: string;
  archetype: Archetype;
  stats: PlayerStats;
  level: number;
  /** Training XP earned during runs (spendable between runs). */
  trainingXP: number;
}

/** Generate a random integer in [min, max] inclusive. */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * The single source of truth for the rating scale. Declared here (the pure type
 * leaf) so every consumer, including src/game/stat-scaling.ts, can share them
 * without an import cycle. The scale is a deliberate 2x widening of the old 3-10
 * model, which makes the sim's relative balance identical while giving room for
 * granular, specialized skillsets:
 *   - STAT_MIN ..STAT_NORMAL_MAX : the band normal players and procedural
 *     generation live in (6..20).
 *   - STAT_ELITE_MAX : the base ceiling for curated real greats (the field caps
 *     at 20, legends reach ~24 so a star reads like a star).
 *   - STAT_CEIL : the difficulty-band ceiling, so the top of the S / S+ ladders
 *     can field apex bosses above the normal cap.
 *   - STAT_HARD_MAX : the absolute ceiling any rating can reach through upgrades
 *     and run-scoped training combined.
 */
export const STAT_MIN = 6;
export const STAT_BASE = 10;
export const STAT_NORMAL_MAX = 20;
export const STAT_ELITE_MAX = 24;
export const STAT_CEIL = 28;
export const STAT_HARD_MAX = 30;

/** Clamp a value to the normal player band [STAT_MIN, STAT_NORMAL_MAX]. */
function clampStat(value: number): number {
  return Math.max(STAT_MIN, Math.min(STAT_NORMAL_MAX, value));
}

/**
 * Per-archetype rating biases as [min, max] deltas applied over STAT_BASE (10).
 * Guards lean playmaking/perimeter/outside, wings are balanced, bigs lean
 * inside/interior. Bigs carry a slightly lower stamina (heavier minute load).
 * Condition ratings (stamina/durability) stay near the base so they do not
 * dominate early balance and instead matter through fatigue and injury later.
 */
const ARCHETYPE_BIASES: Record<Archetype, Record<keyof PlayerStats, [number, number]>> = {
  'point-guard': {
    inside: [-2, 0],
    outside: [0, 2],
    playmaking: [6, 8],
    perimeterD: [2, 4],
    interiorD: [-4, -2],
    athleticism: [2, 4],
    iq: [2, 4],
    clutch: [-2, 2],
    stamina: [0, 2],
    durability: [-2, 2],
  },
  'shooting-guard': {
    inside: [0, 2],
    outside: [4, 8],
    playmaking: [0, 2],
    perimeterD: [2, 4],
    interiorD: [-2, 0],
    athleticism: [0, 2],
    iq: [0, 2],
    clutch: [2, 6],
    stamina: [0, 2],
    durability: [-2, 2],
  },
  'small-forward': {
    inside: [0, 2],
    outside: [2, 4],
    playmaking: [0, 2],
    perimeterD: [2, 4],
    interiorD: [0, 2],
    athleticism: [2, 4],
    iq: [0, 2],
    clutch: [0, 2],
    stamina: [0, 2],
    durability: [0, 2],
  },
  'power-forward': {
    inside: [4, 6],
    outside: [-2, 2],
    playmaking: [-2, 0],
    perimeterD: [0, 2],
    interiorD: [4, 6],
    athleticism: [2, 4],
    iq: [0, 2],
    clutch: [0, 2],
    stamina: [-2, 0],
    durability: [0, 4],
  },
  center: {
    inside: [6, 8],
    outside: [-4, 0],
    playmaking: [-4, -2],
    perimeterD: [-2, 0],
    interiorD: [6, 8],
    athleticism: [0, 4],
    iq: [0, 2],
    clutch: [2, 6],
    stamina: [-2, 0],
    durability: [0, 4],
  },
};

/**
 * Build a player with stats randomised around archetype-specific biases.
 *
 * `int` defaults to the global `randomInt` (legacy behavior). The auto-sim path
 * passes a seeded `rng.int` instead so generated teams are reproducible. Draws
 * happen in STAT_KEYS order; keep that order stable for deterministic seeds.
 */
export function createPlayer(
  name: string,
  archetype: Archetype,
  int: (min: number, max: number) => number = randomInt
): Player {
  const bias = ARCHETYPE_BIASES[archetype];
  const stats = {} as PlayerStats;
  for (const key of STAT_KEYS) {
    const [lo, hi] = bias[key];
    stats[key] = clampStat(STAT_BASE + int(lo, hi));
  }
  return { name, archetype, stats, level: 1, trainingXP: 0 };
}
