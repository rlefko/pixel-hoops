import { describe, it, expect } from 'vitest';
import { createRNG, deriveSeed } from '@/game/rng';
import { classLevel } from '@/game/classes';
import { difficultyMods } from '@/game/difficulty-mode';
import { buildTeam } from '@/game/lineup';
import { generateOpponentTeam, planForRoster } from '@/game/tournament';
import { simulateGame } from '@/game/simulation';
import { scaleLegendsForLadder } from '@/game/apply-effects';
import { poolByClass, realPlayerToRosterPlayer } from '@/game/player-pool';
import { NBA_LEGENDS } from '@/data/nba';
import { momentMet, signatureByKey } from '@/game/signature';
import { nameKey, POSITIONS, type RosterPlayer } from '@/types/roster';
import { SKILL_STAT_KEYS, STAT_HARD_MAX, type PlayerStats } from '@/types/player';

/**
 * The SIGNATURE MOMENT pacing harness: plays real seeded sims for every legend at
 * their tier's floor (a maxed S five around them, boss-grade opponents when their
 * stage demands it) and pins each condition's hit rate among WON games into a
 * band. This is the calibration contract for the numbers in signature.ts:
 *
 *  - No condition is a coin-flip-free gift (aggregate ceiling) or a dead letter
 *    (per-legend floor). A tier-3 legend hitting ~5-10% per boss win still lands
 *    ~40% per dedicated run (seven bosses), which is the intended PANTHEON chase.
 *  - Deterministic (seeded), so drift here means the sim's texture changed and
 *    the signature numbers must be re-tuned, not that the test is flaky.
 */

const GAMES = 40;
/** Aggregate per-template hit band among won games (see header). */
const TEMPLATE_BAND = { min: 0.15, max: 0.7 };
/** Per-legend guard rails: never impossible, never a guarantee. */
const LEGEND_BAND = { min: 0.02, max: 0.92 };

function bump(stats: PlayerStats, delta: number): PlayerStats {
  const out = { ...stats };
  for (const k of SKILL_STAT_KEYS) out[k] = Math.min(STAT_HARD_MAX, stats[k] + delta);
  return out;
}

describe('signature moment pacing (seeded sim harness)', () => {
  it('every legend`s condition lands in the band at their floor', () => {
    const byTemplate = new Map<string, { hits: number; wins: number }>();
    const winRates: number[] = [];
    for (const legend of NBA_LEGENDS) {
      const ch = signatureByKey(nameKey(legend.name, legend.position))!;
      const mods = difficultyMods(ch.floor);
      const level = classLevel('S') + mods.rampEnd;
      // A dedicated attempt: four maxed S teammates around the legend on the S
      // ladder (the roster a player chasing this legend actually fields).
      const mates = POSITIONS.filter((p) => p !== legend.position).map((pos, i) => {
        const pool = poolByClass('S').filter((p) => p.position === pos);
        const pick = pool[i % pool.length] ?? poolByClass('S')[i];
        const rp = realPlayerToRosterPlayer(pick);
        return { ...rp, position: pos, player: { ...rp.player, stats: bump(rp.player.stats, 5) } };
      });
      const legendRp: RosterPlayer = { ...realPlayerToRosterPlayer(legend), onLoan: true };
      const slot = POSITIONS.indexOf(legend.position);
      const five = [...mates.slice(0, slot), legendRp, ...mates.slice(slot)];
      let wins = 0;
      let hits = 0;
      for (let g = 0; g < GAMES; g++) {
        const starters = scaleLegendsForLadder(five, 'S');
        const home = buildTeam(
          'You',
          starters,
          planForRoster({ starters, bench: [] }),
          '#FFD54F',
          '#1D428A',
          []
        );
        const opp = generateOpponentTeam(
          level,
          createRNG(deriveSeed('sig-opp', `${legend.slug}-${g}`)),
          { isBoss: ch.stage === 'boss' }
        );
        const away = buildTeam(
          opp.name,
          opp.roster.starters,
          planForRoster(opp.roster),
          opp.colorHex,
          opp.accentHex,
          opp.roster.bench
        );
        const result = simulateGame({ home, away, seed: deriveSeed('sig-game', `${legend.slug}-${g}`) });
        if (result.winner !== 'home') continue;
        wins++;
        const met = momentMet(ch, {
          difficulty: ch.floor,
          ladderClass: 'S',
          nodeType: ch.stage === 'any' ? 'game' : ch.stage,
          line: result.box.home.find((l) => l.name === legend.name),
          events: result.events,
        });
        if (met) hits++;
      }
      expect(wins, `${legend.name}: a dedicated five should win at their floor`).toBeGreaterThan(
        GAMES * 0.3
      );
      winRates.push(wins / GAMES);
      const rate = hits / wins;
      expect(rate, `${legend.name} [${ch.templateId} T${ch.tier}] hit rate`).toBeGreaterThanOrEqual(
        LEGEND_BAND.min
      );
      expect(rate, `${legend.name} [${ch.templateId} T${ch.tier}] hit rate`).toBeLessThanOrEqual(
        LEGEND_BAND.max
      );
      const t = byTemplate.get(ch.templateId) ?? { hits: 0, wins: 0 };
      t.hits += hits;
      t.wins += wins;
      byTemplate.set(ch.templateId, t);
    }
    for (const [tpl, { hits, wins }] of byTemplate) {
      const rate = hits / wins;
      expect(rate, `template ${tpl} aggregate`).toBeGreaterThanOrEqual(TEMPLATE_BAND.min);
      expect(rate, `template ${tpl} aggregate`).toBeLessThanOrEqual(TEMPLATE_BAND.max);
    }
    const median = winRates.sort((a, b) => a - b)[Math.floor(winRates.length / 2)];
    expect(median, 'median dedicated win rate at the floor').toBeGreaterThanOrEqual(0.5);
  }, 120_000);
});
