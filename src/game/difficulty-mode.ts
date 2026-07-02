import { CLASS_ORDER, type PlayerClass } from './ratings';

/**
 * The run configuration ladder, replacing the old single League-Tier ladder. A
 * run is chosen as a (Difficulty x LadderClass) pair:
 *
 *  - Difficulty (easy/medium/hard/insane) sets the DRAFT BUDGET and folds in the
 *    old League-Tier opponent modifiers (early elites, leaner boost drafts, glass
 *    bones, lean payouts, no pre-boss rest). All four are selectable from the
 *    start.
 *  - LadderClass (C/B/A/S/S+) sets the opponent CLASS the run centers on. You climb
 *    C -> B -> A -> S -> S+, and clearing a class on ANY difficulty opens it on ALL
 *    of them (the cleared-cell set below), so the 4x5 grid is a 20-cell bounty
 *    board rather than four ladders to re-climb.
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
  /** Multiplier on win coin payouts. Modest by design: coins bank as-earned, so a fat
   * multiplier would reward farming a hard run's gentle early maps and abandoning. The
   * real difficulty premium lives in clearBonus, which only a finished run touches. */
  coinMul: number;
  /** Flat coins paid on every championship (not just the first). The repeatable coin
   * premium for finishing a harder run, immune to the partial-run farming exploit. */
  clearBonus: number;
  /** Multiplier on reputation earned. Reputation is a lifetime PRESTIGE score (no sink),
   * so scaling it by difficulty makes a veteran's total reflect how hard they play. */
  repMul: number;
  /** Extra weight added to the elite node-type roll (more elites per map). */
  eliteWeightBonus: number;
  /** Whether the guaranteed pre-boss rest node remains. */
  preBossRest: boolean;
  /** Weight points shifted from common into epic/legendary on in-run rarity rolls
   * (boost drafts, boost-node stock). Composes additively with the pity offset. */
  rarityBonus: number;
  /** Weight points shifted from rare into epic/legendary on boss item drops. */
  bossRarityBonus: number;
  /** Extra training points on elite and boss wins (routine games stay at 1 everywhere,
   * so harder runs are denser, not longer). */
  trainingBonus: { elite: number; boss: number };
  /** Collection copies deposited per new recruit on a championship. The collector's
   * reason to climb: the same clear banks 2-4x the copies up-grid. Reach-up recruits
   * (above the run's ladder class) are exempt: they deposit a single copy (see
   * collection.REACH_UP_DEPOSIT_COPIES). */
  copiesMul: number;
  /** Multiplier on the favor a run's wins settle to (see src/game/favor.ts). The
   * collector's premium on the C/B ladders, where every copies threshold is 1 and the
   * copies multiplier therefore has nothing to multiply. Kept modest (like coinMul)
   * because favor accrues from wins as a run progresses; the real spike is the flat
   * championship bonus, which only a finished run touches. */
  favorMul: number;
  /** Boss Legend Signings: chance after a non-final boss win that the beaten franchise's
   * legend offers to join, as base + perMap * mapIndex. Zero disables the feature
   * (easy/medium); the reducer additionally gates it to the S / S+ ladders. */
  legendSign: { base: number; perMap: number };
  /** Boss wins needed for a loss to still bank one copy of the best non-legend recruit
   * ("he stays in touch"). null = no milestone banking (the tiers with timeouts). */
  milestoneBossWins: number | null;
}

/** The modifiers active at a given difficulty. Draft points never hit zero and the
 * boost draft never narrows: difficulty amplifies the opponents, it does not confiscate
 * the player's collection or shrink their menus. The reward side (clearBonus, rarity
 * bonuses, trainingBonus, copiesMul, legendSign, milestoneBossWins) climbs with the
 * risk so the harder grid is also the richer one. */
export function difficultyMods(difficulty: Difficulty): DifficultyMods {
  switch (difficulty) {
    case 'easy':
      return {
        draftPoints: 8, rampStart: -4.0, rampEnd: -0.4, secondChances: 2,
        elitesFromMap0: false, boostOfferCount: 3, bossExtraLegend: false,
        injuryMul: 1, maxGamesOut: 2, coinMul: 1.0, clearBonus: 0, repMul: 1.0,
        eliteWeightBonus: 0, preBossRest: true,
        rarityBonus: 0, bossRarityBonus: 0, trainingBonus: { elite: 0, boss: 0 },
        copiesMul: 1, favorMul: 1.0, legendSign: { base: 0, perMap: 0 }, milestoneBossWins: null,
      };
    case 'medium':
      return {
        draftPoints: 5, rampStart: -4.0, rampEnd: 0.0, secondChances: 1,
        elitesFromMap0: true, boostOfferCount: 3, bossExtraLegend: false,
        injuryMul: 1, maxGamesOut: 2, coinMul: 1.25, clearBonus: 200, repMul: 1.5,
        eliteWeightBonus: 0, preBossRest: true,
        rarityBonus: 2, bossRarityBonus: 4, trainingBonus: { elite: 0, boss: 0 },
        copiesMul: 2, favorMul: 1.25, legendSign: { base: 0, perMap: 0 }, milestoneBossWins: null,
      };
    case 'hard':
      return {
        draftPoints: 3, rampStart: -3.5, rampEnd: 1.7, secondChances: 0,
        elitesFromMap0: true, boostOfferCount: 3, bossExtraLegend: true,
        injuryMul: 1.5, maxGamesOut: 3, coinMul: 1.5, clearBonus: 500, repMul: 2.5,
        eliteWeightBonus: 2, preBossRest: true,
        rarityBonus: 4, bossRarityBonus: 9, trainingBonus: { elite: 1, boss: 1 },
        copiesMul: 3, favorMul: 1.5, legendSign: { base: 0.04, perMap: 0.015 }, milestoneBossWins: 4,
      };
    case 'insane':
      return {
        draftPoints: 2, rampStart: -3.0, rampEnd: 4.3, secondChances: 0,
        elitesFromMap0: true, boostOfferCount: 3, bossExtraLegend: true,
        injuryMul: 1.75, maxGamesOut: 3, coinMul: 1.8, clearBonus: 1000, repMul: 4.0,
        eliteWeightBonus: 3, preBossRest: false,
        rarityBonus: 6, bossRarityBonus: 15, trainingBonus: { elite: 2, boss: 2 },
        copiesMul: 4, favorMul: 2.0, legendSign: { base: 0.06, perMap: 0.02 }, milestoneBossWins: 4,
      };
  }
}

/** Short perk tags for a difficulty (the selector chips and the victory step-up
 * pitch), derived from the mods so the UI can never drift from the tuning. Ladder-
 * aware when a class is given: on the C/B ladders every copies threshold is 1 and
 * reach-ups cap at one copy, so the copies multiplier is dead there and the honest
 * collector chip is the favor multiplier instead. */
export function difficultyPerks(difficulty: Difficulty, ladderClass?: LadderClass): string[] {
  const m = difficultyMods(difficulty);
  const perks: string[] = [];
  const copiesMulDead = ladderClass === 'C' || ladderClass === 'B';
  if (m.copiesMul > 1 && !copiesMulDead) perks.push(`x${m.copiesMul} COPIES`);
  else if (m.favorMul > 1) perks.push(`x${m.favorMul} FAVOR`);
  if (m.rarityBonus > 0 || m.bossRarityBonus > 0) perks.push('RICHER DROPS');
  if (m.trainingBonus.boss > 0) perks.push('+TRAINING');
  if (m.legendSign.base > 0) perks.push('LEGEND SIGNINGS');
  if (m.clearBonus > 0) perks.push(`+${m.clearBonus} CLEAR`);
  return perks;
}

/** Short description per difficulty, for the selector UI. */
export const DIFFICULTY_LABELS: Record<Difficulty, { name: string; blurb: string }> = {
  easy: { name: 'EASY', blurb: '8 draft points, 2 timeouts. The gentle climb.' },
  medium: { name: 'MEDIUM', blurb: '5 points, 1 timeout, elites from map 1.' },
  hard: { name: 'HARD', blurb: '3 points, no timeouts, glass bones. Pays richer copies and favor.' },
  insane: { name: 'INSANE', blurb: '2 points, no timeouts, peak opponents. The jackpot tier.' },
};

/** Index of a ladder class (C=0 .. S+=4). */
function ladderIndex(cls: LadderClass): number {
  return LADDER_CLASSES.indexOf(cls);
}

// --- The cleared-cell set (the 20-cell bounty board) ---
// A run clears a CELL of the 4x5 (difficulty x ladder class) grid. Cells are the
// source of truth for crests, bounty first-clear guards, court-theme unlocks, and
// (via the global max) which ladder classes are selectable: a class cleared on ANY
// difficulty is open on ALL of them, so a veteran attacks the grid in any order
// instead of re-climbing four separate ladders. The per-difficulty frontier
// (`ladderProgress`) is still maintained alongside for coach ranks and scout gates.

/** Stable key for one grid cell (`difficulty:class`). bounties.bountyKey re-exports
 * this exact format, so the bounty table and the cell set can never drift. */
export function cellKey(d: Difficulty, cls: LadderClass): string {
  return `${d}:${cls}`;
}

/** Whether one exact cell has been cleared. */
export function isCellCleared(
  cells: readonly string[],
  d: Difficulty,
  cls: LadderClass
): boolean {
  return cells.includes(cellKey(d, cls));
}

/** Whether a class has been cleared on any difficulty. */
export function clearedOnAnyDifficulty(cells: readonly string[], cls: LadderClass): boolean {
  return DIFFICULTIES.some((d) => cells.includes(cellKey(d, cls)));
}

/** The highest class cleared anywhere on the grid (null = nothing cleared). The class
 * dimension stays contiguous by induction: only the rung above the global max is ever
 * selectable before it is cleared. */
export function globalHighestCleared(cells: readonly string[]): LadderClass | null {
  let best: LadderClass | null = null;
  for (const cls of LADDER_CLASSES) if (clearedOnAnyDifficulty(cells, cls)) best = cls;
  return best;
}

/** The ladder classes selectable on EVERY difficulty, given the cleared-cell set:
 * everything up to the global max plus the one rung above it. */
export function unlockedClassesFromCells(cells: readonly string[]): LadderClass[] {
  return unlockedClasses(globalHighestCleared(cells));
}

/** The highest class cleared on ONE difficulty in the cell set (migration self-healing
 * for the per-difficulty frontier). */
export function frontierFromCells(cells: readonly string[], d: Difficulty): LadderClass | null {
  let best: LadderClass | null = null;
  for (const cls of LADDER_CLASSES) if (cells.includes(cellKey(d, cls))) best = cls;
  return best;
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
 * Whether a class has been CONQUERED on a difficulty: the frontier (highest cleared) has
 * reached at or beyond it. Distinct from isClassUnlocked, which also returns true for the one
 * rung above the frontier (the next, not-yet-cleared class). Drives Championship-Bounty
 * crests (which derive from ladder progress) and the first-clear grant guard (its negation).
 */
export function isClassConquered(cls: LadderClass, highestCleared: LadderClass | null): boolean {
  return highestCleared != null && ladderIndex(highestCleared) >= ladderIndex(cls);
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
