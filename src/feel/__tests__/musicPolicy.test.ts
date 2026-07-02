import { describe, it, expect } from 'vitest';
import { resolveMusicTarget, bedsFor, isRunTheme } from '../musicPolicy';

describe('resolveMusicTarget', () => {
  it('menu always targets the menu theme and never advances rotation', () => {
    expect(resolveMusicTarget('menu', null, 0)).toEqual({
      target: 'menuTheme',
      nextRotation: 0,
    });
    expect(resolveMusicTarget('menu', 'runThemeB', 3)).toEqual({
      target: 'menuTheme',
      nextRotation: 3,
    });
  });

  it('run keeps the current run theme mid-run without advancing rotation', () => {
    expect(resolveMusicTarget('run', 'runThemeB', 2)).toEqual({
      target: 'runThemeB',
      nextRotation: 2,
    });
  });

  it('run entered from the menu picks the rotating theme and advances', () => {
    expect(resolveMusicTarget('run', 'menuTheme', 0)).toEqual({
      target: 'runThemeA',
      nextRotation: 1,
    });
    expect(resolveMusicTarget('run', null, 1)).toEqual({
      target: 'runThemeB',
      nextRotation: 2,
    });
  });

  it('alternates run themes across successive runs in a session', () => {
    const first = resolveMusicTarget('run', 'menuTheme', 0);
    const second = resolveMusicTarget('run', 'menuTheme', first.nextRotation);
    const third = resolveMusicTarget('run', 'menuTheme', second.nextRotation);
    expect(first.target).toBe('runThemeA');
    expect(second.target).toBe('runThemeB');
    expect(third.target).toBe('runThemeA');
  });
});

describe('bedsFor', () => {
  it('menu needs only the menu bed', () => {
    expect(bedsFor('menuTheme')).toEqual(['menuTheme']);
  });

  it('run themes carry the game-energy layer with them', () => {
    expect(bedsFor('runThemeA')).toEqual(['runThemeA', 'gameEnergy']);
    expect(bedsFor('runThemeB')).toEqual(['runThemeB', 'gameEnergy']);
  });
});

describe('isRunTheme', () => {
  it('recognizes only the run themes', () => {
    expect(isRunTheme('runThemeA')).toBe(true);
    expect(isRunTheme('runThemeB')).toBe(true);
    expect(isRunTheme('menuTheme')).toBe(false);
    expect(isRunTheme('gameEnergy')).toBe(false);
    expect(isRunTheme(null)).toBe(false);
  });
});
