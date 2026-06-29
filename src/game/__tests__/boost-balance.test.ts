import { describe, it, expect } from 'vitest';
import { createRNG, deriveSeed } from '@/game/rng';
import { generateOpponentTeam, planForRoster } from '@/game/tournament';
import { buildTeam } from '@/game/lineup';
import { simulateGame } from '@/game/simulation';
import { teamModifierFor } from '@/game/apply-effects';
import type { RunCounters } from '@/game/effects';
import { BOOST_DEFS, type PassiveBoost } from '@/game/boosts';
import { rollRarity, RARITY_ORDER, type Rarity } from '@/game/rarity';
import type { Roster } from '@/types/roster';
import type { Team } from '@/types/team';

/**
 * Monte-Carlo balance harness for passive boosts. The auto-sim's unfair advantage is
 * that thousands of games run headlessly, so this measures each boost's MARGINAL win
 * lift and flags dominant or dead picks (the anti-dominant-build safeguard from the
 * design research). Seeded -> fully deterministic, so it doubles as a regression guard.
 *
 * Method: a full-strength home roster plays a same-level opponent. Each boost's lift
 * is winRate(home + that boost) minus the no-boost baseline against the SAME opponent,
 * so roster A-vs-B imbalance cancels and what remains is the boost's own contribution.
 * Conditional and scaling boosts get real treatment (folded through teamModifierFor and
 * resolved at a mid-run counter snapshot), so hook/snowball lifts are measured, not
 * assumed. Raise BOOST_BALANCE_N for tight estimates while tuning magnitudes.
 */

const ENV = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
const N = Number(ENV?.env?.BOOST_BALANCE_N ?? 120);
/** Approx standard error of a lift (a difference of two ~0.5 win rates over N games).
 * The sanity guards widen with it so they never flake on small-sample noise; raise N
 * to tighten them. The directional "rarity buys power" check is noise-robust on its own. */
const SE = 0.71 / Math.sqrt(N);
const NOISE = 3.5 * SE;
const LEVEL = 14; // a full-strength mid-ladder matchup (roughly the A class)
const COUNTERS: RunCounters = { wins: 3, mapIndex: 3, forgivenLosses: 0 }; // mid-run, so scalers ramp

/** A fixed home/away roster pair at the same level (so the baseline is near even). */
function rosters(seed: string): { home: Roster; away: Roster; awayMeta: ReturnType<typeof generateOpponentTeam> } {
  const home = generateOpponentTeam(LEVEL, createRNG(deriveSeed(seed, 'home'))).roster;
  const awayMeta = generateOpponentTeam(LEVEL, createRNG(deriveSeed(seed, 'away')));
  return { home, away: awayMeta.roster, awayMeta };
}

function homeTeamWith(home: Roster, boosts: PassiveBoost[]): Team {
  const mod = teamModifierFor(home.starters, boosts, COUNTERS);
  return buildTeam('Home', home.starters, planForRoster(home), '#FFD54F', '#1D428A', home.bench, mod);
}

/** Home win rate over N seeded games for a given boost set. */
function winRate(seed: string, boosts: PassiveBoost[]): number {
  const { home, away, awayMeta } = rosters(seed);
  const homeTeam = homeTeamWith(home, boosts);
  const awayTeam = buildTeam(awayMeta.name, away.starters, planForRoster(away), awayMeta.colorHex, awayMeta.accentHex, away.bench);
  let wins = 0;
  for (let s = 0; s < N; s++) {
    if (simulateGame({ home: homeTeam, away: awayTeam, seed: deriveSeed(seed, `g-${s}`) }).winner === 'home') wins += 1;
  }
  return wins / N;
}

interface Lift {
  id: string;
  rarity: Rarity;
  lift: number;
}

function measureAll(seed: string): Lift[] {
  const baseline = winRate(seed, []);
  return BOOST_DEFS.map((d) => ({ id: d.id, rarity: d.rarity, lift: winRate(seed, [{ id: d.id }]) - baseline }));
}

const meanLiftByRarity = (lifts: Lift[], r: Rarity): number => {
  const xs = lifts.filter((l) => l.rarity === r);
  return xs.reduce((s, l) => s + l.lift, 0) / Math.max(1, xs.length);
};

describe('balance: boost win lift', () => {
  it('rewards rarity, never produces a dominant or harmful boost', () => {
    const SEED = 'boost-bal';
    const lifts = measureAll(SEED);

    const byRarity = Object.fromEntries(RARITY_ORDER.map((r) => [r, meanLiftByRarity(lifts, r)])) as Record<Rarity, number>;
    const dominant = lifts.filter((l) => l.lift > 0.3).map((l) => `${l.id} +${(l.lift * 100).toFixed(0)}pp`);
    const dead = lifts.filter((l) => l.lift < 0.01).map((l) => `${l.id} (${(l.lift * 100).toFixed(0)}pp)`);

    console.log(
      [
        `\nboost win-lift vs a same-level opponent, N=${N} (noise band +-${(NOISE * 100).toFixed(0)}pp)`,
        ...RARITY_ORDER.map((r) => `${r.padEnd(10)} mean lift ${(byRarity[r] * 100).toFixed(1)}pp`),
        dominant.length ? `DOMINANT (review): ${dominant.join(', ')}` : 'no dominant boosts',
        dead.length ? `low/zero lift (often conditional/defensive, fine): ${dead.join(', ')}` : 'no dead picks',
      ].join('\n')
    );

    // Determinism: the same boost from the same seed gives an identical win rate.
    const probe = [{ id: BOOST_DEFS[0].id }];
    expect(winRate(SEED, probe)).toBe(winRate(SEED, probe));

    // The core balance claim, noise-robust: rarity buys power, so the legendary tier
    // lifts clearly more than the common tier on average.
    expect(byRarity.legendary).toBeGreaterThan(byRarity.common);
    // Sanity guards (widened by the sample noise): no boost runs away with a matchup,
    // and none is systematically harmful. Raise N to tighten these.
    for (const l of lifts) expect(l.lift, l.id).toBeLessThan(0.3 + NOISE);
    for (const l of lifts) expect(l.lift, l.id).toBeGreaterThan(-NOISE);
  }, 120_000);

  it('keeps the pity-biased rarity roll under control (epic+ never the norm)', () => {
    const epicPlusShare = (offset: number): number => {
      let c = 0;
      const n = 4000;
      for (let s = 0; s < n; s++) {
        const r = rollRarity(createRNG(`pity-${offset}-${s}`), offset);
        if (r === 'epic' || r === 'legendary') c += 1;
      }
      return c / n;
    };
    const cold = epicPlusShare(0);
    const hot = epicPlusShare(4);
    expect(cold).toBeLessThan(0.1); // baseline ~6%
    expect(hot).toBeGreaterThan(cold);
    expect(hot).toBeLessThan(0.5); // a drought pays off but epic+ is never the default
  });
});
