import { describe, it, expect } from 'vitest';
import { createRNG } from '@/game/rng';
import { buildStartingRoster, generateOpponentTeam } from '@/game/tournament';
import { buildTeam } from '@/game/lineup';
import { simulateGame } from '@/game/simulation';
import { teamModifierFromPartial } from '@/game/effects';
import { DEFAULT_GAME_PLAN } from '@/types/tactics';
import { POSITIONS, POSITION_ARCHETYPE, type RosterPlayer } from '@/types/roster';
import { createPlayer } from '@/types/player';
import type { SimResult } from '@/types/sim';
import type { Team } from '@/types/team';

/**
 * Golden master: pins the EXACT output of simulateGame for a fixed set of
 * scenarios. Unlike engine.test.ts (which proves a run equals itself under the
 * same code), this catches a consistent drift across code changes: if any
 * optimization changes a single floating-point result, a make/miss flips and the
 * full timeline diverges, failing the digest or the whole-result hash below.
 *
 * The snapshots were recorded from the baseline engine. Regenerate ONLY when an
 * intentional gameplay change lands (never to paper over an accidental drift).
 */

/** FNV-1a over the fully serialized result: any byte-level change flips it. */
function hashResult(r: SimResult): string {
  const json = JSON.stringify(r);
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * A compact, human-readable digest plus a whole-result hash. The digest makes a
 * failure debuggable (you see the score/winner/scoring path that changed); the
 * hash guarantees nothing else drifts silently.
 */
function digest(r: SimResult) {
  return {
    finalHome: r.finalHome,
    finalAway: r.finalAway,
    winner: r.winner,
    eventCount: r.events.length,
    // The full scoring path: every running score, so any flipped possession shows.
    scoringPath: r.events.map((e) => `${e.homeScore}-${e.awayScore}`).join(' '),
    homeBoxPts: r.box.home.map((b) => `${b.name}:${b.pts}`).join(','),
    awayBoxPts: r.box.away.map((b) => `${b.name}:${b.pts}`).join(','),
    hash: hashResult(r),
  };
}

function teamFromRoster(name: string, starters: RosterPlayer[]): Team {
  return buildTeam(name, starters, DEFAULT_GAME_PLAN, '#FFD54F', '#1D428A');
}

function bench(count: number, seed: string): RosterPlayer[] {
  return Array.from({ length: count }, (_, i) => {
    const position = POSITIONS[i % POSITIONS.length];
    return {
      player: createPlayer(`Bench${i}`, POSITION_ARCHETYPE[position], createRNG(`${seed}-${i}`).int),
      position,
    };
  });
}

describe('simulateGame golden master', () => {
  it('standard matchup is unchanged', () => {
    const rng = createRNG('gm-standard');
    const home = teamFromRoster('You', buildStartingRoster(rng).starters);
    const away = teamFromRoster('Opp', generateOpponentTeam(10, rng).roster.starters);
    expect(digest(simulateGame({ home, away, seed: 'gm-standard' }))).toMatchSnapshot();
  });

  it('mirror match (team vs itself) is unchanged', () => {
    const team = teamFromRoster('Mirror', buildStartingRoster(createRNG('gm-mirror')).starters);
    expect(digest(simulateGame({ home: team, away: team, seed: 'gm-mirror' }))).toMatchSnapshot();
  });

  it('deep bench vs thin (subs fire) is unchanged', () => {
    const starters = buildStartingRoster(createRNG('gm-rot')).starters;
    const deep = buildTeam('Deep', starters, DEFAULT_GAME_PLAN, '#fff', '#000', bench(5, 'gm-bench'));
    const thin = buildTeam('Thin', starters, DEFAULT_GAME_PLAN, '#fff', '#000', []);
    expect(digest(simulateGame({ home: deep, away: thin, seed: 'gm-subs' }))).toMatchSnapshot();
  });

  it('hooked team (conditional boosts fire) is unchanged', () => {
    const away = teamFromRoster('HookOpp', buildStartingRoster(createRNG('gm-hook-opp')).starters);
    const home = buildTeam(
      'Hooked',
      buildStartingRoster(createRNG('gm-hook-home')).starters,
      DEFAULT_GAME_PLAN,
      '#fff',
      '#000',
      [],
      teamModifierFromPartial({
        hooks: [
          { kind: 'whenTrailing', marginBehind: 4, delta: { inside: 6, outside: 6, clutch: 4 } },
          { kind: 'hotHand', stat: 'outside', maxAdd: 6, halfLife: 2, reset: 'quarter' },
        ],
      })
    );
    expect(digest(simulateGame({ home, away, seed: 'gm-hooks' }))).toMatchSnapshot();
  });

  it('stacked-position lineup (synergy branches) is unchanged', () => {
    // Three guards and two bigs: exercises Backcourt Speed + Twin Towers +
    // Specialists synergy branches (not the default one-of-each five), so the
    // computeSynergy path is covered by the golden master too.
    const stackedPositions = ['PG', 'SG', 'PG', 'PF', 'C'] as const;
    const starters: RosterPlayer[] = stackedPositions.map((position, i) => ({
      player: createPlayer(`Stack${i}`, POSITION_ARCHETYPE[position], createRNG(`gm-stack-${i}`).int),
      position,
    }));
    const home = teamFromRoster('Stacked', starters);
    const away = teamFromRoster('StackOpp', buildStartingRoster(createRNG('gm-stack-opp')).starters);
    expect(digest(simulateGame({ home, away, seed: 'gm-stack' }))).toMatchSnapshot();
  });

  it('strong opponent (deep round) is unchanged', () => {
    const rng = createRNG('gm-strong');
    const home = teamFromRoster('You', buildStartingRoster(rng).starters);
    const away = teamFromRoster('Boss', generateOpponentTeam(16, rng, { isBoss: true }).roster.starters);
    expect(digest(simulateGame({ home, away, seed: 'gm-strong' }))).toMatchSnapshot();
  });
});
