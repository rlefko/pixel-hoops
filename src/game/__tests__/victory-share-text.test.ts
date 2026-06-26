import { describe, it, expect } from 'vitest';
import { buildVictoryShareText } from '@/game/victory-share-text';
import type { HallOfFameEntry } from '@/game/hall-of-fame';
import type { RosterPlayer } from '@/types/roster';

function starter(name: string, position: RosterPlayer['position']): RosterPlayer {
  return { position, player: { name } } as RosterPlayer;
}

function entry(over: Partial<HallOfFameEntry> = {}): HallOfFameEntry {
  return {
    id: '1-98-72',
    ts: 1,
    difficulty: 'medium',
    ladderClass: 'C',
    finalHome: 98,
    finalAway: 72,
    opponentName: 'Los Angeles Lakers',
    homeTeamName: 'Your Squad',
    wins: 8,
    starters: [starter('Jordan', 'PG')],
    mvp: { name: 'Jordan', pts: 32, reb: 8, ast: 6 },
    ...over,
  };
}

describe('buildVictoryShareText', () => {
  it('renders the tight score line and MVP stat line', () => {
    const text = buildVictoryShareText(entry());
    expect(text).toContain('98-72 @ LAL');
    expect(text).toContain('Jordan · 32 PTS 8 REB 6 AST');
    // No leftover "Your Squad" label or crowned roster line.
    expect(text).not.toContain('Your Squad');
    expect(text).not.toContain('👑');
  });

  it('falls back to the first starter when an old save has no MVP', () => {
    const text = buildVictoryShareText(entry({ mvp: undefined }));
    expect(text).toContain('Jordan');
    expect(text).not.toContain('PTS');
  });

  it('uses uppercased initials for a non-NBA opponent name', () => {
    const text = buildVictoryShareText(entry({ opponentName: 'Downtown Ballers' }));
    expect(text).toContain('98-72 @ DB');
  });
});
