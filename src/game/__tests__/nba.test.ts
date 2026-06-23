import { describe, it, expect } from 'vitest';
import { createRNG } from '@/game/rng';
import { mapRatingsToStats, scaleRating } from '@/game/nba-map';
import {
  realPlayerToRosterPlayer,
  realPlayerAt,
  realRecruit,
  pickRealTeam,
} from '@/game/player-pool';
import { generateOpponentTeam } from '@/game/tournament';
import { NBA_PLAYERS } from '@/data/nba';
import { POSITIONS } from '@/types/roster';
import { getRoundStatRange } from '@/game/stat-scaling';

describe('nba rating mapping', () => {
  it('scales 2K ratings into the 3-10 band, clamped', () => {
    expect(scaleRating(99)).toBe(10);
    expect(scaleRating(25)).toBe(3);
    expect(scaleRating(10)).toBe(3); // below floor clamps up
    expect(scaleRating(150)).toBe(10); // above ceiling clamps down
    const mid = scaleRating(62);
    expect(mid).toBeGreaterThanOrEqual(3);
    expect(mid).toBeLessThanOrEqual(10);
  });

  it('condenses many attributes and tolerates missing fields', () => {
    const stats = mapRatingsToStats({
      threePointShot: 90,
      midRangeShot: 88,
      speed: 70,
      acceleration: 72,
      vertical: 95,
      strength: 60,
      intangibles: 99,
    });
    for (const v of Object.values(stats)) {
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(10);
    }
    // Falls back to overall when nothing matches, never NaN.
    const fallback = mapRatingsToStats({ overall: 80 });
    expect(Number.isNaN(fallback.outside)).toBe(false);
  });
});

describe('player pool', () => {
  it('wraps a real player with the natural archetype for their position', () => {
    const rp = realPlayerToRosterPlayer(NBA_PLAYERS[0]);
    expect(rp.position).toBe(NBA_PLAYERS[0].position);
    expect(rp.player.name).toBe(NBA_PLAYERS[0].name);
    expect(rp.player.level).toBe(1);
  });

  it('scales real players into the round range, deterministically', () => {
    const { min, max } = getRoundStatRange(3);
    const a = realRecruit(3, createRNG('p'));
    const b = realRecruit(3, createRNG('p'));
    expect(a).toEqual(b);
    for (const v of Object.values(a.player.stats)) {
      expect(v).toBeGreaterThanOrEqual(min);
      expect(v).toBeLessThanOrEqual(max);
    }
  });

  it('realPlayerAt returns a player of the requested position', () => {
    for (const pos of POSITIONS) {
      const rp = realPlayerAt(pos, 4, createRNG(`x-${pos}`));
      if (rp) expect(rp.position).toBe(pos);
    }
  });

  it('pickRealTeam is deterministic per seed', () => {
    expect(pickRealTeam(createRNG('t'))).toEqual(pickRealTeam(createRNG('t')));
  });
});

describe('generateOpponentTeam (real + fake mix)', () => {
  it('returns a real team identity, five starters, and both colors', () => {
    const opp = generateOpponentTeam(2, createRNG('opp'));
    expect(opp.roster.starters).toHaveLength(5);
    expect(opp.colorHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(opp.accentHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(opp.name.length).toBeGreaterThan(0);
  });

  it('is deterministic from its seed', () => {
    expect(generateOpponentTeam(3, createRNG('s'))).toEqual(
      generateOpponentTeam(3, createRNG('s'))
    );
  });
});
