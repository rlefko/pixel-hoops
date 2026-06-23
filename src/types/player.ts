/** Player archetypes that define stat distributions and playstyles. */
export type Archetype =
  | 'point-guard'
  | 'shooting-guard'
  | 'small-forward'
  | 'power-forward'
  | 'center';

/**
 * Core ratings, all on the 3 (worst) to 10 (elite) scale, base 5. Ten ratings
 * split offense and defense the way real basketball does and add the intangibles
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

/** Clamp a value to the valid stat range. */
function clampStat(value: number): number {
  return Math.max(3, Math.min(10, value));
}

/**
 * Per-archetype rating biases as [min, max] deltas applied over the base of 5.
 * Guards lean playmaking/perimeter/outside, wings are balanced, bigs lean
 * inside/interior. Bigs carry a slightly lower stamina (heavier minute load).
 * Condition ratings (stamina/durability) stay near 5 so they do not dominate
 * early balance and instead matter through fatigue and injury later.
 */
const ARCHETYPE_BIASES: Record<Archetype, Record<keyof PlayerStats, [number, number]>> = {
  'point-guard': {
    inside: [-1, 0],
    outside: [0, 1],
    playmaking: [3, 4],
    perimeterD: [1, 2],
    interiorD: [-2, -1],
    athleticism: [1, 2],
    iq: [1, 2],
    clutch: [-1, 1],
    stamina: [0, 1],
    durability: [-1, 1],
  },
  'shooting-guard': {
    inside: [0, 1],
    outside: [2, 4],
    playmaking: [0, 1],
    perimeterD: [1, 2],
    interiorD: [-1, 0],
    athleticism: [0, 1],
    iq: [0, 1],
    clutch: [1, 3],
    stamina: [0, 1],
    durability: [-1, 1],
  },
  'small-forward': {
    inside: [0, 1],
    outside: [1, 2],
    playmaking: [0, 1],
    perimeterD: [1, 2],
    interiorD: [0, 1],
    athleticism: [1, 2],
    iq: [0, 1],
    clutch: [0, 1],
    stamina: [0, 1],
    durability: [0, 1],
  },
  'power-forward': {
    inside: [2, 3],
    outside: [-1, 1],
    playmaking: [-1, 0],
    perimeterD: [0, 1],
    interiorD: [2, 3],
    athleticism: [1, 2],
    iq: [0, 1],
    clutch: [0, 1],
    stamina: [-1, 0],
    durability: [0, 2],
  },
  center: {
    inside: [3, 4],
    outside: [-2, 0],
    playmaking: [-2, -1],
    perimeterD: [-1, 0],
    interiorD: [3, 4],
    athleticism: [0, 2],
    iq: [0, 1],
    clutch: [1, 3],
    stamina: [-1, 0],
    durability: [0, 2],
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
    stats[key] = clampStat(5 + int(lo, hi));
  }
  return { name, archetype, stats, level: 1, trainingXP: 0 };
}
