import { describe, it, expect } from 'vitest';
import { createRNG } from '@/game/rng';
import { createPlayer } from '@/types/player';
import type { RosterPlayer } from '@/types/roster';
import { effectivePlayers, teamModifierFor } from '@/game/apply-effects';

function rp(overrides: Partial<RosterPlayer> = {}): RosterPlayer {
  const player = createPlayer('Test', 'small-forward', createRNG('p').int);
  return { player, position: 'SF', ...overrides };
}

describe('effectivePlayers', () => {
  it('bakes item + legend self-aura into a COPY, never mutating the base', () => {
    const base = rp({ item: { defId: 'sniper-scope' }, ability: 'cold_blooded', legendary: true });
    const beforeOutside = base.player.stats.outside;
    const [eff] = effectivePlayers([base]);
    // sniper-scope (+3 outside) + cold_blooded (+1 outside, +1 clutch), clamped to 10.
    expect(eff.player.stats.outside).toBe(Math.min(10, beforeOutside + 4));
    expect(eff.player.stats.clutch).toBe(Math.min(10, base.player.stats.clutch + 1));
    expect(base.player.stats.outside).toBe(beforeOutside); // input untouched
    expect(eff).not.toBe(base);
  });

  it('returns the same reference when a player has no effects', () => {
    const plain = rp();
    const [eff] = effectivePlayers([plain]);
    expect(eff).toBe(plain);
  });

  it('clamps a boss-relic downside to the 3..10 floor', () => {
    const weak = createPlayer('Weak', 'point-guard', createRNG('w').int);
    weak.stats.athleticism = 4;
    const r: RosterPlayer = { player: weak, position: 'PG', item: { defId: 'heavy-hitter-vest' } };
    const [eff] = effectivePlayers([r]);
    expect(eff.player.stats.athleticism).toBe(3); // 4 - 2 = 2, clamped to 3
    expect(eff.player.stats.inside).toBe(Math.min(10, weak.stats.inside + 4));
  });
});

describe('teamModifierFor', () => {
  it('collects a legend team-aura and applies the on-loan chemistry tax', () => {
    const onLoanLegend = rp({ ability: 'chosen_one', legendary: true, onLoan: true });
    const filler = [rp(), rp(), rp(), rp()];
    const mod = teamModifierFor([onLoanLegend, ...filler], []);
    // chosen_one: +1 offense, +0.5 defense; chemistry tax: -0.5/-0.5.
    expect(mod.offenseBonus).toBeCloseTo(0.5);
    expect(mod.defenseBonus).toBeCloseTo(0);
    expect(mod.labels).toContain('On-Loan Star');
  });

  it('no chemistry tax for a native (non-on-loan) legend', () => {
    const nativeLegend = rp({ ability: 'chosen_one', legendary: true });
    const mod = teamModifierFor([nativeLegend], []);
    expect(mod.offenseBonus).toBe(1);
    expect(mod.labels).not.toContain('On-Loan Star');
  });

  it('folds passive boosts into the team modifier', () => {
    const mod = teamModifierFor([rp()], [{ id: 'lockdown', tier: 2 }]);
    expect(mod.extra.perimeterD).toBe(2);
    expect(mod.extra.interiorD).toBe(2);
  });
});
