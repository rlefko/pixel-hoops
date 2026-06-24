import { describe, it, expect } from 'vitest';
import { createRNG } from '@/game/rng';
import { createRookieRoster, homeToRunRoster } from '@/game/home-roster';
import {
  playerCost,
  lineupCost,
  budgetFor,
  evaluateLineupBudget,
  cheapestFiveCost,
} from '@/game/budget';
import { generateRecruitOffers } from '@/game/tournament';
import { RATING_CAP, PER_STAT_HARD_MAX } from '@/game/upgrades';
import { MAX_LEAGUE_TIER } from '@/game/ascension';
import { createPlayer } from '@/types/player';
import { POSITIONS, type Position, type RosterPlayer } from '@/types/roster';

/** A player whose eight skill stats are all `v` (so ovrRaw == v). */
function uniform(v: number, position: Position = 'PG'): RosterPlayer {
  const p = createPlayer('P', 'point-guard', createRNG('u').int);
  return {
    position,
    player: {
      ...p,
      stats: {
        ...p.stats,
        inside: v, outside: v, playmaking: v, perimeterD: v,
        interiorD: v, athleticism: v, iq: v, clutch: v,
      },
    },
  };
}

const fiveMaxed = POSITIONS.map((pos) => uniform(RATING_CAP, pos));

describe('salary-cap budget', () => {
  it('charges convexly: a maxed stud costs far more than a role player', () => {
    expect(playerCost(uniform(10))).toBeGreaterThan(4 * playerCost(uniform(7)));
    // Strictly monotonic in OVR.
    for (let v = 4; v < 10; v++) {
      expect(playerCost(uniform(v + 1))).toBeGreaterThanOrEqual(playerCost(uniform(v)));
    }
  });

  it('sums only the five starters (the bench is free)', () => {
    const five = [uniform(7), uniform(7), uniform(7), uniform(7), uniform(7)];
    expect(lineupCost(five)).toBe(five.reduce((s, p) => s + playerCost(p), 0));
  });

  it('grows with the league tier and clamps to a ceiling', () => {
    expect(budgetFor(0)).toBeLessThan(budgetFor(5));
    expect(budgetFor(MAX_LEAGUE_TIER)).toBeGreaterThan(budgetFor(0));
    expect(budgetFor(1000)).toBeLessThanOrEqual(budgetFor(MAX_LEAGUE_TIER));
  });

  it('lets a rookie five fit the run-1 budget', () => {
    for (let s = 0; s < 30; s++) {
      const five = homeToRunRoster(createRookieRoster(createRNG(`rk-${s}`))).starters;
      expect(evaluateLineupBudget(five, budgetFor(0)).over).toBe(false);
    }
  });

  it('never lets five maxed studs fit, even at the top tier (anti-snowball)', () => {
    expect(evaluateLineupBudget(fiveMaxed, budgetFor(MAX_LEAGUE_TIER)).over).toBe(true);
  });

  it('blocks stacking five strong recruits at the run-1 budget', () => {
    // Five level-9-scaled recruits cannot all start: the snowball this prevents.
    const recruits = generateRecruitOffers(9, 5, createRNG('rec'));
    expect(evaluateLineupBudget(recruits, budgetFor(0)).over).toBe(true);
  });

  it('reports a grace floor so an all-studs pool never soft-locks', () => {
    // cheapestFiveCost is the lowest achievable five; for an all-maxed pool it
    // exceeds the cap, which is the signal the picker uses to still allow confirm.
    const pool = [...fiveMaxed, uniform(10, 'SG'), uniform(10, 'SF')];
    expect(cheapestFiveCost(pool)).toBeGreaterThan(budgetFor(0));
    expect(cheapestFiveCost(pool)).toBe(lineupCost(fiveMaxed.slice(0, 5)));
  });

  it('keeps the permanent per-stat cap bounded (Pokelike-style)', () => {
    expect(PER_STAT_HARD_MAX).toBeLessThan(RATING_CAP);
  });
});
