import { describe, it, expect } from 'vitest';
import {
  DIFFICULTIES,
  LADDER_CLASSES,
  difficultyMods,
  unlockedClasses,
  isClassUnlocked,
  advanceLadder,
  classAboveLadder,
  isLadderClass,
} from '@/game/difficulty-mode';

describe('difficulty modes', () => {
  it('grants the spec draft points per difficulty', () => {
    expect(difficultyMods('easy').draftPoints).toBe(8);
    expect(difficultyMods('medium').draftPoints).toBe(5);
    expect(difficultyMods('hard').draftPoints).toBe(2);
    expect(difficultyMods('insane').draftPoints).toBe(0);
  });

  it('eases the opponent floor on easy and ramps the stat-shift up with difficulty', () => {
    // Easy is a learning mode: opponents are about half a class weaker.
    expect(difficultyMods('easy').statShift).toBe(-1);
    expect(difficultyMods('medium').statShift).toBeGreaterThan(difficultyMods('easy').statShift);
    expect(difficultyMods('hard').statShift).toBeGreaterThan(difficultyMods('medium').statShift);
    expect(difficultyMods('insane').statShift).toBeGreaterThanOrEqual(difficultyMods('hard').statShift);
  });

  it('folds the old League-tier modifiers into harder difficulties', () => {
    expect(difficultyMods('easy').elitesFromMap0).toBe(false);
    expect(difficultyMods('medium').elitesFromMap0).toBe(true);
    expect(difficultyMods('hard').boostOfferCount).toBe(2);
    expect(difficultyMods('insane').preBossRest).toBe(false);
    // Opponent stat-floor shift and injuries escalate with difficulty.
    expect(difficultyMods('insane').statShift).toBeGreaterThan(difficultyMods('easy').statShift);
    expect(difficultyMods('insane').injuryMul).toBeGreaterThan(difficultyMods('easy').injuryMul);
    expect(difficultyMods('insane').coinMul).toBeLessThan(1);
  });

  it('every difficulty resolves to a full mods object', () => {
    for (const d of DIFFICULTIES) {
      const m = difficultyMods(d);
      expect(typeof m.boostOfferCount).toBe('number');
      expect(typeof m.maxGamesOut).toBe('number');
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
