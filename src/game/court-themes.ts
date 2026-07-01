import { palette } from '@/theme/palette';
import { mix } from '@/theme/color';
import { DIFFICULTY_LABELS, LADDER_CLASSES, cellKey, type Difficulty } from './difficulty-mode';
import { GRANDMASTER_KEY } from './bounties';

/**
 * Unlockable home-court themes: the cosmetic layer of the difficulty climb. Each
 * theme is a base palette for the game watch's floor and the run map's arena;
 * the per-matchup opponent tint (src/theme/courtTheme.ts) mixes OVER the base, so
 * the "every game is hosted in the opponent's arena" fiction and the sprite
 * legibility contrast rules hold on every theme. Floors stay dark for the same
 * reason. Unlocks derive from the cleared-cell set (no grant machinery, no
 * migration: a veteran's past clears light theirs up on load). Pure and
 * Node-safe (palette + color math only).
 */

export type CourtThemeId =
  | 'classic'
  | 'playground-dusk'
  | 'hardwood-classic'
  | 'neon-nights'
  | 'grandmaster-gold';

export type CourtThemeUnlock =
  | { kind: 'default' }
  /** First clear of ANY class on this difficulty. */
  | { kind: 'difficultyClear'; difficulty: Difficulty }
  /** One exact cell (the insane:S+ Grandmaster capstone). */
  | { kind: 'cell'; key: string };

export interface CourtThemeDef {
  id: CourtThemeId;
  name: string;
  blurb: string;
  /** The floor base the opponent tint mixes into (keep dark: sprites sit on it). */
  floor: string;
  /** Run-map plank lines (a subtle brightening of the floor). */
  plank: string;
  /** Court lines / arena frame fallback. */
  line: string;
  /** Rim and net accent fallback. */
  accent: string;
  unlock: CourtThemeUnlock;
}

/** `classic` reproduces the shipped palette exactly, so default rendering is
 * byte-identical for players who never touch the picker. */
export const COURT_THEMES: readonly CourtThemeDef[] = [
  {
    id: 'classic',
    name: 'The Gym',
    blurb: 'The house floor. Where every run starts.',
    floor: palette.bgCourt,
    plank: mix(palette.bgCourt, palette.courtLine, 0.1),
    line: palette.courtLine,
    accent: palette.orange,
    unlock: { kind: 'default' },
  },
  {
    id: 'playground-dusk',
    name: 'Playground Dusk',
    blurb: 'Cracked asphalt under a burnt-orange sky.',
    floor: '#3A2E3F',
    plank: mix('#3A2E3F', '#FFB86B', 0.1),
    line: '#FFB86B',
    accent: '#FF6E4E',
    unlock: { kind: 'difficultyClear', difficulty: 'medium' },
  },
  {
    id: 'hardwood-classic',
    name: 'Hardwood Classic',
    blurb: 'Deep walnut parquet and banner-wall cream.',
    floor: '#3B2A1E',
    plank: mix('#3B2A1E', '#F2E3C6', 0.12),
    line: '#F2E3C6',
    accent: '#E0B23F',
    unlock: { kind: 'difficultyClear', difficulty: 'hard' },
  },
  {
    id: 'neon-nights',
    name: 'Neon Nights',
    blurb: 'A near-black floor lit in magenta and cyan.',
    floor: '#14141F',
    plank: mix('#14141F', '#2EE6D6', 0.08),
    line: '#2EE6D6',
    accent: '#FF3FA4',
    unlock: { kind: 'difficultyClear', difficulty: 'insane' },
  },
  {
    id: 'grandmaster-gold',
    name: 'Grandmaster Gold',
    blurb: 'Obsidian and gold. The ladder at its cruelest, conquered.',
    floor: '#1A1710',
    plank: mix('#1A1710', '#F5C842', 0.12),
    line: '#F5C842',
    accent: '#FFE08A',
    unlock: { kind: 'cell', key: GRANDMASTER_KEY },
  },
];

export const DEFAULT_COURT_THEME_ID: CourtThemeId = 'classic';

const BY_ID = new Map(COURT_THEMES.map((t) => [t.id, t]));

/** The theme for an id, falling back to classic for unknown/legacy ids. */
export function getCourtTheme(id: string | undefined): CourtThemeDef {
  return (id && BY_ID.get(id as CourtThemeId)) || COURT_THEMES[0];
}

/** Whether a theme is unlocked given the cleared-cell set. */
export function courtThemeUnlocked(
  theme: CourtThemeDef,
  clearedCells: readonly string[]
): boolean {
  switch (theme.unlock.kind) {
    case 'default':
      return true;
    case 'difficultyClear': {
      const d = theme.unlock.difficulty;
      return LADDER_CLASSES.some((cls) => clearedCells.includes(cellKey(d, cls)));
    }
    case 'cell':
      return clearedCells.includes(theme.unlock.key);
  }
}

/** Selector copy for a locked theme ("Clear any HARD run", "Conquer insane S+"). */
export function courtThemeUnlockHint(theme: CourtThemeDef): string {
  switch (theme.unlock.kind) {
    case 'default':
      return '';
    case 'difficultyClear':
      return `Clear any ${DIFFICULTY_LABELS[theme.unlock.difficulty].name} run`;
    case 'cell':
      return 'Conquer INSANE S+';
  }
}
