import { describe, it, expect } from 'vitest';
import {
  COURT_THEMES,
  DEFAULT_COURT_THEME_ID,
  courtThemeUnlocked,
  courtThemeUnlockHint,
  getCourtTheme,
} from '@/game/court-themes';
import { cellKey } from '@/game/difficulty-mode';
import { GRANDMASTER_KEY, bountyKey } from '@/game/bounties';
import { createRookieRoster, selectCourtTheme, type HomeRoster } from '@/game/home-roster';
import { createRNG } from '@/game/rng';
import { palette } from '@/theme/palette';

describe('court themes', () => {
  const byId = (id: string) => COURT_THEMES.find((t) => t.id === id)!;

  it('classic is the default, always unlocked, and byte-identical to the shipped palette', () => {
    const classic = byId('classic');
    expect(DEFAULT_COURT_THEME_ID).toBe('classic');
    expect(courtThemeUnlocked(classic, [])).toBe(true);
    expect(classic.floor).toBe(palette.bgCourt);
    expect(classic.line).toBe(palette.courtLine);
    expect(classic.accent).toBe(palette.orange);
  });

  it('difficulty themes unlock on ANY clear of that difficulty, at any class', () => {
    const dusk = byId('playground-dusk');
    expect(courtThemeUnlocked(dusk, [])).toBe(false);
    expect(courtThemeUnlocked(dusk, [cellKey('easy', 'S')])).toBe(false); // easy never counts
    expect(courtThemeUnlocked(dusk, [cellKey('medium', 'C')])).toBe(true);
    expect(courtThemeUnlocked(dusk, [cellKey('medium', 'S+')])).toBe(true);
    const neon = byId('neon-nights');
    expect(courtThemeUnlocked(neon, [cellKey('hard', 'S')])).toBe(false);
    expect(courtThemeUnlocked(neon, [cellKey('insane', 'C')])).toBe(true);
  });

  it('Grandmaster Gold demands the exact insane:S+ capstone cell', () => {
    const gold = byId('grandmaster-gold');
    expect(courtThemeUnlocked(gold, [cellKey('insane', 'S')])).toBe(false);
    expect(courtThemeUnlocked(gold, [GRANDMASTER_KEY])).toBe(true);
    expect(GRANDMASTER_KEY).toBe(bountyKey('insane', 'S+'));
  });

  it('every locked theme carries a human unlock hint', () => {
    for (const theme of COURT_THEMES) {
      if (theme.unlock.kind === 'default') continue;
      expect(courtThemeUnlockHint(theme).length).toBeGreaterThan(0);
    }
  });

  it('getCourtTheme falls back to classic for unknown or missing ids', () => {
    expect(getCourtTheme(undefined).id).toBe('classic');
    expect(getCourtTheme('not-a-theme').id).toBe('classic');
    expect(getCourtTheme('neon-nights').id).toBe('neon-nights');
  });

  it('selectCourtTheme equips only unlocked themes', () => {
    const home: HomeRoster = {
      ...createRookieRoster(createRNG('ct')),
      clearedCells: [cellKey('medium', 'C')],
    };
    expect(selectCourtTheme(home, 'neon-nights')).toBe(home); // locked: no-op
    expect(selectCourtTheme(home, 'garbage')).toBe(home);
    expect(selectCourtTheme(home, 'playground-dusk').courtTheme).toBe('playground-dusk');
  });
});
