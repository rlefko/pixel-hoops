/** Player archetypes that define stat distributions and playstyles. */
export type Archetype =
  | 'point-guard'
  | 'shooting-guard'
  | 'small-forward'
  | 'power-forward'
  | 'center';

/** Core stats range: 3 (worst) to 10 (elite). Base is 5 across all. */
export interface PlayerStats {
  /** Shooting percentage — determines shot accuracy. */
  shooting: number;
  /** Speed — determines crossover and pressure effectiveness. */
  speed: number;
  /** Athleticism — determines dunking and rim protection. */
  athleticism: number;
  /** Clutch — determines performance in close-game situations. */
  clutch: number;
}

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

/** Build a player with stats randomised around archetype-specific biases. */
export function createPlayer(
  name: string,
  archetype: Archetype
): Player {
  const base = { shooting: 5, speed: 5, athleticism: 5, clutch: 5 };

  switch (archetype) {
    case 'point-guard':
      return {
        name,
        archetype,
        stats: {
          ...base,
          shooting: clampStat(base.shooting + randomInt(-1, 0)),
          speed: clampStat(base.speed + randomInt(2, 4)),
          athleticism: clampStat(base.athleticism + randomInt(-1, 0)),
          clutch: clampStat(base.clutch + randomInt(-1, 1)),
        },
        level: 1,
        trainingXP: 0,
      };
    case 'shooting-guard':
      return {
        name,
        archetype,
        stats: {
          ...base,
          shooting: clampStat(base.shooting + randomInt(2, 4)),
          speed: clampStat(base.speed + randomInt(-1, 0)),
          athleticism: clampStat(base.athleticism + randomInt(-1, 1)),
          clutch: clampStat(base.clutch + randomInt(1, 3)),
        },
        level: 1,
        trainingXP: 0,
      };
    case 'small-forward':
      return {
        name,
        archetype,
        stats: {
          ...base,
          shooting: clampStat(base.shooting + randomInt(0, 1)),
          speed: clampStat(base.speed + randomInt(0, 1)),
          athleticism: clampStat(base.athleticism + randomInt(0, 1)),
          clutch: clampStat(base.clutch + randomInt(0, 1)),
        },
        level: 1,
        trainingXP: 0,
      };
    case 'power-forward':
      return {
        name,
        archetype,
        stats: {
          ...base,
          shooting: clampStat(base.shooting + randomInt(-1, 0)),
          speed: clampStat(base.speed + randomInt(-1, 0)),
          athleticism: clampStat(base.athleticism + randomInt(2, 4)),
          clutch: clampStat(base.clutch + randomInt(0, 1)),
        },
        level: 1,
        trainingXP: 0,
      };
    case 'center':
      return {
        name,
        archetype,
        stats: {
          ...base,
          shooting: clampStat(base.shooting + randomInt(-1, 0)),
          speed: clampStat(base.speed + randomInt(-2, -1)),
          athleticism: clampStat(base.athleticism + randomInt(3, 5)),
          clutch: clampStat(base.clutch + randomInt(1, 3)),
        },
        level: 1,
        trainingXP: 0,
      };
  }
}
