import { describe, it, expect } from 'vitest';
import { createRNG } from '@/game/rng';
import { createPlayer } from '@/types/player';
import type { RosterPlayer } from '@/types/roster';
import { effectivePlayers, teamModifierFor } from '@/game/apply-effects';
import { ITEM_BY_ID, itemDelta } from '@/game/items';

function rp(overrides: Partial<RosterPlayer> = {}): RosterPlayer {
  const player = createPlayer('Test', 'small-forward', createRNG('p').int);
  return { player, position: 'SF', ...overrides };
}

// Mirror of applyStatDelta's soft cap (full value to 20, diminishing to 24).
function softCap(raw: number): number {
  if (raw <= 20) return raw;
  return Math.min(20 + Math.round((raw - 20) * 0.5), 24);
}

describe('effectivePlayers', () => {
  it('bakes item + legend self-aura into a COPY, never mutating the base', () => {
    const base = rp({ item: { defId: 'sniper-scope' }, ability: 'cold_blooded', legendary: true });
    const beforeOutside = base.player.stats.outside;
    const [eff] = effectivePlayers([base]);
    // sniper-scope (+4 outside) + cold_blooded (+2 outside, +2 clutch), soft-capped above 20.
    expect(eff.player.stats.outside).toBe(softCap(beforeOutside + 6));
    expect(eff.player.stats.clutch).toBe(softCap(base.player.stats.clutch + 2));
    expect(base.player.stats.outside).toBe(beforeOutside); // input untouched
    expect(eff).not.toBe(base);
  });

  it('returns the same reference when a player has no effects', () => {
    const plain = rp();
    const [eff] = effectivePlayers([plain]);
    expect(eff).toBe(plain);
  });

  it('clamps a boss-relic downside to the 6..20 floor', () => {
    const weak = createPlayer('Weak', 'point-guard', createRNG('w').int);
    weak.stats.athleticism = 8;
    const r: RosterPlayer = { player: weak, position: 'PG', item: { defId: 'heavy-hitter-vest' } };
    const [eff] = effectivePlayers([r]);
    expect(eff.player.stats.athleticism).toBe(6); // 8 - 3 = 5, clamped to the 6 floor
    expect(eff.player.stats.inside).toBe(Math.min(20, weak.stats.inside + 8));
  });

  it('stacks an equipped gacha ability with the item channel (no double-count)', () => {
    // 'deadeye' is a rare +4 outside (-2 perimeter D); 'grip-tape' is +1 outside. Outside stacks once.
    const base = rp({ item: { defId: 'grip-tape' }, equippedAbility: { id: 'deadeye' } });
    const beforeOutside = base.player.stats.outside;
    const [eff] = effectivePlayers([base]);
    expect(eff.player.stats.outside).toBe(softCap(beforeOutside + 5));
    // A common ability's drawback also applies on its own channel.
    const drawback = rp({ equippedAbility: { id: 'gunner' } }); // +2 outside, -1 perimeter D
    const [eff2] = effectivePlayers([drawback]);
    expect(eff2.player.stats.outside).toBe(softCap(drawback.player.stats.outside + 2));
    expect(eff2.player.stats.perimeterD).toBe(Math.max(6, drawback.player.stats.perimeterD - 1));
  });
});

describe('teamModifierFor', () => {
  it('collects a legend team-aura and applies the on-loan chemistry tax', () => {
    const onLoanLegend = rp({ ability: 'chosen_one', legendary: true, onLoan: true });
    const filler = [rp(), rp(), rp(), rp()];
    const mod = teamModifierFor([onLoanLegend, ...filler], []);
    // chosen_one: +2 offense, +1 defense; chemistry tax: -1/-1.
    expect(mod.offenseBonus).toBeCloseTo(1);
    expect(mod.defenseBonus).toBeCloseTo(0);
    expect(mod.labels).toContain('On-Loan Star');
  });

  it('no chemistry tax for a native (non-on-loan) legend', () => {
    const nativeLegend = rp({ ability: 'chosen_one', legendary: true });
    const mod = teamModifierFor([nativeLegend], []);
    expect(mod.offenseBonus).toBe(2);
    expect(mod.labels).not.toContain('On-Loan Star');
  });

  it('folds passive boosts into the team modifier', () => {
    // 'lockdown' is an epic (net +3): +2 perimeter D, +2 interior D, -1 athleticism.
    const mod = teamModifierFor([rp()], [{ id: 'lockdown' }]);
    expect(mod.extra.perimeterD).toBe(2);
    expect(mod.extra.interiorD).toBe(2);
    expect(mod.extra.athleticism).toBe(-1);
  });

  it('folds a gacha ability team aura into the team modifier', () => {
    // 'floor-raiser' is a legendary +2 team outside (team aura via extra).
    const mod = teamModifierFor([rp({ equippedAbility: { id: 'floor-raiser' } })], []);
    expect(mod.extra.outside).toBe(2);
  });

  it('folds a run item conditional hook into the team modifier', () => {
    // 'momentum-band' is a pure-hook rare item (onResult madeThree -> +3 outside).
    const mod = teamModifierFor([rp({ item: { defId: 'momentum-band' } })], []);
    expect(mod.hooks).toContainEqual({ kind: 'onResult', on: 'madeThree', delta: { outside: 3 } });
    // A pure-hook item bakes no flat stats: its itemDelta is empty (no double-count).
    expect(itemDelta(ITEM_BY_ID['momentum-band'])).toEqual({});
  });

  it('folds an equipped gacha ability conditional hook into the team modifier', () => {
    // 'human-torch' is a pure-hook legendary ability (hotHand outside).
    const mod = teamModifierFor([rp({ equippedAbility: { id: 'human-torch' } })], []);
    expect(mod.hooks.some((h) => h.kind === 'hotHand')).toBe(true);
  });

  it('folds a scaling item ramp from the run counters (player path only)', () => {
    // 'crown-jewel' grows team outside +1 every 2 wins (cap 3). The flat +8 inside
    // bakes per-player (effectivePlayers), so the team modifier carries only the ramp.
    const five = [rp({ item: { defId: 'crown-jewel' } })];
    expect(teamModifierFor(five, []).extra.outside ?? 0).toBe(0); // no counters: no ramp
    const ramped = teamModifierFor(five, [], { wins: 6, mapIndex: 3, forgivenLosses: 0 });
    expect(ramped.extra.outside).toBe(3); // floor(6/2) = 3 stacks, capped at 3
  });
});
