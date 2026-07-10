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
 * band. This is the calibration contract for the numbers in signature.ts AND the
 * SHOWCASE biases in showcase.ts, run as two lanes over the same seeds:
 *
 *  - BASE lane (no call): the condition numbers stay calibrated to un-showcased
 *    play. No condition is a coin-flip-free gift (aggregate ceiling) or a dead
 *    letter (per-legend floor). A tier-3 legend hitting ~5-10% per boss win
 *    still lands ~40% per dedicated run (seven bosses): the intended PANTHEON
 *    chase.
 *  - SHOWCASE lane (the call armed on the legend, same game seeds): the call is
 *    a real decision, never a mandatory tax and never a gift. Pins: the
 *    per-template lift band, the aggregate ceiling, and the win-rate floor (the
 *    cost must not brick the win the moment requires). Thresholds are NEVER
 *    re-tuned around the showcased lane (the anti-ritual-tap rule): base play
 *    stays the calibration center, the call is strictly additive odds.
 *
 *  - Deterministic (seeded), so drift here means the sim's texture changed and
 *    the signature/showcase numbers must be re-tuned, not that the test is
 *    flaky. The MOMENT_ODDS display table in showcase.ts is measured from these
 *    lanes (see docs/signature-signings.md).
 */

const GAMES = 40;
/** Aggregate per-template hit band among won games, base lane (see header). */
const TEMPLATE_BAND = { min: 0.15, max: 0.7 };
/** Per-legend guard rails, base lane: never impossible, never a guarantee. */
const LEGEND_BAND = { min: 0.02, max: 0.92 };
/** The showcased per-template aggregate lift: the call is real (>= min) but
 * bounded (<= max), and the showcased aggregate never crosses the gift line. */
const SHOWCASE_LIFT_BAND = { min: 0.03, max: 0.25 };
const SHOWCASE_TEMPLATE_MAX = 0.7;
/** Showcased per-legend rail: the single easiest chase (a dominant glass big
 * under CRASH THE GLASS) may run hotter than the base rail, but no call ever
 * makes the moment a certainty. */
const SHOWCASE_LEGEND_BAND = { min: 0.02, max: 0.96 };
/** The cost must leave a dedicated five winning: every legend clears this floor
 * with the call armed, and the median stays a real favorite. */
const SHOWCASE_WIN_FLOOR = 0.3;
const SHOWCASE_WIN_MEDIAN = 0.42;

function bump(stats: PlayerStats, delta: number): PlayerStats {
  const out = { ...stats };
  for (const k of SKILL_STAT_KEYS) out[k] = Math.min(STAT_HARD_MAX, stats[k] + delta);
  return out;
}

describe('signature moment pacing (seeded sim harness)', () => {
  it('every legend`s condition lands in the band at their floor, base and showcased', () => {
    const byTemplate = new Map<
      string,
      { hits: number; wins: number; showHits: number; showWins: number }
    >();
    const winRates: number[] = [];
    const showWinRates: number[] = [];
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
      const lanes = {
        base: { wins: 0, hits: 0 },
        show: { wins: 0, hits: 0 },
      };
      for (const lane of ['base', 'show'] as const) {
        for (let g = 0; g < GAMES; g++) {
          const starters = scaleLegendsForLadder(five, 'S');
          const plan = planForRoster({ starters, bench: [] });
          const tactic =
            lane === 'show'
              ? { ...plan, showcase: { playerName: legend.name, templateId: ch.templateId } }
              : plan;
          const home = buildTeam('You', starters, tactic, '#FFD54F', '#1D428A', []);
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
          const result = simulateGame({
            home,
            away,
            seed: deriveSeed('sig-game', `${legend.slug}-${g}`),
          });
          if (result.winner !== 'home') continue;
          lanes[lane].wins++;
          const met = momentMet(ch, {
            difficulty: ch.floor,
            ladderClass: 'S',
            nodeType: ch.stage === 'any' ? 'game' : ch.stage,
            line: result.box.home.find((l) => l.name === legend.name),
            events: result.events,
          });
          if (met) lanes[lane].hits++;
        }
      }
      expect(
        lanes.base.wins,
        `${legend.name}: a dedicated five should win at their floor`
      ).toBeGreaterThan(GAMES * 0.3);
      expect(
        lanes.show.wins,
        `${legend.name}: the showcase cost must not brick the win`
      ).toBeGreaterThan(GAMES * SHOWCASE_WIN_FLOOR);
      winRates.push(lanes.base.wins / GAMES);
      showWinRates.push(lanes.show.wins / GAMES);
      const rate = lanes.base.hits / lanes.base.wins;
      expect(rate, `${legend.name} [${ch.templateId} T${ch.tier}] hit rate`).toBeGreaterThanOrEqual(
        LEGEND_BAND.min
      );
      expect(rate, `${legend.name} [${ch.templateId} T${ch.tier}] hit rate`).toBeLessThanOrEqual(
        LEGEND_BAND.max
      );
      const showRate = lanes.show.hits / lanes.show.wins;
      expect(
        showRate,
        `${legend.name} [${ch.templateId} T${ch.tier}] showcased hit rate`
      ).toBeGreaterThanOrEqual(SHOWCASE_LEGEND_BAND.min);
      expect(
        showRate,
        `${legend.name} [${ch.templateId} T${ch.tier}] showcased hit rate`
      ).toBeLessThanOrEqual(SHOWCASE_LEGEND_BAND.max);
      const t = byTemplate.get(ch.templateId) ?? { hits: 0, wins: 0, showHits: 0, showWins: 0 };
      t.hits += lanes.base.hits;
      t.wins += lanes.base.wins;
      t.showHits += lanes.show.hits;
      t.showWins += lanes.show.wins;
      byTemplate.set(ch.templateId, t);
    }
    for (const [tpl, { hits, wins, showHits, showWins }] of byTemplate) {
      const rate = hits / wins;
      expect(rate, `template ${tpl} aggregate`).toBeGreaterThanOrEqual(TEMPLATE_BAND.min);
      expect(rate, `template ${tpl} aggregate`).toBeLessThanOrEqual(TEMPLATE_BAND.max);
      const showRate = showHits / showWins;
      expect(showRate, `template ${tpl} showcased aggregate`).toBeLessThanOrEqual(
        SHOWCASE_TEMPLATE_MAX
      );
      const lift = showRate - rate;
      expect(lift, `template ${tpl} showcased lift`).toBeGreaterThanOrEqual(
        SHOWCASE_LIFT_BAND.min
      );
      expect(lift, `template ${tpl} showcased lift`).toBeLessThanOrEqual(SHOWCASE_LIFT_BAND.max);
    }
    const median = winRates.sort((a, b) => a - b)[Math.floor(winRates.length / 2)];
    expect(median, 'median dedicated win rate at the floor').toBeGreaterThanOrEqual(0.5);
    const showMedian = showWinRates.sort((a, b) => a - b)[Math.floor(showWinRates.length / 2)];
    expect(showMedian, 'median showcased win rate at the floor').toBeGreaterThanOrEqual(
      SHOWCASE_WIN_MEDIAN
    );
  }, 240_000);
});
