import { describe, it, expect } from 'vitest';
import { createRNG, deriveSeed, type RNG } from '@/game/rng';
import { classLevel, classShift } from '@/game/classes';
import {
  difficultyMods,
  DIFFICULTIES,
  type Difficulty,
  type LadderClass,
} from '@/game/difficulty-mode';
import { buildTeam } from '@/game/lineup';
import { generateOpponentTeam, generatePlayerOfClass, planForRoster } from '@/game/tournament';
import { generateFixedMap } from '@/game/run-map';
import { simulateGame } from '@/game/simulation';
import { teamModifierFromPartial } from '@/game/effects';
import { poolByClass, realPlayerToRosterPlayer, legendRecruit } from '@/game/player-pool';
import { defaultLoadout } from '@/game/draft';
import { SKILL_STAT_KEYS, STAT_HARD_MAX, type PlayerStats } from '@/types/player';
import { POSITIONS, type Position, type RosterPlayer, type Roster } from '@/types/roster';
import type { MapNode } from '@/types/run-map';
import type { PlayerClass } from '@/game/ratings';
import type { Team } from '@/types/team';

/**
 * Monte-Carlo balance harness for the difficulty rebalance. The RNG is seeded, so
 * clear rates are fully DETERMINISTIC and this doubles as a regression guard.
 *
 * It plays representative full runs and reports per-(difficulty, archetype) clear
 * rates to validate the core intent: easy is winnable with a BASE roster, while
 * medium/hard/insane gate on permanent power (upgrades -> maxed -> maxed+abilities).
 * The ladder is acquisition-gated: the same archetype clears easy on any ladder
 * given class-appropriate (acquired) players.
 *
 * Fidelity (so the numbers transfer to the real game):
 *  - Real maps. Each map is the actual generateFixedMap output, so the opponent
 *    levels come straight from node.difficulty (the live ramp) and the combat COUNT
 *    is realistic per difficulty (insane routes through more games than easy).
 *  - Real routing. The player takes a min-combat path (the survival route a player
 *    who grasps the map would pick); only those combats are simulated.
 *  - Real players. The roster is REAL NBA players of the appropriate classes
 *    (poolByClass), drafted via defaultLoadout, so it is symmetric with the
 *    real-player-staffed opponents (no procedural-vs-real handicap).
 *
 * Modeling assumptions (documented so the numbers are honest, not exact):
 *  - Archetype = a flat OVR-equivalent lift on every skill (clamped at 30): base 0,
 *    someUpgrades +2, maxed +5 (the per-stat cap), maxed+abilities +7.
 *  - In-run power (training + boosts + recruits earned from the non-combat nodes the
 *    route favors) is a team buff ramping 0 -> INRUN_MAX across the run.
 *
 * Tuning: set BALANCE_N (e.g. `BALANCE_N=400 npx vitest run balance-sim`) for tight
 * estimates while iterating on the ramp endpoints in src/game/difficulty-mode.ts; the
 * shipped default stays small so CI is fast.
 */

const ARCHETYPES = { base: 0, someUpgrades: 2, maxed: 5, maxedAbilities: 7 } as const;
type Archetype = keyof typeof ARCHETYPES;
const ARCHETYPE_KEYS = Object.keys(ARCHETYPES) as Archetype[];

const MAPS = 7;
const COMBAT = new Set<MapNode['type']>(['game', 'elite', 'boss']);
/** Peak in-run team buff (offense + defense) by the final map. */
const INRUN_MAX = 4;
const ENV = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
const N = Number(ENV?.env?.BALANCE_N ?? 40);

function bump(stats: PlayerStats, delta: number): PlayerStats {
  if (delta === 0) return stats;
  const out = { ...stats };
  for (const k of SKILL_STAT_KEYS) out[k] = Math.min(STAT_HARD_MAX, stats[k] + delta);
  return out;
}

/** A real player of a class at a position (any position if that slot is dry). The
 * S+/S++ tiers have no NBA-pool entries (legends live in their own pool), so draw a
 * real legend there; only D falls back to a procedural streetball player. */
function playerOfClass(cls: PlayerClass, pos: Position, taken: Set<string>, rng: RNG): RosterPlayer {
  const pool = poolByClass(cls).filter((p) => !taken.has(p.name));
  const atPos = pool.filter((p) => p.position === pos);
  const pick = atPos.length ? rng.pick(atPos) : pool.length ? rng.pick(pool) : null;
  if (pick) {
    taken.add(pick.name);
    return realPlayerToRosterPlayer(pick);
  }
  if (cls === 'S+' || cls === 'S++') {
    for (let t = 0; t < 8; t++) {
      const lg = legendRecruit(rng);
      if (!taken.has(lg.player.name) && (lg.position === pos || t >= 5)) {
        taken.add(lg.player.name);
        return { ...lg, position: pos }; // place the legend in the needed slot
      }
    }
  }
  return generatePlayerOfClass(cls, pos, rng);
}

/** A class-shaped owned collection (5 below / 5 at / 2 above the ladder, like the
 * rookie twelve), each player lifted by the archetype delta (permanent upgrades). */
function collection(ladder: LadderClass, delta: number, rng: RNG): RosterPlayer[] {
  const taken = new Set<string>();
  const make = (cls: PlayerClass, count: number): RosterPlayer[] =>
    Array.from({ length: count }, (_, i) => {
      const rp = playerOfClass(cls, POSITIONS[i % POSITIONS.length], taken, rng);
      return { ...rp, player: { ...rp.player, stats: bump(rp.player.stats, delta) } };
    });
  return [...make(classShift(ladder, -1), 5), ...make(ladder, 5), ...make(classShift(ladder, 1), 2)];
}

/** The combat nodes on a min-combat entry->boss path (the survival route). */
function minCombatPath(map: ReturnType<typeof generateFixedMap>): MapNode[] {
  const memo = new Map<string, number>();
  const cost = (id: string): number => {
    const hit = memo.get(id);
    if (hit !== undefined) return hit;
    const node = map.nodes[id];
    const self = COMBAT.has(node.type) ? 1 : 0;
    const rest = node.next.length ? Math.min(...node.next.map(cost)) : 0;
    memo.set(id, self + rest);
    return self + rest;
  };
  const pickMin = (ids: readonly string[]): string =>
    ids.reduce((a, b) => (cost(a) <= cost(b) ? a : b));
  const path: MapNode[] = [];
  let id = pickMin(map.startNodeIds);
  for (;;) {
    const node = map.nodes[id];
    path.push(node);
    if (!node.next.length) break;
    id = pickMin(node.next);
  }
  return path.filter((n) => COMBAT.has(n.type));
}

/** In-run growth (training/boosts/recruits) as a team buff ramping 0 -> INRUN_MAX. */
function homeTeam(roster: Roster, mapIndex: number): Team {
  const b = Math.round((mapIndex / (MAPS - 1)) * INRUN_MAX);
  const modifier = teamModifierFromPartial({ offenseBonus: b, defenseBonus: b });
  return buildTeam('You', roster.starters, planForRoster(roster), '#FFD54F', '#1D428A', roster.bench, modifier);
}

/** Play one full run; true if it clears every map before exhausting the timeout pool. */
function playRun(difficulty: Difficulty, ladder: LadderClass, delta: number, seed: string): boolean {
  const ladderLevel = classLevel(ladder);
  const mods = difficultyMods(difficulty);
  let timeouts = mods.secondChances;
  const roster: Roster = defaultLoadout(
    collection(ladder, delta, createRNG(deriveSeed(seed, `roster-${ladder}`))),
    ladder,
    difficulty
  );
  for (let map = 0; map < MAPS; map++) {
    const home = homeTeam(roster, map);
    const fixed = generateFixedMap({ seed: deriveSeed(seed, `map-${map}`), mapIndex: map, difficulty, ladderLevel });
    for (const node of minCombatPath(fixed)) {
      const level = node.difficulty ?? ladderLevel;
      const boss = node.type === 'boss';
      const opp = generateOpponentTeam(level, createRNG(deriveSeed(seed, `opp-${node.id}`)), {
        isBoss: boss,
        extraLegend: boss && mods.bossExtraLegend,
      });
      const away = buildTeam(
        opp.name,
        opp.roster.starters,
        planForRoster(opp.roster),
        opp.colorHex,
        opp.accentHex,
        opp.roster.bench
      );
      // Replay while losing and timeouts remain (a run-wide pool, like the real run).
      let attempt = 0;
      for (;;) {
        const result = simulateGame({ home, away, seed: deriveSeed(seed, `g-${node.id}-${attempt}`) });
        if (result.winner === 'home') break;
        if (timeouts > 0) {
          timeouts--;
          attempt++;
          continue;
        }
        return false;
      }
    }
  }
  return true;
}

function clearRate(difficulty: Difficulty, ladder: LadderClass, delta: number): number {
  let cleared = 0;
  for (let s = 0; s < N; s++) if (playRun(difficulty, ladder, delta, `bal-${s}`)) cleared += 1;
  return cleared / N;
}

const pct = (x: number): string => `${(x * 100).toFixed(0).padStart(4)}%`;

describe('balance: difficulty clear rates', () => {
  it('eases easy for base rosters and gates harder tiers on permanent power', () => {
    const grid = {} as Record<Difficulty, Record<Archetype, number>>;
    for (const d of DIFFICULTIES) {
      grid[d] = {} as Record<Archetype, number>;
      for (const a of ARCHETYPE_KEYS) grid[d][a] = clearRate(d, 'C', ARCHETYPES[a]);
    }
    // Ladder is acquisition-gated: easy stays winnable with class-appropriate rosters.
    const easySBase = clearRate('easy', 'S', ARCHETYPES.base);
    const easySplusBase = clearRate('easy', 'S+', ARCHETYPES.base);

    const out = [
      `\nclear rates (C ladder), N=${N}`,
      `difficulty      base  some maxed m+abil`,
      ...DIFFICULTIES.map(
        (d) =>
          d.padEnd(13) +
          [grid[d].base, grid[d].someUpgrades, grid[d].maxed, grid[d].maxedAbilities].map(pct).join(' ')
      ),
      `easy S  base (acquired S):       ${pct(easySBase)}`,
      `easy S+ base (acquired legends): ${pct(easySplusBase)}`,
    ].join('\n');
    console.log(out);

    // Easy is first-time-friendly with a base roster: a real win rate, neither
    // impossible nor a walkover.
    expect(grid.easy.base).toBeGreaterThan(0.4);
    expect(grid.easy.base).toBeLessThan(0.9);
    // Harder tiers gate on permanent power: a BASE roster cannot clear them.
    expect(grid.medium.base).toBeLessThan(0.15);
    expect(grid.hard.base).toBeLessThan(0.1);
    expect(grid.insane.base).toBeLessThan(0.05);
    // Within every tier, more investment never lowers the clear rate (a true gate).
    for (const d of DIFFICULTIES) {
      expect(grid[d].someUpgrades).toBeGreaterThanOrEqual(grid[d].base);
      expect(grid[d].maxed).toBeGreaterThanOrEqual(grid[d].someUpgrades);
      expect(grid[d].maxedAbilities).toBeGreaterThanOrEqual(grid[d].maxed);
    }
    // Medium rewards SOME upgrades (clearable without maxing).
    expect(grid.medium.someUpgrades).toBeGreaterThan(0.2);
    // Hard rewards maxing (achievable, with a little luck); base/some cannot.
    expect(grid.hard.maxed).toBeGreaterThan(0.15);
    expect(grid.hard.someUpgrades).toBeLessThan(grid.hard.maxed);
    // Insane rewards maxing + abilities, and even then takes some luck (not a gimme).
    expect(grid.insane.maxedAbilities).toBeGreaterThan(0.1);
    expect(grid.insane.maxedAbilities).toBeLessThan(0.6);
    expect(grid.insane.maxed).toBeLessThan(grid.insane.maxedAbilities);
    // The ladder is acquisition-gated, not upgrade-gated: base acquired rosters clear easy.
    expect(easySBase).toBeGreaterThan(0.3);
    expect(easySplusBase).toBeGreaterThan(0.3);
  }, 120_000);
});
