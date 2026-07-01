import { describe, it, expect } from 'vitest';
import {
  DIFFICULTIES,
  LADDER_CLASSES,
  difficultyMods,
  unlockedClasses,
  isClassUnlocked,
  isClassConquered,
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
    expect(difficultyMods('hard').boostOfferCount).toBe(2);
    expect(difficultyMods('insane').preBossRest).toBe(false);
    expect(difficultyMods('insane').injuryMul).toBeGreaterThan(difficultyMods('easy').injuryMul);
  });

  it('rewards the grind: harder tiers pay more coins, steeply', () => {
    expect(difficultyMods('easy').coinMul).toBe(1.0); // easy is the anchor
    expect(difficultyMods('medium').coinMul).toBeGreaterThan(difficultyMods('easy').coinMul);
    expect(difficultyMods('hard').coinMul).toBeGreaterThan(difficultyMods('medium').coinMul);
    expect(difficultyMods('insane').coinMul).toBeGreaterThan(difficultyMods('hard').coinMul);
    // The top end roughly doubles easy's payout (not a token +50% bump), so a brutal run
    // is genuinely worth it.
    expect(difficultyMods('insane').coinMul).toBeGreaterThanOrEqual(2.0);
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
