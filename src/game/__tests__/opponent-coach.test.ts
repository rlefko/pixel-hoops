import { describe, it, expect } from 'vitest';
import { createRNG } from '@/game/rng';
import { buildTeam } from '@/game/lineup';
import { generateOpponentTeam, planForRoster } from '@/game/tournament';
import { planForCoach } from '@/game/coaches';
import { coachForTeamAbbr, coachForTeamName } from '@/game/opponent-coach';
import { deriveArchetype, type TeamArchetype } from '@/game/team-archetype';
import { NBA_TEAMS } from '@/data/nba';
import type { Team } from '@/types/team';

/** Build the opponent the live game fields: its real franchise five under its real
 * coach's game plan (style only, no system bonus). */
function builtOpponent(level: number, seed: string): Team {
  const opp = generateOpponentTeam(level, createRNG(seed));
  const coach = coachForTeamName(opp.name);
  return buildTeam(
    opp.name,
    opp.roster.starters,
    planForCoach(planForRoster(opp.roster), coach, opp.roster),
    opp.colorHex,
    opp.accentHex,
    opp.roster.bench
  );
}

describe('opponent coaches', () => {
  it('covers every franchise with a real, valid coach style', () => {
    for (const t of NBA_TEAMS) {
      const c = coachForTeamAbbr(t.abbreviation);
      expect(c.name).not.toBe('Staff'); // every franchise is covered, none falls back
      expect([8, 9, 10]).toContain(c.rotation);
    }
  });

  it('resolves a coach from the opponent display name, neutral for the unknown', () => {
    expect(coachForTeamName('Golden State Warriors').name).toBe('Steve Kerr');
    expect(coachForTeamName('San Antonio Spurs').name).toBe('Gregg Popovich');
    expect(coachForTeamName('Nowhere Nobodies').name).toBe('Staff'); // safe fallback
  });

  it('gives franchises distinct play tendencies (not all generic)', () => {
    const styles = new Set(
      NBA_TEAMS.map((t) => {
        const c = coachForTeamAbbr(t.abbreviation);
        return `${c.prefPace}|${c.prefFocus}|${c.usage}|${c.rotation}`;
      })
    );
    // Many distinct style fingerprints across the league, not one generic setting.
    expect(styles.size).toBeGreaterThanOrEqual(12);
  });
});

describe('opponent identity distribution', () => {
  it('no longer floods the pool with Twin Towers, and spreads across identities', () => {
    const counts = new Map<TeamArchetype, number>();
    let total = 0;
    for (let lvl = 6; lvl <= 20; lvl += 1) {
      for (let s = 0; s < 40; s += 1) {
        const a = deriveArchetype(builtOpponent(lvl, `oppdist-${lvl}-${s}`));
        counts.set(a, (counts.get(a) ?? 0) + 1);
        total += 1;
      }
    }
    const share = (a: TeamArchetype): number => (counts.get(a) ?? 0) / total;
    console.log(
      'opponent archetypes:',
      [...counts.entries()]
        .sort((x, y) => y[1] - x[1])
        .map(([a, n]) => `${a} ${((n / total) * 100).toFixed(0)}%`)
        .join(', ')
    );
    // Twin Towers is now a rare, genuine identity, not the default label on every team.
    expect(share('twin-towers')).toBeLessThan(0.25);
    // No single identity dominates the pool, and several distinct ones appear.
    for (const a of counts.keys()) expect(share(a)).toBeLessThan(0.6);
    expect(counts.size).toBeGreaterThanOrEqual(4);
  });
});
