import { describe, it, expect } from 'vitest';
import { createRNG } from '@/game/rng';
import { mapRatingsToStats, scaleRating } from '@/game/nba-map';
import {
  realPlayerToRosterPlayer,
  realPlayerAt,
  realLegendAt,
  legendRecruit,
  pickRealTeam,
} from '@/game/player-pool';
import { generateOpponentTeam } from '@/game/tournament';
import { NBA_PLAYERS, NBA_TEAMS } from '@/data/nba';
import { POSITIONS } from '@/types/roster';

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
    const fallback = mapRatingsToStats({ overall: 80 });
    expect(Number.isNaN(fallback.outside)).toBe(false);
  });
});

describe('player pool', () => {
  it('wraps a real player with archetype, legendary flag, and ability', () => {
    const rp = realPlayerToRosterPlayer(NBA_PLAYERS[0]);
    expect(rp.position).toBe(NBA_PLAYERS[0].position);
    expect(rp.player.name).toBe(NBA_PLAYERS[0].name);
    expect(rp.legendary).toBe(true);
    expect(rp.ability).toBe(NBA_PLAYERS[0].ability);
  });

  it('realPlayerAt is franchise-constrained, unscaled, and null when absent', () => {
    const c = realPlayerAt('C', createRNG('lal'), 'LAL'); // LAL has Kareem/Shaq at C
    expect(c).not.toBeNull();
    expect(c!.position).toBe('C');
    const src = NBA_PLAYERS.find((p) => p.name === c!.player.name)!;
    expect(src.teamAbbr).toBe('LAL');
    // Unscaled: keeps the authored elite line (at least one rating >= 8).
    expect(Math.max(...Object.values(c!.player.stats))).toBeGreaterThanOrEqual(8);
    // San Antonio has only a PF legend, so no PG legend exists there.
    expect(realPlayerAt('PG', createRNG('x'), 'SAS')).toBeNull();
  });

  it('realLegendAt returns a legend of the requested position', () => {
    for (const pos of POSITIONS) {
      const rp = realLegendAt(pos, createRNG(`g-${pos}`));
      expect(rp).not.toBeNull();
      expect(rp!.position).toBe(pos);
      expect(rp!.legendary).toBe(true);
    }
  });

  it('legendRecruit is an on-loan, deterministic legend', () => {
    const a = legendRecruit(createRNG('lr'));
    const b = legendRecruit(createRNG('lr'));
    expect(a).toEqual(b);
    expect(a.onLoan).toBe(true);
    expect(a.legendary).toBe(true);
  });

  it('pickRealTeam is deterministic per seed', () => {
    expect(pickRealTeam(createRNG('t'))).toEqual(pickRealTeam(createRNG('t')));
  });
});

describe('generateOpponentTeam (franchise-accurate + bosses)', () => {
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

  it('only fields franchise legends, at most one per five, in regular games', () => {
    for (let s = 0; s < 80; s++) {
      const round = 3 + (s % 5); // rounds 3-7, where legends can appear
      const opp = generateOpponentTeam(round, createRNG(`fr-${s}`));
      const team = NBA_TEAMS.find((t) => `${t.city} ${t.name}` === opp.name)!;
      const legends = opp.roster.starters.filter((p) => p.legendary);
      expect(legends.length).toBeLessThanOrEqual(1);
      for (const lg of legends) {
        const src = NBA_PLAYERS.find((p) => p.name === lg.player.name)!;
        expect(src.teamAbbr).toBe(team.abbreviation);
      }
    }
  });

  it('never fields a legend before round 3', () => {
    for (let s = 0; s < 40; s++) {
      for (const round of [1, 2]) {
        const opp = generateOpponentTeam(round, createRNG(`early-${round}-${s}`));
        expect(opp.roster.starters.some((p) => p.legendary)).toBe(false);
      }
    }
  });

  it('a boss can field a guest legend in the final round', () => {
    let sawGuest = false;
    for (let s = 0; s < 60 && !sawGuest; s++) {
      const opp = generateOpponentTeam(7, createRNG(`boss-${s}`), { isBoss: true });
      if (opp.roster.starters.some((p) => p.legendary)) sawGuest = true;
    }
    expect(sawGuest).toBe(true);
  });
});
