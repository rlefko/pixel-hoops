import { describe, it, expect } from 'vitest';
import { createRNG } from '@/game/rng';
import { buildTeam } from '@/game/lineup';
import { planForRoster } from '@/game/tournament';
import { simulateGame } from '@/game/simulation';
import { deriveTeamIdentity } from '@/game/team-identity';
import { getSpecialty, isSpecialist } from '@/game/specialty';
import { NBA_POOL } from '@/data/nba';
import { createPlayer, type PlayerStats } from '@/types/player';
import {
  POSITIONS,
  POSITION_ARCHETYPE,
  type Position,
  type Roster,
  type RosterPlayer,
} from '@/types/roster';

/**
 * Play-style stats (blocking/stealing/strength/rebounding) and the box-score
 * attribution they drive. The headline guarantee: a pass-first guard essentially
 * never blocks, while the center hoards blocks and rebounds (the bug that started
 * this work). Plus the data distribution from the re-baked pool, team identity,
 * and specialty labels.
 */

/** One real-ish player per position (archetype-biased), deterministic by seed. */
function fiveOf(seed: string, positions: readonly Position[] = POSITIONS): RosterPlayer[] {
  return positions.map((pos, i) => ({
    player: createPlayer(`${pos}-${seed}-${i}`, POSITION_ARCHETYPE[pos], createRNG(`${seed}-${i}`).int),
    position: pos,
  }));
}

function teamOf(seed: string, positions?: readonly Position[]) {
  const five = fiveOf(seed, positions);
  const roster: Roster = { starters: five, bench: [] };
  return buildTeam(seed, five, planForRoster(roster), '#FFD54F', '#1D428A');
}

describe('play-style box-score attribution', () => {
  it('a pass-first guard essentially never blocks; the center hoards blocks and boards', () => {
    const bySlot = { PG: { blk: 0, stl: 0, reb: 0 }, C: { blk: 0, stl: 0, reb: 0 } };
    let cLedBlocks = 0;
    let pgLedBlocks = 0;
    let teamBlocks = 0;
    let teamSteals = 0;
    let teamReb = 0;
    let teamGames = 0;
    const GAMES = 80;
    for (let i = 0; i < GAMES; i++) {
      const res = simulateGame({ home: teamOf(`h-${i}`), away: teamOf(`a-${i}`), seed: `g-${i}` });
      for (const box of [res.box.home, res.box.away]) {
        teamGames += 1;
        for (const b of box) {
          teamBlocks += b.blk;
          teamSteals += b.stl;
          teamReb += b.reb;
          if (b.slot === 'PG') {
            bySlot.PG.blk += b.blk;
            bySlot.PG.stl += b.stl;
            bySlot.PG.reb += b.reb;
          } else if (b.slot === 'C') {
            bySlot.C.blk += b.blk;
            bySlot.C.stl += b.stl;
            bySlot.C.reb += b.reb;
          }
        }
        const maxBlk = Math.max(...box.map((b) => b.blk));
        const leaders = box.filter((b) => b.blk === maxBlk && maxBlk > 0).map((b) => b.slot);
        if (leaders.includes('C')) cLedBlocks += 1;
        if (leaders.includes('PG') && !leaders.includes('C')) pgLedBlocks += 1;
      }
    }

    // The Trae Young guarantee: a point guard almost never records a block.
    expect(bySlot.PG.blk / teamGames).toBeLessThan(0.4);
    // The center massively out-blocks the point guard.
    expect(bySlot.C.blk).toBeGreaterThan(bySlot.PG.blk * 8);
    // The center leads team blocks far more often than a guard ever does.
    expect(cLedBlocks).toBeGreaterThan(pgLedBlocks * 5);
    // The center also out-rebounds the guard.
    expect(bySlot.C.reb).toBeGreaterThan(bySlot.PG.reb * 3);
    // Guards generate more steals than centers.
    expect(bySlot.PG.stl).toBeGreaterThan(bySlot.C.stl);

    // Believable arcade-scale per-team box totals (loose bands).
    expect(teamBlocks / teamGames).toBeGreaterThan(1.5);
    expect(teamBlocks / teamGames).toBeLessThan(9);
    expect(teamSteals / teamGames).toBeGreaterThan(2);
    expect(teamSteals / teamGames).toBeLessThan(12);
    expect(teamReb / teamGames).toBeGreaterThan(14);
    expect(teamReb / teamGames).toBeLessThan(40);
  });

  it('is deterministic: the same seed yields the identical box score', () => {
    const a = simulateGame({ home: teamOf('h'), away: teamOf('a'), seed: 'same' });
    const b = simulateGame({ home: teamOf('h'), away: teamOf('a'), seed: 'same' });
    expect(a.box).toEqual(b.box);
  });
});

describe('re-baked pool play-style distribution', () => {
  const meanBy = (pos: Position, key: keyof PlayerStats): number => {
    const vals = NBA_POOL.filter((p) => p.position === pos).map((p) => p.stats[key]);
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  };

  it('maps 2K data so bigs block/rebound/bang and guards steal', () => {
    // Centers out-rate point guards on the interior play-style traits.
    expect(meanBy('C', 'blocking')).toBeGreaterThan(meanBy('PG', 'blocking'));
    expect(meanBy('C', 'rebounding')).toBeGreaterThan(meanBy('PG', 'rebounding'));
    expect(meanBy('C', 'strength')).toBeGreaterThan(meanBy('PG', 'strength'));
    // Point guards out-rate centers on stealing (no size term in the mapping).
    expect(meanBy('PG', 'stealing')).toBeGreaterThan(meanBy('C', 'stealing'));
  });

  it('keeps every pool play-style rating inside the normal 6-20 band', () => {
    for (const p of NBA_POOL) {
      for (const key of ['blocking', 'stealing', 'strength', 'rebounding'] as const) {
        expect(p.stats[key]).toBeGreaterThanOrEqual(6);
        expect(p.stats[key]).toBeLessThanOrEqual(20);
      }
    }
  });
});

describe('team identity', () => {
  it('always returns at least one tag, a blurb, and in-range tendencies', () => {
    for (let i = 0; i < 12; i++) {
      const id = deriveTeamIdentity(teamOf(`id-${i}`));
      expect(id.tags.length).toBeGreaterThanOrEqual(1);
      expect(id.tags.length).toBeLessThanOrEqual(3);
      expect(id.blurb.length).toBeGreaterThan(0);
      expect(id.tendencies.projBlocks).toBeGreaterThanOrEqual(1);
      expect(id.tendencies.projBlocks).toBeLessThanOrEqual(7);
      expect(id.tendencies.projSteals).toBeGreaterThanOrEqual(2);
      expect(id.tendencies.projSteals).toBeLessThanOrEqual(9);
      expect(id.tendencies.projRebounds).toBeGreaterThanOrEqual(16);
      expect(id.tendencies.projRebounds).toBeLessThanOrEqual(32);
    }
  });

  it('reads pace/focus off the auto-derived game plan (guard-heavy runs and shoots)', () => {
    const guardHeavy = teamOf('guards', ['PG', 'SG', 'PG', 'SG', 'SF']);
    const id = deriveTeamIdentity(guardHeavy);
    expect(id.tendencies.pace).toBe('fast');
    expect(id.tendencies.focus).toBe('outside');
  });
});

describe('specialty labels', () => {
  const base: PlayerStats = {
    inside: 10, outside: 10, playmaking: 10, perimeterD: 10, interiorD: 10,
    athleticism: 10, iq: 10, clutch: 10, stamina: 10, durability: 10,
    blocking: 8, stealing: 8, strength: 8, rebounding: 8,
  };
  const mk = (over: Partial<PlayerStats>, position: Position): RosterPlayer => ({
    player: { name: 'Test', archetype: 'center', stats: { ...base, ...over }, level: 1, trainingXP: 0 },
    position,
  });

  it('labels a standout rim protector and ball hawk by their play-style trait', () => {
    expect(getSpecialty(mk({ blocking: 18 }, 'C'))).toBe('Rim Protector');
    expect(getSpecialty(mk({ stealing: 18 }, 'PG'))).toBe('Ball Hawk');
    expect(getSpecialty(mk({ rebounding: 18 }, 'PF'))).toBe('Glass Cleaner');
  });

  it('flags an elite play-style trait as a specialist (for recruit pity)', () => {
    expect(isSpecialist(mk({ blocking: 16 }, 'C'))).toBe(true);
    expect(isSpecialist(mk({ stealing: 15 }, 'PG'))).toBe(true);
    expect(isSpecialist(mk({}, 'PG'))).toBe(false); // all play-style at 8: not a specialist
  });
});
