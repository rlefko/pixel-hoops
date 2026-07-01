import { describe, it, expect } from 'vitest';
import {
  DIFFICULTIES,
  LADDER_CLASSES,
  cellKey,
  clearedOnAnyDifficulty,
  difficultyMods,
  frontierFromCells,
  globalHighestCleared,
  isCellCleared,
  unlockedClasses,
  unlockedClassesFromCells,
  isClassUnlocked,
  isClassConquered,
  advanceLadder,
  classAboveLadder,
  isLadderClass,
} from '@/game/difficulty-mode';

describe('difficulty modes', () => {
  it('grants the spec draft points per difficulty, never zero', () => {
    expect(difficultyMods('easy').draftPoints).toBe(8);
    expect(difficultyMods('medium').draftPoints).toBe(5);
    expect(difficultyMods('hard').draftPoints).toBe(3);
    expect(difficultyMods('insane').draftPoints).toBe(2);
    // Difficulty amplifies opponents; it never fully confiscates the collection.
    for (const d of DIFFICULTIES) expect(difficultyMods(d).draftPoints).toBeGreaterThan(0);
  });

  it('shapes the opponent ramp by difficulty: same opening, diverging finale', () => {
    // The ramp END is the main lever: easy finishes near the ladder, insane far above.
    expect(difficultyMods('medium').rampEnd).toBeGreaterThan(difficultyMods('easy').rampEnd);
    expect(difficultyMods('hard').rampEnd).toBeGreaterThan(difficultyMods('medium').rampEnd);
    expect(difficultyMods('insane').rampEnd).toBeGreaterThan(difficultyMods('hard').rampEnd);
    // Easy stays a learning mode (ends roughly at the ladder class).
    expect(difficultyMods('easy').rampEnd).toBeLessThanOrEqual(1.5);
    // Openings stay close together so the early game is approachable on every tier.
    const opens = DIFFICULTIES.map((d) => difficultyMods(d).rampStart);
    expect(Math.max(...opens) - Math.min(...opens)).toBeLessThan(2);
  });

  it('hands out forgiveness ("timeouts") only on the easier tiers', () => {
    expect(difficultyMods('easy').secondChances).toBe(2);
    expect(difficultyMods('medium').secondChances).toBe(1);
    expect(difficultyMods('hard').secondChances).toBe(0);
    expect(difficultyMods('insane').secondChances).toBe(0);
  });

  it('folds the old League-tier modifiers into harder difficulties', () => {
    expect(difficultyMods('easy').elitesFromMap0).toBe(false);
    expect(difficultyMods('medium').elitesFromMap0).toBe(true);
    expect(difficultyMods('insane').preBossRest).toBe(false);
    expect(difficultyMods('insane').injuryMul).toBeGreaterThan(difficultyMods('easy').injuryMul);
  });

  it('never shrinks the boost-draft menu: harder tiers keep the full offer width', () => {
    for (const d of DIFFICULTIES) expect(difficultyMods(d).boostOfferCount).toBe(3);
  });

  it('rewards the grind: coins climb per win, and finishing pays a clear bonus', () => {
    expect(difficultyMods('easy').coinMul).toBe(1.0); // easy is the anchor
    expect(difficultyMods('easy').clearBonus).toBe(0);
    for (let i = 1; i < DIFFICULTIES.length; i++) {
      const lower = difficultyMods(DIFFICULTIES[i - 1]);
      const higher = difficultyMods(DIFFICULTIES[i]);
      expect(higher.coinMul).toBeGreaterThan(lower.coinMul);
      expect(higher.clearBonus).toBeGreaterThan(lower.clearBonus);
    }
    // The per-win multiplier stays modest (coins bank as-earned, so a fat multiplier
    // would reward abandoning partial runs); the premium for finishing is the bonus.
    expect(difficultyMods('insane').coinMul).toBeLessThanOrEqual(2.0);
    expect(difficultyMods('insane').clearBonus).toBeGreaterThanOrEqual(1000);
  });

  it('scales the repeatable reward texture monotonically with difficulty', () => {
    for (let i = 1; i < DIFFICULTIES.length; i++) {
      const lower = difficultyMods(DIFFICULTIES[i - 1]);
      const higher = difficultyMods(DIFFICULTIES[i]);
      expect(higher.rarityBonus).toBeGreaterThanOrEqual(lower.rarityBonus);
      expect(higher.bossRarityBonus).toBeGreaterThanOrEqual(lower.bossRarityBonus);
      expect(higher.trainingBonus.elite).toBeGreaterThanOrEqual(lower.trainingBonus.elite);
      expect(higher.trainingBonus.boss).toBeGreaterThanOrEqual(lower.trainingBonus.boss);
      expect(higher.copiesMul).toBeGreaterThanOrEqual(lower.copiesMul);
    }
    // The copies gradient is strictly monotone: every step up the grid banks more.
    expect(DIFFICULTIES.map((d) => difficultyMods(d).copiesMul)).toEqual([1, 2, 3, 4]);
  });

  it('gates legend signings and milestone banking to the punishing tiers', () => {
    for (const d of ['easy', 'medium'] as const) {
      expect(difficultyMods(d).legendSign.base).toBe(0);
      expect(difficultyMods(d).milestoneBossWins).toBeNull();
    }
    for (const d of ['hard', 'insane'] as const) {
      expect(difficultyMods(d).legendSign.base).toBeGreaterThan(0);
      expect(difficultyMods(d).milestoneBossWins).toBe(4);
    }
    expect(difficultyMods('insane').legendSign.base).toBeGreaterThan(
      difficultyMods('hard').legendSign.base
    );
  });

  it('scales reputation (the lifetime prestige score) up with difficulty', () => {
    expect(difficultyMods('easy').repMul).toBe(1.0);
    expect(difficultyMods('medium').repMul).toBeGreaterThan(difficultyMods('easy').repMul);
    expect(difficultyMods('hard').repMul).toBeGreaterThan(difficultyMods('medium').repMul);
    expect(difficultyMods('insane').repMul).toBeGreaterThan(difficultyMods('hard').repMul);
  });

  it('every difficulty resolves to a full mods object', () => {
    for (const d of DIFFICULTIES) {
      const m = difficultyMods(d);
      expect(typeof m.boostOfferCount).toBe('number');
      expect(typeof m.maxGamesOut).toBe('number');
      expect(typeof m.rampStart).toBe('number');
      expect(typeof m.rampEnd).toBe('number');
      expect(typeof m.secondChances).toBe('number');
    }
  });
});

describe('ladder unlocks', () => {
  it('starts with only C unlocked', () => {
    expect(unlockedClasses(null)).toEqual(['C']);
    expect(isClassUnlocked('C', null)).toBe(true);
    expect(isClassUnlocked('B', null)).toBe(false);
  });

  it('clearing a rung unlocks the next', () => {
    expect(unlockedClasses('C')).toEqual(['C', 'B']);
    expect(unlockedClasses('A')).toEqual(['C', 'B', 'A', 'S']);
    expect(unlockedClasses('S+')).toEqual([...LADDER_CLASSES]);
    expect(isClassUnlocked('B', 'C')).toBe(true);
    expect(isClassUnlocked('A', 'C')).toBe(false);
  });

  it('advanceLadder only moves the frontier forward', () => {
    expect(advanceLadder(null, 'C')).toBe('C');
    expect(advanceLadder('C', 'B')).toBe('B');
    expect(advanceLadder('B', 'C')).toBe('B'); // beating a lower rung never regresses
  });

  it('isClassConquered marks a class at/below the frontier, unlike isClassUnlocked', () => {
    expect(isClassConquered('C', null)).toBe(false); // nothing cleared yet
    expect(isClassConquered('B', 'B')).toBe(true); // the frontier itself is conquered
    expect(isClassConquered('C', 'B')).toBe(true); // and everything below it
    expect(isClassConquered('A', 'B')).toBe(false); // the next rung is unlocked but NOT conquered
    expect(isClassUnlocked('A', 'B')).toBe(true); // (the key difference from isClassUnlocked)
  });

  it('classAboveLadder steps the full class ladder (S -> S+, S+ -> S++)', () => {
    expect(classAboveLadder('C')).toBe('B');
    expect(classAboveLadder('S')).toBe('S+');
    expect(classAboveLadder('S+')).toBe('S++');
  });

  it('isLadderClass excludes D and S++', () => {
    expect(isLadderClass('C')).toBe(true);
    expect(isLadderClass('S+')).toBe(true);
    expect(isLadderClass('D')).toBe(false);
    expect(isLadderClass('S++')).toBe(false);
  });
});

describe('the cleared-cell set (cross-difficulty unlocks)', () => {
  it('cellKey matches the bounty key format', () => {
    expect(cellKey('hard', 'S+')).toBe('hard:S+');
  });

  it('cell membership and per-class lookups are exact', () => {
    const cells = [cellKey('easy', 'C'), cellKey('insane', 'B')];
    expect(isCellCleared(cells, 'easy', 'C')).toBe(true);
    expect(isCellCleared(cells, 'medium', 'C')).toBe(false);
    expect(clearedOnAnyDifficulty(cells, 'B')).toBe(true);
    expect(clearedOnAnyDifficulty(cells, 'A')).toBe(false);
  });

  it('a class cleared on ANY difficulty is selectable on ALL of them', () => {
    // Clearing B on insane opens C, B, and the next rung (A) everywhere.
    const cells = [cellKey('insane', 'C'), cellKey('insane', 'B')];
    expect(globalHighestCleared(cells)).toBe('B');
    expect(unlockedClassesFromCells(cells)).toEqual(['C', 'B', 'A']);
    // Nothing cleared: only C is open.
    expect(unlockedClassesFromCells([])).toEqual(['C']);
    expect(globalHighestCleared([])).toBeNull();
  });

  it('frontierFromCells reads one difficulty column', () => {
    const cells = [cellKey('easy', 'C'), cellKey('easy', 'B'), cellKey('hard', 'C')];
    expect(frontierFromCells(cells, 'easy')).toBe('B');
    expect(frontierFromCells(cells, 'hard')).toBe('C');
    expect(frontierFromCells(cells, 'insane')).toBeNull();
  });
});
