import { CLASS_ORDER, type PlayerClass } from './ratings';

/**
 * The run configuration ladder, replacing the old single League-Tier ladder. A
 * run is chosen as a (Difficulty x LadderClass) pair:
 *
 *  - Difficulty (easy/medium/hard/insane) sets the DRAFT BUDGET and folds in the
 *    old League-Tier opponent modifiers (early elites, leaner boost drafts, glass
 *    bones, lean payouts, no pre-boss rest). All four are selectable from the
 *    start.
 *  - LadderClass (C/B/A/S/S+) sets the opponent CLASS the run centers on. Within a
 *    difficulty you climb C -> B -> A -> S -> S+, unlocking the next rung only by
 *    clearing the current one (per difficulty).
 *
 * Pure and dependency-free (apart from the class order), applied at consumption
 * time in the run machine, so the map generator stays config-light and the run
 * stays deterministic.
 */

export type Difficulty = 'easy' | 'medium' | 'hard' | 'insane';
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard', 'insane'];

/** The five selectable ladders (a subset of PlayerClass; S++ is never selectable,
 * only attained). */
export type LadderClass = Extract<PlayerClass, 'C' | 'B' | 'A' | 'S' | 'S+'>;
export const LADDER_CLASSES: readonly LadderClass[] = ['C', 'B', 'A', 'S', 'S+'];

export interface DifficultyMods {
  /** Draft points granted before the run (the class-cost budget). */
  draftPoints: number;
  /**
   * The opponent ramp's offset from the ladder level at the very first combat node
   * (roughly half a class to a class below). Kept close across difficulties so the
   * early game stays approachable on every tier.
   */
  rampStart: number;
  /**
   * The opponent ramp's offset from the ladder level at the final regular peak. This
   * is the difficulty's MAIN lever: easy ends near the ladder class (base roster
   * wins), insane ends ~two classes above (needs maxed players + abilities). See
   * src/game/difficulty.ts.
   */
  rampEnd: number;
  /**
   * Forgiven losses ("timeouts") for the run: a Death-Defiance pool. While any
   * remain, a lost game is replayed instead of ending the run. 0 = strict permadeath.
   */
  secondChances: number;
  /** Elite teams may appear from the first map (else gated to map 2+). */
  elitesFromMap0: boolean;
  /** How many picks a passive-boost draft offers (normally 3). */
  boostOfferCount: number;
  /** Bosses field a second franchise legend. */
  bossExtraLegend: boolean;
  /** Multiplier on the per-game injury chance. */
  injuryMul: number;
  /** Most games an injury can sideline a player. */
  maxGamesOut: number;
  /** Multiplier on win coin payouts. */
  coinMul: number;
  /** Extra weight added to the elite node-type roll (more elites per map). */
  eliteWeightBonus: number;
  /** Whether the guaranteed pre-boss rest node remains. */
  preBossRest: boolean;
}

/** The modifiers active at a given difficulty. */
export function difficultyMods(difficulty: Difficulty): DifficultyMods {
  switch (difficulty) {
    case 'easy':
      return {
        draftPoints: 8, rampStart: -3.0, rampEnd: 0.5, secondChances: 2,
        elitesFromMap0: false, boostOfferCount: 3, bossExtraLegend: false,
        injuryMul: 1, maxGamesOut: 2, coinMul: 1.0, eliteWeightBonus: 0,
        preBossRest: true,
      };
    case 'medium':
      return {
        draftPoints: 5, rampStart: -2.5, rampEnd: 1.5, secondChances: 1,
        elitesFromMap0: true, boostOfferCount: 3, bossExtraLegend: false,
        injuryMul: 1, maxGamesOut: 2, coinMul: 1.1, eliteWeightBonus: 0,
        preBossRest: true,
      };
    case 'hard':
      return {
        draftPoints: 2, rampStart: -2.0, rampEnd: 3.0, secondChances: 0,
        elitesFromMap0: true, boostOfferCount: 2, bossExtraLegend: true,
        injuryMul: 1.5, maxGamesOut: 3, coinMul: 1.25, eliteWeightBonus: 2,
        preBossRest: true,
      };
    case 'insane':
      return {
        draftPoints: 0, rampStart: -1.5, rampEnd: 4.5, secondChances: 0,
        elitesFromMap0: true, boostOfferCount: 2, bossExtraLegend: true,
        injuryMul: 1.75, maxGamesOut: 3, coinMul: 1.5, eliteWeightBonus: 3,
        preBossRest: false,
      };
  }
}

/** Short description per difficulty, for the selector UI. */
export const DIFFICULTY_LABELS: Record<Difficulty, { name: string; blurb: string }> = {
  easy: { name: 'EASY', blurb: '8 draft points, 2 timeouts. The gentle climb.' },
  medium: { name: 'MEDIUM', blurb: '5 points, 1 timeout, elites from map 1.' },
  hard: { name: 'HARD', blurb: '2 points, no timeouts, glass bones.' },
  insane: { name: 'INSANE', blurb: '0 points, no timeouts, peak opponents.' },
};

/** Index of a ladder class (C=0 .. S+=4). */
function ladderIndex(cls: LadderClass): number {
  return LADDER_CLASSES.indexOf(cls);
}

/**
 * The ladder classes unlocked given the highest class cleared on a difficulty. C
 * is always available; clearing a rung unlocks the next one (per difficulty).
 */
export function unlockedClasses(highestCleared: LadderClass | null): LadderClass[] {
  if (highestCleared == null) return [LADDER_CLASSES[0]];
  const upto = Math.min(ladderIndex(highestCleared) + 1, LADDER_CLASSES.length - 1);
  return LADDER_CLASSES.slice(0, upto + 1);
}

/** Whether a ladder class is unlocked given the highest cleared. */
export function isClassUnlocked(cls: LadderClass, highestCleared: LadderClass | null): boolean {
  return unlockedClasses(highestCleared).includes(cls);
}

/**
 * Fold a cleared run into a difficulty's progress: advance the highest-cleared
 * class if this run cleared at or beyond the current frontier. Returns the new
 * highest-cleared class.
 */
export function advanceLadder(
  highestCleared: LadderClass | null,
  clearedClass: LadderClass
): LadderClass {
  const prev = highestCleared == null ? -1 : ladderIndex(highestCleared);
  return ladderIndex(clearedClass) > prev ? clearedClass : (highestCleared as LadderClass);
}

/** Whether `cls` is a valid selectable ladder class. */
export function isLadderClass(cls: PlayerClass): cls is LadderClass {
  return (LADDER_CLASSES as readonly PlayerClass[]).includes(cls);
}

/** The class one rung above a ladder class on the full class ladder (e.g. the
 * "class above" that can appear in recruits), clamped at S++. */
export function classAboveLadder(cls: LadderClass): PlayerClass {
  const i = CLASS_ORDER.indexOf(cls);
  return CLASS_ORDER[Math.min(i + 1, CLASS_ORDER.length - 1)];
}
