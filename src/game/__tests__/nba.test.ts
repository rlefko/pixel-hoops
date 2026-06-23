import { describe, it, expect } from 'vitest';
import { createRNG } from '@/game/rng';
import { mapRatingsToStats, scaleRating } from '@/game/nba-map';
import {
  realPlayerToRosterPlayer,
  legendRecruit,
  pickRealTeam,
  legendForTeam,
  modernStartersForTeam,
  freeAgentPool,
} from '@/game/player-pool';
import { generateOpponentTeam, pickFreeAgentFive } from '@/game/tournament';
import { NBA_PLAYERS, NBA_LEGENDS, NBA_STARTERS, NBA_TEAMS } from '@/data/nba';
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

  it('legendForTeam returns that franchise own legend for every team', () => {
    for (const team of NBA_TEAMS) {
      const lg = legendForTeam(team.abbreviation, createRNG(`L-${team.abbreviation}`));
      expect(lg, team.abbreviation).not.toBeNull();
      expect(lg!.legendary).toBe(true);
      const src = NBA_LEGENDS.find((p) => p.name === lg!.player.name)!;
      expect(src.teamAbbr).toBe(team.abbreviation);
    }
  });

  it('modernStartersForTeam returns five non-legend reals per team, one per position', () => {
    for (const team of NBA_TEAMS) {
      const five = modernStartersForTeam(team.abbreviation);
      expect(five, team.abbreviation).toHaveLength(5);
      expect(five.every((p) => !p.legendary)).toBe(true);
      expect(new Set(five.map((p) => p.position)).size).toBe(5);
    }
  });

  it('freeAgentPool is the modern starter pool (no legends)', () => {
    expect(freeAgentPool()).toBe(NBA_STARTERS);
    expect(freeAgentPool().every((p) => !p.legendary)).toBe(true);
  });

  it('pickFreeAgentFive picks five distinct reals, one per position, deterministically', () => {
    const a = pickFreeAgentFive(createRNG('fa'));
    const b = pickFreeAgentFive(createRNG('fa'));
    expect(a).toEqual(b);
    expect(a.map((p) => p.position)).toEqual([...POSITIONS]);
    expect(new Set(a.map((p) => p.player.name)).size).toBe(5);
    expect(a.every((p) => !p.legendary)).toBe(true);
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

  it('staffs regular games with real, non-legendary franchise starters', () => {
    for (let s = 0; s < 90; s++) {
      const round = 1 + (s % 7);
      const opp = generateOpponentTeam(round, createRNG(`fr-${s}`));
      const team = NBA_TEAMS.find((t) => `${t.city} ${t.name}` === opp.name)!;
      const starterNames = new Set(
        modernStartersForTeam(team.abbreviation).map((p) => p.name)
      );
      // Regular games never field a legend.
      expect(opp.roster.starters.some((p) => p.legendary)).toBe(false);
      // Every starter is a real player from this franchise.
      for (const sp of opp.roster.starters) {
        expect(
          starterNames.has(sp.player.name),
          `${sp.player.name} not a ${team.abbreviation} starter`
        ).toBe(true);
      }
    }
  });

  it('headlines every boss with its own franchise all-time legend', () => {
    for (let s = 0; s < 90; s++) {
      const round = 3 + (s % 6); // boss rounds 3-8
      const opp = generateOpponentTeam(round, createRNG(`boss-${s}`), { isBoss: true });
      const team = NBA_TEAMS.find((t) => `${t.city} ${t.name}` === opp.name)!;
      const legends = opp.roster.starters.filter((p) => p.legendary);
      expect(legends.length, `boss legend for ${team.abbreviation}`).toBeGreaterThanOrEqual(1);
      for (const lg of legends) {
        const src = NBA_LEGENDS.find((p) => p.name === lg.player.name)!;
        expect(src.teamAbbr).toBe(team.abbreviation);
      }
    }
  });
});
