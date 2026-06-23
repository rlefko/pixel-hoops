import { createRNG, deriveSeed } from './rng';
import { generateRunMap, traverseTo } from './run-map';
import {
  generateOpponentTeam,
  generateRecruitOffers,
  planForRoster,
} from './tournament';
import { buildTeam, validateLineup } from './lineup';
import { simulateGame } from './simulation';
import { homeToRunRoster, type HomeRoster } from './home-roster';
import type { RunState } from '@/types/run-map';
import type { RosterPlayer } from '@/types/roster';
import type { BoxLine, SimResult } from '@/types/sim';
import type { Team } from '@/types/team';
import type { PlayerStats } from '@/types/player';
import { DEFAULT_GAME_PLAN, type GamePlan } from '@/types/tactics';
// Import the palette module directly (not the @/theme barrel, which pulls in
// font `require`s) so this pure reducer stays Node/Vitest-safe.
import { palette } from '@/theme/palette';

/**
 * The roguelike run state machine: pure types, an initializer, and a reducer.
 * No React, no storage, no theme barrel, so it unit-tests headless. The hook
 * (src/hooks/useRun.ts) wraps this with state + persistence side effects.
 */

const RECRUIT_OFFER_COUNT = 3;
const WIN_COINS = 10;
const REST_REPUTATION = 2;
const STAT_CAP = 10;

// --- Between-game injuries (gentle: never bricks a run) ---
/** Base per-game injury chance for a heavily-used, average-durability player. */
const INJURY_BASE = 0.05;
/** Game load that maps to "full minutes" (load / this ~ 1 for a full game). */
const INJURY_LOAD_NORM = 90;
/** Most games an injury can sideline a player. */
const MAX_GAMES_OUT = 2;

export type RunPhase =
  | { kind: 'map' }
  | { kind: 'pregame'; nodeId: string }
  | { kind: 'game'; nodeId: string }
  | { kind: 'postgame'; nodeId: string; won: boolean }
  | { kind: 'recruit'; nodeId: string; offers: RosterPlayer[] }
  | { kind: 'training'; nodeId: string }
  | { kind: 'rest'; nodeId: string }
  | { kind: 'shop'; nodeId: string }
  | { kind: 'lineup'; returnTo: RunPhase }
  | { kind: 'summary'; champion: boolean };

export interface RunModel {
  core: RunState;
  phase: RunPhase;
  gamePlan: GamePlan;
  wins: number;
  /** Active game context, set on enterGame and read in game/postgame. */
  game: {
    opponentName: string;
    result: SimResult;
    home: Team;
    away: Team;
  } | null;
}

export type RunAction =
  | { type: 'newRun'; seed: string; homeRoster: HomeRoster }
  | { type: 'chooseNode'; nodeId: string }
  | { type: 'setGamePlan'; plan: GamePlan }
  | { type: 'openLineupBuilder' }
  | { type: 'setLineup'; starters: RosterPlayer[]; bench: RosterPlayer[] }
  | { type: 'cancelLineup' }
  | { type: 'enterGame' }
  | { type: 'finishReplay' }
  | { type: 'resolveGameResult' }
  | { type: 'recruit'; player: RosterPlayer }
  | { type: 'trainPlayer'; index: number; stat: keyof PlayerStats }
  | { type: 'rest' }
  | { type: 'skipNode' }
  | { type: 'backToMap' }
  | { type: 'endRun' };

/** Build a fresh run from a seed and the player's home roster. */
export function initRun(seed: string, homeRoster: HomeRoster): RunModel {
  const map = generateRunMap({ seed: deriveSeed(seed, 'map') });
  const core: RunState = {
    map,
    currentNodeId: null,
    roster: homeToRunRoster(homeRoster),
    seed,
    rewards: { coins: 0, reputation: 0, trainingXP: 0 },
  };
  return {
    core,
    phase: { kind: 'map' },
    gamePlan: DEFAULT_GAME_PLAN,
    wins: 0,
    game: null,
  };
}

/** Replace one player in the combined starters+bench list, re-split into a roster. */
function withReplacedPlayer(
  core: RunState,
  index: number,
  next: RosterPlayer
): RunState['roster'] {
  const all = [...core.roster.starters, ...core.roster.bench];
  const updated = all.map((p, i) => (i === index ? next : p));
  return { starters: updated.slice(0, 5), bench: updated.slice(5) };
}

/**
 * The five (plus bench) that actually dress for a game: healthy players first,
 * injured players backfilled only if there are fewer than five healthy, so a run
 * can never be bricked by injuries. With a deep, healthy roster the player's
 * chosen order is preserved.
 */
function dressedRoster(roster: RunState['roster']): RunState['roster'] {
  const all = [...roster.starters, ...roster.bench];
  const healthy = all.filter((p) => !(p.gamesOut && p.gamesOut > 0));
  if (healthy.length >= 5) {
    // Enough healthy bodies: injured players sit out entirely (not even bench),
    // so rotation can never put a hurt player back on the floor.
    return { starters: healthy.slice(0, 5), bench: healthy.slice(5) };
  }
  // Short-handed: backfill with the least-injured so a five always takes the
  // floor (a run is never bricked by injuries).
  const injured = all
    .filter((p) => p.gamesOut && p.gamesOut > 0)
    .sort((a, b) => (a.gamesOut ?? 0) - (b.gamesOut ?? 0));
  const ordered = [...healthy, ...injured];
  return { starters: ordered.slice(0, 5), bench: ordered.slice(5) };
}

/**
 * After a game, recover everyone one game (decrement gamesOut) and roll fresh
 * injuries for the players who dressed. Risk rises with accumulated load and
 * falls with durability: more minutes mean more risk (not the naive "iron-man"
 * inversion). Deterministic from the game's derived seed.
 */
function applyInjuries(
  core: RunState,
  homeBox: BoxLine[],
  nodeId: string
): RunState['roster'] {
  const rng = createRNG(deriveSeed(core.seed, `injury-${nodeId}`));
  const lineByName = new Map(homeBox.map((b) => [b.name, b]));
  const update = (p: RosterPlayer): RosterPlayer => {
    let gamesOut = Math.max(0, (p.gamesOut ?? 0) - 1); // heal one game
    const line = lineByName.get(p.player.name);
    if (line && line.seconds > 0) {
      const risk =
        (INJURY_BASE * (line.load / INJURY_LOAD_NORM) * (11 - p.player.stats.durability)) / 8;
      if (rng.chance(risk)) gamesOut = rng.int(1, MAX_GAMES_OUT);
    }
    return { ...p, gamesOut };
  };
  return {
    starters: core.roster.starters.map(update),
    bench: core.roster.bench.map(update),
  };
}

export function runReducer(
  model: RunModel | null,
  action: RunAction
): RunModel | null {
  if (action.type === 'newRun') return initRun(action.seed, action.homeRoster);
  if (model === null) return null;

  switch (action.type) {
    case 'chooseNode': {
      const core = traverseTo(model.core, action.nodeId);
      const node = core.map.nodes[action.nodeId];
      const round = node.round ?? node.layer + 1;
      let phase: RunPhase;
      switch (node.type) {
        case 'game':
        case 'elite':
        case 'boss':
          phase = { kind: 'pregame', nodeId: action.nodeId };
          break;
        case 'recruit': {
          const rng = createRNG(
            deriveSeed(core.seed, `recruit-${action.nodeId}`)
          );
          phase = {
            kind: 'recruit',
            nodeId: action.nodeId,
            offers: generateRecruitOffers(round, RECRUIT_OFFER_COUNT, rng),
          };
          break;
        }
        case 'training':
          phase = { kind: 'training', nodeId: action.nodeId };
          break;
        case 'rest':
          phase = { kind: 'rest', nodeId: action.nodeId };
          break;
        case 'shop':
          phase = { kind: 'shop', nodeId: action.nodeId };
          break;
        default:
          // Defensive: unknown/corrupt node type falls back to the map.
          phase = { kind: 'map' };
      }
      return { ...model, core, phase };
    }

    case 'setGamePlan':
      return { ...model, gamePlan: action.plan };

    case 'openLineupBuilder':
      return { ...model, phase: { kind: 'lineup', returnTo: model.phase } };

    case 'setLineup': {
      if (model.phase.kind !== 'lineup') return model;
      if (!validateLineup(action.starters).ok) return model;
      const roster = { starters: action.starters, bench: action.bench };
      return {
        ...model,
        core: { ...model.core, roster },
        phase: model.phase.returnTo,
      };
    }

    case 'cancelLineup':
      return model.phase.kind === 'lineup'
        ? { ...model, phase: model.phase.returnTo }
        : model;

    case 'enterGame': {
      if (model.phase.kind !== 'pregame') return model;
      const nodeId = model.phase.nodeId;
      const node = model.core.map.nodes[nodeId];
      const round = node.round ?? node.layer + 1;
      const dressed = dressedRoster(model.core.roster);
      const home = buildTeam(
        'Your Squad',
        dressed.starters,
        model.gamePlan,
        palette.homeTeam,
        palette.homeTeamAccent,
        dressed.bench
      );
      const opp = generateOpponentTeam(
        round,
        createRNG(deriveSeed(model.core.seed, `opp-${nodeId}`))
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
        seed: deriveSeed(model.core.seed, `game-${nodeId}`),
      });
      return {
        ...model,
        phase: { kind: 'game', nodeId },
        game: { opponentName: opp.name, result, home, away },
      };
    }

    case 'finishReplay': {
      if (model.phase.kind !== 'game' || !model.game) return model;
      const won = model.game.result.winner === 'home';
      return {
        ...model,
        phase: { kind: 'postgame', nodeId: model.phase.nodeId, won },
      };
    }

    case 'resolveGameResult': {
      if (model.phase.kind !== 'postgame') return model;
      const { won, nodeId } = model.phase;
      if (!won)
        return { ...model, phase: { kind: 'summary', champion: false } };
      const node = model.core.map.nodes[nodeId];
      const isBoss =
        node.type === 'boss' || nodeId === model.core.map.bossNodeId;
      const rewards = {
        ...model.core.rewards,
        coins: model.core.rewards.coins + WIN_COINS,
        reputation: model.core.rewards.reputation + node.layer + 1,
      };
      // Recover prior knocks and roll fresh injuries from this game's workload.
      const roster = model.game
        ? applyInjuries(model.core, model.game.result.box.home, nodeId)
        : model.core.roster;
      const core = { ...model.core, rewards, roster };
      const wins = model.wins + 1;
      if (isBoss)
        return {
          ...model,
          core,
          wins,
          phase: { kind: 'summary', champion: true },
        };
      return { ...model, core, wins, phase: { kind: 'map' }, game: null };
    }

    case 'recruit': {
      if (model.phase.kind !== 'recruit') return model;
      const roster = {
        ...model.core.roster,
        bench: [...model.core.roster.bench, action.player],
      };
      return {
        ...model,
        core: { ...model.core, roster },
        phase: { kind: 'map' },
      };
    }

    case 'trainPlayer': {
      if (model.phase.kind !== 'training') return model;
      const all = [...model.core.roster.starters, ...model.core.roster.bench];
      const target = all[action.index];
      if (!target) return model;
      const next: RosterPlayer = {
        ...target,
        player: {
          ...target.player,
          stats: {
            ...target.player.stats,
            [action.stat]: Math.min(
              STAT_CAP,
              target.player.stats[action.stat] + 1
            ),
          },
        },
      };
      const roster = withReplacedPlayer(model.core, action.index, next);
      return {
        ...model,
        core: { ...model.core, roster },
        phase: { kind: 'map' },
      };
    }

    case 'rest': {
      if (model.phase.kind !== 'rest') return model;
      const rewards = {
        ...model.core.rewards,
        reputation: model.core.rewards.reputation + REST_REPUTATION,
      };
      // Rest fully clears injuries (the strategic reason to visit a rest node).
      const heal = (p: RosterPlayer): RosterPlayer =>
        p.gamesOut ? { ...p, gamesOut: 0 } : p;
      const roster = {
        starters: model.core.roster.starters.map(heal),
        bench: model.core.roster.bench.map(heal),
      };
      return {
        ...model,
        core: { ...model.core, rewards, roster },
        phase: { kind: 'map' },
      };
    }

    case 'skipNode':
    case 'backToMap':
      return { ...model, phase: { kind: 'map' } };

    case 'endRun':
      return { ...model, phase: { kind: 'summary', champion: false } };
  }
}
