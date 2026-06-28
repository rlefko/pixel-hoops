import { describe, it, expect } from 'vitest';
import {
  derivePlaystyle,
  blendTendency,
  tendencyFor,
  NEUTRAL_TENDENCY,
  tendencyFromBaked,
  type BakedTendency,
} from '@/game/playstyle';
import { createPlayer, type PlayerStats } from '@/types/player';
import { POSITION_ARCHETYPE, type Position, type RosterPlayer } from '@/types/roster';
import { createRNG } from '@/game/rng';
import { actionWeights } from '@/game/simulation';
import type { OffActionId } from '@/types/sim';
import type { TeamStats } from '@/types/team';

function stats(over: Partial<PlayerStats>): PlayerStats {
  const base = createPlayer('T', 'small-forward', createRNG('t').int).stats;
  const out = {} as PlayerStats;
  for (const k of Object.keys(base) as (keyof PlayerStats)[]) out[k] = 12;
  return { ...out, ...over };
}

/** Share of `action` in a (possibly tendency-blended) action-weight list. */
function share(weights: readonly (readonly [OffActionId, number])[], action: OffActionId): number {
  const total = weights.reduce((s, [, w]) => s + w, 0);
  return (weights.find(([a]) => a === action)?.[1] ?? 0) / total;
}

const flatTeam = (): TeamStats => ({
  inside: 12, outside: 12, playmaking: 12, perimeterD: 12, interiorD: 12,
  athleticism: 12, iq: 10, clutch: 12, stamina: 12, durability: 12,
  blocking: 12, stealing: 12, strength: 12, rebounding: 12,
  pace: 12, off: 12, def: 12, ovr: 12, spacing: 0.5, creation: 0.6,
});

describe('derivePlaystyle', () => {
  it('respects position eligibility', () => {
    // A guard can never be a rim protector or a stretch big; a center can never be
    // a movement shooter or a floor general.
    for (const pos of ['PG', 'SG'] as Position[]) {
      const id = derivePlaystyle(stats({ blocking: 18, interiorD: 18 }), pos).id;
      expect(id).not.toBe('rim-protector');
      expect(id).not.toBe('stretch-big');
    }
    const big = derivePlaystyle(stats({ outside: 18, playmaking: 18 }), 'C').id;
    expect(big).not.toBe('movement-shooter');
    expect(big).not.toBe('floor-general');
  });

  it('reads the standout dimension', () => {
    expect(derivePlaystyle(stats({ outside: 19, perimeterD: 18 }), 'SG').id).toBe('three-and-d');
    expect(derivePlaystyle(stats({ playmaking: 19, iq: 17 }), 'PG').id).toBe('floor-general');
    expect(derivePlaystyle(stats({ blocking: 19, interiorD: 19, rebounding: 17 }), 'C').id).toBe('rim-protector');
    expect(derivePlaystyle(stats({ outside: 19, interiorD: 15 }), 'C').id).toBe('stretch-big');
    expect(derivePlaystyle(stats({ inside: 19, strength: 18 }), 'PF').id).toBe('post-scorer');
  });
});

describe('blendTendency', () => {
  it('biases a shooter toward threes and a slasher toward the rim', () => {
    const base = actionWeights(flatTeam(), 'balanced', 'mixed');
    const neutralThree = share(base, 'three');

    const shooter = derivePlaystyle(stats({ outside: 19, iq: 15 }), 'SG').tendency;
    const slasher = derivePlaystyle(stats({ athleticism: 19, inside: 17, outside: 8 }), 'SF').tendency;

    expect(share(blendTendency(base, shooter), 'three')).toBeGreaterThan(neutralThree);
    expect(share(blendTendency(base, slasher), 'three')).toBeLessThan(neutralThree);
    const slasherRim =
      share(blendTendency(base, slasher), 'drive') + share(blendTendency(base, slasher), 'layup');
    const shooterRim =
      share(blendTendency(base, shooter), 'drive') + share(blendTendency(base, shooter), 'layup');
    expect(slasherRim).toBeGreaterThan(shooterRim);
  });

  it('is a no-op for the neutral profile', () => {
    const base = actionWeights(flatTeam(), 'balanced', 'mixed');
    const blended = blendTendency(base, NEUTRAL_TENDENCY);
    for (let i = 0; i < base.length; i++) expect(blended[i][1]).toBeCloseTo(base[i][1], 9);
  });
});

describe('tendencyFor', () => {
  it('prefers an attached profile, else derives from ratings', () => {
    const seed = createPlayer('Derived', POSITION_ARCHETYPE.SG, createRNG('d').int);
    const rp: RosterPlayer = { player: seed, position: 'SG' };
    // Without an attached profile, it derives (non-null, well-formed).
    expect(tendencyFor(rp).three).toBeGreaterThan(0);

    const baked: BakedTendency = {
      shot: { post: 0, drive: 0, layup: 0, dunk: 0, mid: 0, three: 100 },
      onBall: 20, drawFoul: 10, playstyle: 'movement-shooter',
    };
    const withProfile: RosterPlayer = { ...rp, tendency: tendencyFromBaked(baked) };
    // The attached (pure-three) profile wins and skews the diet hard to threes.
    expect(tendencyFor(withProfile).three).toBeGreaterThan(tendencyFor(withProfile).post);
  });
});
