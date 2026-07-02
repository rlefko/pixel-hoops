import { describe, it, expect } from 'vitest';
import { recommendLineup, reorderForCoach, recMinDelta, type CoachRec } from '@/game/coach-reco';
import type { ReorderResult } from '@/game/coach-reco';
import { buildTeam } from '@/game/lineup';
import { buildCoachedHomeTeam } from '@/game/run-machine';
import { getCoach } from '@/game/coaches';
import { createRNG } from '@/game/rng';
import { DEFAULT_GAME_PLAN } from '@/types/tactics';
import { createPlayer, STAT_KEYS, type PlayerStats } from '@/types/player';
import {
  POSITIONS,
  POSITION_ARCHETYPE,
  type Position,
  type Roster,
  type RosterPlayer,
} from '@/types/roster';
import type { Team } from '@/types/team';

/**
 * Golden master for the coach lineup search: pins the EXACT output of
 * reorderForCoach / recommendLineup for a fixed grid of coaches, rosters, and
 * opponents. The search is pure and RNG-free, so any optimization must reproduce
 * these digests bit-for-bit (styleGain is pinned as a raw float on purpose).
 *
 * The snapshots were recorded from the baseline search. Regenerate ONLY when an
 * intentional gameplay change lands, never for performance work.
 */

/** A seeded, varied player (real stat spread), so tie-breaking, the class floor,
 * and both big/perimeter branches are exercised the way live rosters do. */
function varied(name: string, position: Position): RosterPlayer {
  return { player: createPlayer(name, POSITION_ARCHETYPE[position], createRNG(name).int), position };
}

/** A player whose every rating is `value` (exact ties on demand). */
function flatPlayer(name: string, position: Position, value: number): RosterPlayer {
  const base = createPlayer(name, POSITION_ARCHETYPE[position], createRNG(name).int);
  const stats = { ...base.stats } as PlayerStats;
  for (const k of STAT_KEYS) stats[k] = value;
  return { player: { ...base, stats }, position };
}

function fiveAt(value: number, tag: string): RosterPlayer[] {
  return POSITIONS.map((p, i) => flatPlayer(`${tag}-${p}-${i}`, p, value));
}

/** A flat player with specific stats overridden (a controlled stylistic profile). */
function shaped(name: string, position: Position, base: number, over: Partial<PlayerStats>): RosterPlayer {
  const rp = flatPlayer(name, position, base);
  return { ...rp, player: { ...rp.player, stats: { ...rp.player.stats, ...over } } };
}

/** The full late-run shape the search costs the most on: a varied five plus a
 * seven-deep varied bench with both bigs and perimeter players. */
function fullRoster(tag: string): Roster {
  return {
    starters: POSITIONS.map((p) => varied(`${tag}-S-${p}`, p)),
    bench: [
      varied(`${tag}-b0`, 'PG'),
      varied(`${tag}-b1`, 'SG'),
      varied(`${tag}-b2`, 'SF'),
      varied(`${tag}-b3`, 'PF'),
      varied(`${tag}-b4`, 'C'),
      varied(`${tag}-b5`, 'SG'),
      varied(`${tag}-b6`, 'PF'),
    ],
  };
}

const buildHome = (r: Roster): Team =>
  buildTeam('You', r.starters, DEFAULT_GAME_PLAN, '#FFD54F', '#1D428A', r.bench);

const opponent = buildTeam(
  'Them',
  POSITIONS.map((p) => varied(`opp-${p}`, p)),
  DEFAULT_GAME_PLAN,
  '#E5484D',
  '#000'
);

const names = (list: RosterPlayer[]): string =>
  list.map((rp) => `${rp.player.name}@${rp.position}`).join(',');

function reorderDigest(r: ReorderResult) {
  return {
    starters: names(r.roster.starters),
    bench: names(r.roster.bench),
    changes: r.changes,
    styleGain: r.styleGain, // raw float: pins the exact bits
  };
}

function recDigest(rec: CoachRec | null) {
  if (rec === null) return null;
  return {
    starters: names(rec.starters),
    bench: names(rec.bench),
    edge: rec.edge,
    changes: rec.changes,
    summary: rec.summary,
  };
}

describe('reorderForCoach golden master', () => {
  it.each([
    ['george-karl'], // C, iq 8: budget 1, pure style (matchup weight 0)
    ['mike-budenholzer'], // B, iq 11: budget 2, matchup weight 0.5
    ['rick-carlisle'], // A, iq 14: budget 3, matchup weight 0.5
    ['erik-spoelstra'], // S lockdown, iq 17: budget 4, matchup weight 1
    ['gregg-popovich'], // S+, iq 19: budget 5, matchup weight 1
    ['mike-dantoni'], // A fast/outside: the pace+focus lean branches
    ['jerry-sloan'], // C slow/inside: the opposite lean branches
  ])('full varied roster vs opponent: %s', (coachId) => {
    const result = reorderForCoach({
      roster: fullRoster(`grid-${coachId}`),
      coach: getCoach(coachId),
      buildHome,
      opponent,
    });
    expect(reorderDigest(result)).toMatchSnapshot();
  });

  it('pure-style branch (no opponent), S+ coach', () => {
    const result = reorderForCoach({
      roster: fullRoster('pure-style'),
      coach: getCoach('gregg-popovich'),
      buildHome,
    });
    expect(reorderDigest(result)).toMatchSnapshot();
  });

  it('single-body bench', () => {
    const roster: Roster = {
      starters: POSITIONS.map((p) => varied(`one-S-${p}`, p)),
      bench: [varied('one-b0', 'SF')],
    };
    const result = reorderForCoach({
      roster,
      coach: getCoach('erik-spoelstra'),
      buildHome,
      opponent,
    });
    expect(reorderDigest(result)).toMatchSnapshot();
  });

  it('injured bench players cannot start but still sort into the rotation', () => {
    const roster = fullRoster('hurt');
    roster.bench = roster.bench.map((rp, i) => (i < 2 ? { ...rp, gamesOut: 1 } : rp));
    const result = reorderForCoach({
      roster,
      coach: getCoach('gregg-popovich'),
      buildHome,
      opponent,
    });
    expect(reorderDigest(result)).toMatchSnapshot();
  });

  it('flat-stat ties pin the first-best tie-break order', () => {
    // Every candidate swap of the same slot type produces the identical gain, so the
    // winner is decided purely by iteration order; this digest pins that order.
    const roster: Roster = {
      starters: fiveAt(10, 'tie-s'),
      bench: [
        flatPlayer('tie-b0', 'SG', 14),
        flatPlayer('tie-b1', 'SG', 14),
        flatPlayer('tie-b2', 'PF', 14),
        flatPlayer('tie-b3', 'PF', 14),
      ],
    };
    const result = reorderForCoach({
      roster,
      coach: getCoach('gregg-popovich'),
      buildHome,
      opponent,
    });
    expect(reorderDigest(result)).toMatchSnapshot();
  });

  it('strong five over a weak bench: zero changes, bench sorted, early break', () => {
    const roster: Roster = {
      starters: fiveAt(17, 'wall-s'),
      bench: [flatPlayer('wall-b0', 'PG', 8), flatPlayer('wall-b1', 'C', 7), flatPlayer('wall-b2', 'SG', 9)],
    };
    const result = reorderForCoach({
      roster,
      coach: getCoach('gregg-popovich'),
      buildHome,
      opponent,
    });
    expect(result.changes).toBe(0);
    expect(reorderDigest(result)).toMatchSnapshot();
  });

  it('matchup veto: a smart coach refuses the tanking style swap, a blunt one takes it', () => {
    // The injected builder tanks any five that starts StyleFit, so the highest style
    // gain carries a large matchup penalty; this pins that the veto path (and its
    // absence at iq <= 10) survives any search optimization.
    const styleFit = shaped('StyleFit', 'SG', 13, { outside: 18, athleticism: 18 });
    const roster: Roster = {
      starters: [
        flatPlayer('tank-pg', 'PG', 13),
        flatPlayer('tank-sg', 'SG', 13),
        flatPlayer('tank-sf', 'SF', 13),
        flatPlayer('tank-pf', 'PF', 13),
        flatPlayer('tank-c', 'C', 13),
      ],
      bench: [styleFit],
    };
    const tanking = (r: Roster): Team => {
      const starting = r.starters.some((p) => p.player.name === 'StyleFit');
      return buildTeam('You', fiveAt(starting ? 6 : 15, 'ctl'), DEFAULT_GAME_PLAN, '#FFD54F', '#1D428A', r.bench);
    };
    const blunt = reorderForCoach({ roster, coach: getCoach('george-karl'), opponent, buildHome: tanking });
    const smart = reorderForCoach({ roster, coach: getCoach('steve-kerr'), opponent, buildHome: tanking });
    expect(blunt.changes).toBe(1);
    expect(smart.changes).toBe(0);
    expect({ blunt: reorderDigest(blunt), smart: reorderDigest(smart) }).toMatchSnapshot();
  });

  it('production builder path: buildCoachedHomeTeam with counters', () => {
    const coach = getCoach('erik-spoelstra');
    const counters = { wins: 4, mapIndex: 1, forgivenLosses: 0 };
    const result = reorderForCoach({
      roster: fullRoster('prod'),
      coach,
      buildHome: (r) => buildCoachedHomeTeam(r, coach, [], counters),
      opponent,
    });
    expect(reorderDigest(result)).toMatchSnapshot();
  });
});

describe('recommendLineup golden master', () => {
  it('returns null with an empty bench', () => {
    const roster: Roster = { starters: fiveAt(10, 'nobench'), bench: [] };
    const rec = recommendLineup({
      roster,
      coach: getCoach('gregg-popovich'),
      opponent,
      buildHome,
      minDelta: 0.1,
    });
    expect(rec).toBeNull();
  });

  it('the minDelta gate: the same reshape surfaces on hard and stays quiet on easy', () => {
    const roster = (tag: string): Roster => ({
      starters: fiveAt(12, `${tag}-s`),
      bench: [flatPlayer(`${tag}-up`, 'SG', 13)],
    });
    const surfaced = recommendLineup({
      roster: roster('gate-a'),
      coach: getCoach('gregg-popovich'),
      opponent,
      buildHome,
      minDelta: recMinDelta('insane', 'boss'),
    });
    const quiet = recommendLineup({
      roster: roster('gate-b'),
      coach: getCoach('gregg-popovich'),
      opponent,
      buildHome,
      minDelta: recMinDelta('easy', 'game'),
    });
    expect({ surfaced: recDigest(surfaced), quiet: recDigest(quiet) }).toMatchSnapshot();
  });

  it('full pregame rec digest (banner content) on the full varied roster', () => {
    const rec = recommendLineup({
      roster: fullRoster('banner'),
      coach: getCoach('gregg-popovich'),
      opponent,
      buildHome,
      minDelta: recMinDelta('hard', 'elite'),
    });
    expect(recDigest(rec)).toMatchSnapshot();
  });
});
