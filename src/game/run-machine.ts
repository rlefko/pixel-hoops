import { createRNG, deriveSeed } from './rng';
import { generateFixedMap, traverseTo } from './run-map';
import {
  generateOpponentTeam,
  generateRecruitOffers,
  planForRoster,
} from './tournament';
import { buildTeam, validateLineup } from './lineup';
import { simulateGame } from './simulation';
import { homeToRunRoster, type HomeRoster } from './home-roster';
import { effectivePlayers, teamModifierFor } from './apply-effects';
import { MAX_TRAINED_STAT, trainedStat } from './effects';
import { legendRecruit } from './player-pool';
import {
  MAX_BOOSTS,
  drawBoostOffers,
  type BoostOffer,
  type PassiveBoost,
} from './boosts';
import { ITEM_BY_ID, rollDrop, rollBoostStock, type ItemDef } from './items';
import type { MapNode } from '@/types/run-map';
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
 *
 * A run is a sequence of TOTAL_MAPS short fixed-shape maps. A passive-boost draft
 * opens each map; clearing a map's boss opens the next map (and its draft), and
 * clearing the final boss wins the run.
 */

/** Maps in a run; each ends in a boss and opens with a passive-boost draft. */
export const TOTAL_MAPS = 7;
const RECRUIT_OFFER_COUNT = 3;
const REST_REPUTATION = 2;

// --- Training points (earned per win, banked all run, spent at Training nodes) ---
const TP_GAME = 1;
const TP_ELITE = 2;
const TP_BOSS = 4;

// --- Coin economy (spent only in the Locker Room between runs) ---
/** Round-1 standard-game floor. */
const COIN_BASE = 10;
/** Each deeper round adds this much to a win's payout. */
const COIN_PER_ROUND = 4;
/** Coins banked even on a loss, so no run is wasted. */
const LOSS_COINS = 10;
/** Cap on the blowout bonus. */
const DOMINANCE_CAP = 12;

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
  // A 1-of-3 passive-boost draft, opened once before each map. `forced` is set
  // when the boost list is full and a drop is required.
  | {
      kind: 'boostDraft';
      round: number;
      offers: BoostOffer[];
      pendingFull: boolean;
      forced?: BoostOffer;
    }
  // Boost node: grab one free item and assign it (the renamed, coin-free shop).
  | { kind: 'boost'; nodeId: string; stock: ItemDef[] }
  | { kind: 'itemDrop'; nodeId: string; drop: ItemDef; returnTo: RunPhase }
  | { kind: 'legendReveal'; nodeId: string; offer: RosterPlayer; fallback: RosterPlayer[] }
  | { kind: 'lineup'; returnTo: RunPhase }
  // The item bag: equip stored items onto players or unequip held ones back.
  | { kind: 'bag'; returnTo: RunPhase }
  | { kind: 'summary'; champion: boolean };

export interface RunModel {
  core: RunState;
  phase: RunPhase;
  gamePlan: GamePlan;
  wins: number;
  /** Equipped passive boosts (max 5). Lives here, not in RunState, so it never
   * leaks into the home roster at merge. */
  boosts: PassiveBoost[];
  /** Run-scoped item bag: defIds of unequipped items kept for later. Lives here,
   * not in RunState, so items are never lost mid-run and never persist home. */
  bag: string[];
  /** Legendary on-loan offer tracking (once per run + soft pity). */
  legend: { dryStreak: number; offeredThisRun: boolean };
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
  | { type: 'draftBoost'; offer: BoostOffer }
  | { type: 'dropBoostForNew'; dropIndex: number }
  | { type: 'skipBoostDraft' }
  | { type: 'takeBoostItem'; defId: string; playerIndex: number }
  | { type: 'leaveBoost' }
  | { type: 'takeDrop'; playerIndex: number }
  | { type: 'skipDrop' }
  | { type: 'addToBag'; defId: string }
  | { type: 'openBag' }
  | { type: 'leaveBag' }
  | { type: 'equipFromBag'; bagIndex: number; playerIndex: number }
  | { type: 'unequipToBag'; playerIndex: number }
  | { type: 'scoutLegend' }
  | { type: 'declineLegend' }
  | { type: 'skipNode' }
  | { type: 'backToMap' }
  | { type: 'endRun' };

/** Build a fresh run from a seed and the player's home roster. */
export function initRun(seed: string, homeRoster: HomeRoster): RunModel {
  const map = generateFixedMap({ seed: deriveSeed(seed, 'map-0'), mapIndex: 0 });
  const core: RunState = {
    map,
    currentMapIndex: 0,
    currentNodeId: null,
    roster: homeToRunRoster(homeRoster),
    seed,
    rewards: { coins: 0, reputation: 0, trainingPoints: 0 },
  };
  // The run opens on the Map-1 passive-boost draft (the "starter pick").
  const offers = drawBoostOffers(1, [], createRNG(deriveSeed(seed, 'boost-m0')));
  return {
    core,
    phase: { kind: 'boostDraft', round: 1, offers, pendingFull: false },
    gamePlan: DEFAULT_GAME_PLAN,
    wins: 0,
    boosts: [],
    bag: [],
    legend: { dryStreak: homeRoster.legendDryStreak ?? 0, offeredThisRun: false },
    game: null,
  };
}

// --- Coin payout ---

/** Coins for a win: round-scaled, node-type multiplied, plus a dominance bonus. */
function coinsForWin(node: MapNode, result: SimResult): number {
  const round = node.round ?? node.layer + 1;
  let coins = COIN_BASE + COIN_PER_ROUND * (round - 1);
  if (node.type === 'elite') coins *= 1.5;
  else if (node.type === 'boss') coins *= 2;
  const margin = result.finalHome - result.finalAway;
  coins += Math.min(DOMINANCE_CAP, Math.max(0, margin - 5) * 0.6);
  return Math.round(coins);
}

/** Training points a win awards, scaled by the opponent's difficulty. */
function trainingPointsFor(node: MapNode): number {
  if (node.type === 'boss') return TP_BOSS;
  if (node.type === 'elite') return TP_ELITE;
  return TP_GAME;
}

// --- Legendary recruit gate ---

/** Base per-recruit-node legendary chance, ramping by round. */
function recruitLegendChance(round: number): number {
  if (round <= 2) return 0;
  if (round <= 4) return 0.08;
  if (round === 5) return 0.12;
  return 0.15;
}

/** Legendary chance with soft pity: +5%/run after five dry runs. */
function legendGateChance(round: number, dryStreak: number): number {
  return recruitLegendChance(round) + Math.max(0, dryStreak - 5) * 0.05;
}

/** Apply a per-player transform across the combined roster, re-split at five. */
function mapRoster(
  roster: RunState['roster'],
  fn: (p: RosterPlayer, index: number) => RosterPlayer
): RunState['roster'] {
  const all = [...roster.starters, ...roster.bench].map(fn);
  return { starters: all.slice(0, 5), bench: all.slice(5) };
}

/** Replace one player by combined index (starters then bench). */
function withReplacedPlayer(
  roster: RunState['roster'],
  index: number,
  next: RosterPlayer
): RunState['roster'] {
  return mapRoster(roster, (p, i) => (i === index ? next : p));
}

/** Equip an item to the player at `index` (combined order). */
function withEquippedItem(
  roster: RunState['roster'],
  index: number,
  defId: string
): RunState['roster'] {
  return mapRoster(roster, (p, i) => (i === index ? { ...p, item: { defId } } : p));
}

/** Remove the item from the player at `index` (combined order). */
function withUnequippedItem(roster: RunState['roster'], index: number): RunState['roster'] {
  return mapRoster(roster, (p, i) => {
    if (i !== index || !p.item) return p;
    const next = { ...p };
    delete next.item;
    return next;
  });
}

/**
 * Equip `defId` onto the player at `index`, moving any item they already hold
 * into the bag so gear is never lost. Returns null when the index is invalid.
 */
function equipWithBagSwap(
  roster: RunState['roster'],
  bag: string[],
  index: number,
  defId: string
): { roster: RunState['roster']; bag: string[] } | null {
  const all = [...roster.starters, ...roster.bench];
  const target = all[index];
  if (!target) return null;
  const nextBag = target.item ? [...bag, target.item.defId] : bag;
  return { roster: withEquippedItem(roster, index, defId), bag: nextBag };
}

/**
 * The five (plus bench) that actually dress for a game: healthy players first,
 * injured players backfilled only if there are fewer than five healthy, so a run
 * can never be bricked by injuries. With a deep, healthy roster the player's
 * chosen order is preserved.
 */
export function dressedRoster(roster: RunState['roster']): RunState['roster'] {
  const all = [...roster.starters, ...roster.bench];
  const healthy = all.filter((p) => !(p.gamesOut && p.gamesOut > 0));
  if (healthy.length >= 5) {
    return { starters: healthy.slice(0, 5), bench: healthy.slice(5) };
  }
  const injured = all
    .filter((p) => p.gamesOut && p.gamesOut > 0)
    .sort((a, b) => (a.gamesOut ?? 0) - (b.gamesOut ?? 0));
  const ordered = [...healthy, ...injured];
  return { starters: ordered.slice(0, 5), bench: ordered.slice(5) };
}

/**
 * The healthy players who start in place of injured starters this game: the dressed
 * five minus the player's chosen starters. Empty when nobody is hurt. The pregame
 * board names these subs so an injured starter is shown as OUT in their slot rather
 * than silently swapped out of the five.
 */
export function steppingInSubs(roster: RunState['roster']): RosterPlayer[] {
  // Identity by object reference, not name: real rosters can carry duplicate
  // player names, and a name-based check would wrongly treat a same-named bench
  // call-up as already starting (returning no sub for an injured starter).
  const chosen = new Set<RosterPlayer>(roster.starters);
  return dressedRoster(roster).starters.filter((p) => !chosen.has(p));
}

/**
 * The player's effective home Team for a game: the dressed five plus bench, with
 * items, legend self-auras, and passive boosts baked in. Shared by the pregame
 * preview and the game sim so both read the exact same lineup.
 */
export function buildHomeTeam(model: RunModel): Team {
  const dressed = dressedRoster(model.core.roster);
  return buildTeam(
    'Your Squad',
    effectivePlayers(dressed.starters),
    model.gamePlan,
    palette.homeTeam,
    palette.homeTeamAccent,
    effectivePlayers(dressed.bench),
    teamModifierFor(dressed.starters, model.boosts)
  );
}

/**
 * The deterministic opponent Team for a combat node. Round and boss status are
 * derived from the node here so the pregame scouting preview and the simulated
 * game always build the identical five from the same seed (see the determinism
 * note on generateOpponentTeam).
 */
export function buildOpponentTeam(core: RunState, nodeId: string): Team {
  const node = core.map.nodes[nodeId];
  const round = node.round ?? node.layer + 1;
  const isBoss = node.type === 'boss' || nodeId === core.map.bossNodeId;
  const opp = generateOpponentTeam(
    round,
    createRNG(deriveSeed(core.seed, `opp-${nodeId}`)),
    { isBoss }
  );
  return buildTeam(
    opp.name,
    effectivePlayers(opp.roster.starters),
    planForRoster(opp.roster),
    opp.colorHex,
    opp.accentHex,
    effectivePlayers(opp.roster.bench),
    teamModifierFor(opp.roster.starters, [])
  );
}

/**
 * After a game, recover everyone one game (decrement gamesOut) and roll fresh
 * injuries for the players who dressed. Risk rises with accumulated load and
 * falls with durability. Deterministic from the game's derived seed.
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
  return mapRoster(core.roster, update);
}

/**
 * Resolve a chosen node into its phase. Combat opens pregame; recruit nodes can
 * roll a rare on-loan legendary (else procedural offers); boost nodes roll a free
 * item stock. Shared by chooseNode and the post-draft continuation.
 */
function enterNode(model: RunModel, nodeId: string): RunModel {
  const core = traverseTo(model.core, nodeId);
  const node = core.map.nodes[nodeId];
  const round = node.round ?? node.layer + 1;
  switch (node.type) {
    case 'game':
    case 'elite':
    case 'boss':
      return { ...model, core, phase: { kind: 'pregame', nodeId } };
    case 'recruit': {
      // Don't offer a free agent the squad already owns.
      const owned = new Set(
        [...core.roster.starters, ...core.roster.bench].map((p) => p.player.name)
      );
      const fallback = generateRecruitOffers(
        round,
        RECRUIT_OFFER_COUNT,
        createRNG(deriveSeed(core.seed, `recruit-${nodeId}`)),
        owned
      );
      const gateRng = createRNG(deriveSeed(core.seed, `legend-${nodeId}`));
      if (
        !model.legend.offeredThisRun &&
        gateRng.chance(legendGateChance(round, model.legend.dryStreak))
      ) {
        return {
          ...model,
          core,
          legend: { ...model.legend, offeredThisRun: true },
          phase: { kind: 'legendReveal', nodeId, offer: legendRecruit(gateRng), fallback },
        };
      }
      return { ...model, core, phase: { kind: 'recruit', nodeId, offers: fallback } };
    }
    case 'training':
      return { ...model, core, phase: { kind: 'training', nodeId } };
    case 'rest':
      return { ...model, core, phase: { kind: 'rest', nodeId } };
    case 'boost': {
      const stock = rollBoostStock(round, createRNG(deriveSeed(core.seed, `boost-${nodeId}`)));
      return { ...model, core, phase: { kind: 'boost', nodeId, stock } };
    }
    default:
      return { ...model, core, phase: { kind: 'map' } };
  }
}

/** After a boost draft resolves, show the freshly-opened map. */
function afterBoostDraft(model: RunModel): RunModel {
  return { ...model, phase: { kind: 'map' } };
}

/** Clear a boss: build the next map, reset position, and open its boost draft. */
function advanceToNextMap(model: RunModel): RunModel {
  const nextIndex = model.core.currentMapIndex + 1;
  const map = generateFixedMap({
    seed: deriveSeed(model.core.seed, `map-${nextIndex}`),
    mapIndex: nextIndex,
  });
  const core = { ...model.core, map, currentMapIndex: nextIndex, currentNodeId: null };
  const round = nextIndex + 1;
  const offers = drawBoostOffers(
    round,
    model.boosts,
    createRNG(deriveSeed(model.core.seed, `boost-m${nextIndex}`))
  );
  return {
    ...model,
    core,
    game: null,
    phase: { kind: 'boostDraft', round, offers, pendingFull: false },
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
      const node = model.core.map.nodes[action.nodeId];
      if (!node) return model;
      return enterNode(model, action.nodeId);
    }

    case 'setGamePlan':
      return { ...model, gamePlan: action.plan };

    case 'openLineupBuilder':
      return { ...model, phase: { kind: 'lineup', returnTo: model.phase } };

    case 'setLineup': {
      if (model.phase.kind !== 'lineup') return model;
      if (!validateLineup(action.starters).ok) return model;
      const roster = { starters: action.starters, bench: action.bench };
      return { ...model, core: { ...model.core, roster }, phase: model.phase.returnTo };
    }

    case 'cancelLineup':
      return model.phase.kind === 'lineup'
        ? { ...model, phase: model.phase.returnTo }
        : model;

    case 'enterGame': {
      if (model.phase.kind !== 'pregame') return model;
      const nodeId = model.phase.nodeId;
      const home = buildHomeTeam(model);
      const away = buildOpponentTeam(model.core, nodeId);
      const result = simulateGame({
        home,
        away,
        seed: deriveSeed(model.core.seed, `game-${nodeId}`),
      });
      return {
        ...model,
        phase: { kind: 'game', nodeId },
        game: { opponentName: away.name, result, home, away },
      };
    }

    case 'finishReplay': {
      if (model.phase.kind !== 'game' || !model.game) return model;
      const won = model.game.result.winner === 'home';
      return { ...model, phase: { kind: 'postgame', nodeId: model.phase.nodeId, won } };
    }

    case 'resolveGameResult': {
      if (model.phase.kind !== 'postgame') return model;
      const { won, nodeId } = model.phase;
      if (!won) {
        // Coins are kept even on a loss, so the run is never wasted.
        const rewards = { ...model.core.rewards, coins: model.core.rewards.coins + LOSS_COINS };
        return { ...model, core: { ...model.core, rewards }, phase: { kind: 'summary', champion: false } };
      }
      const node = model.core.map.nodes[nodeId];
      const isBoss = node.type === 'boss' || nodeId === model.core.map.bossNodeId;
      const coins = model.game ? coinsForWin(node, model.game.result) : COIN_BASE;
      const rewards = {
        ...model.core.rewards,
        coins: model.core.rewards.coins + coins,
        reputation: model.core.rewards.reputation + node.layer + 1,
        trainingPoints: model.core.rewards.trainingPoints + trainingPointsFor(node),
      };
      const roster = model.game
        ? applyInjuries(model.core, model.game.result.box.home, nodeId)
        : model.core.roster;
      const core = { ...model.core, rewards, roster };
      const wins = model.wins + 1;
      if (isBoss) {
        // The final map's boss wins the run; earlier bosses open the next map.
        if (core.currentMapIndex >= TOTAL_MAPS - 1) {
          return { ...model, core, wins, phase: { kind: 'summary', champion: true } };
        }
        const advanced = advanceToNextMap({ ...model, core, wins });
        const drop = rollDrop(
          'boss',
          node.round ?? node.layer + 1,
          createRNG(deriveSeed(model.core.seed, `drop-${nodeId}`))
        );
        // Grab the boss relic first, then fall through to the next map's draft.
        return drop
          ? { ...advanced, phase: { kind: 'itemDrop', nodeId, drop, returnTo: advanced.phase } }
          : advanced;
      }
      // Elite wins drop a piece of gear before returning to the map.
      if (node.type === 'elite') {
        const drop = rollDrop(
          'elite',
          node.round ?? node.layer + 1,
          createRNG(deriveSeed(model.core.seed, `drop-${nodeId}`))
        );
        if (drop) {
          return {
            ...model,
            core,
            wins,
            game: null,
            phase: { kind: 'itemDrop', nodeId, drop, returnTo: { kind: 'map' } },
          };
        }
      }
      return { ...model, core, wins, phase: { kind: 'map' }, game: null };
    }

    case 'recruit': {
      if (model.phase.kind !== 'recruit') return model;
      const roster = {
        ...model.core.roster,
        bench: [...model.core.roster.bench, action.player],
      };
      return { ...model, core: { ...model.core, roster }, phase: { kind: 'map' } };
    }

    case 'trainPlayer': {
      if (model.phase.kind !== 'training') return model;
      if (model.core.rewards.trainingPoints <= 0) return model;
      const all = [...model.core.roster.starters, ...model.core.roster.bench];
      const target = all[action.index];
      if (!target) return model;
      if (trainedStat(target, action.stat) >= MAX_TRAINED_STAT) return model; // already maxed
      const next: RosterPlayer = {
        ...target,
        trainingDelta: {
          ...target.trainingDelta,
          [action.stat]: (target.trainingDelta?.[action.stat] ?? 0) + 1,
        },
      };
      const roster = withReplacedPlayer(model.core.roster, action.index, next);
      const rewards = {
        ...model.core.rewards,
        trainingPoints: model.core.rewards.trainingPoints - 1,
      };
      // Stay on the Training node so banked points can be spent in one visit.
      return { ...model, core: { ...model.core, roster, rewards } };
    }

    case 'rest': {
      if (model.phase.kind !== 'rest') return model;
      const rewards = {
        ...model.core.rewards,
        reputation: model.core.rewards.reputation + REST_REPUTATION,
      };
      const roster = mapRoster(model.core.roster, (p) =>
        p.gamesOut ? { ...p, gamesOut: 0 } : p
      );
      return { ...model, core: { ...model.core, rewards, roster }, phase: { kind: 'map' } };
    }

    case 'draftBoost': {
      if (model.phase.kind !== 'boostDraft') return model;
      const phase = model.phase;
      const offer = action.offer;
      if (offer.kind === 'tierUp') {
        const boosts = model.boosts.map((b) =>
          b.id === offer.id ? { ...b, tier: offer.toTier } : b
        );
        return afterBoostDraft({ ...model, boosts });
      }
      if (model.boosts.length < MAX_BOOSTS) {
        const boosts = [...model.boosts, { id: offer.defId, tier: 1 }];
        return afterBoostDraft({ ...model, boosts });
      }
      // Full: ask the player which boost to drop for the new one.
      return { ...model, phase: { ...phase, pendingFull: true, forced: offer } };
    }

    case 'dropBoostForNew': {
      if (model.phase.kind !== 'boostDraft') return model;
      const forced = model.phase.forced;
      if (!forced || forced.kind !== 'new') return model;
      // Lossy: the dropped boost is gone (no refund), the new one takes its slot.
      const boosts = model.boosts.filter((_, i) => i !== action.dropIndex);
      boosts.push({ id: forced.defId, tier: 1 });
      return afterBoostDraft({ ...model, boosts });
    }

    case 'skipBoostDraft': {
      // Skipping (in the draft or the full-slots drop screen) takes nothing and
      // returns to the map. Coins are earned only by winning games.
      if (model.phase.kind !== 'boostDraft') return model;
      return afterBoostDraft(model);
    }

    case 'takeBoostItem': {
      if (model.phase.kind !== 'boost') return model;
      const def = ITEM_BY_ID[action.defId];
      if (!def) return model;
      const res = equipWithBagSwap(model.core.roster, model.bag, action.playerIndex, def.id);
      if (!res) return model;
      return {
        ...model,
        core: { ...model.core, roster: res.roster },
        bag: res.bag,
        phase: { kind: 'map' },
      };
    }

    case 'leaveBoost':
      return model.phase.kind === 'boost' ? { ...model, phase: { kind: 'map' } } : model;

    case 'takeDrop': {
      if (model.phase.kind !== 'itemDrop') return model;
      const { drop, returnTo } = model.phase;
      const res = equipWithBagSwap(model.core.roster, model.bag, action.playerIndex, drop.id);
      if (!res) return model;
      return { ...model, core: { ...model.core, roster: res.roster }, bag: res.bag, phase: returnTo };
    }

    case 'skipDrop':
      return model.phase.kind === 'itemDrop' ? { ...model, phase: model.phase.returnTo } : model;

    case 'addToBag': {
      // "Keep in bag" from a Boost node or a gear drop: store it, do not equip.
      if (!ITEM_BY_ID[action.defId]) return model;
      const bag = [...model.bag, action.defId];
      if (model.phase.kind === 'boost') return { ...model, bag, phase: { kind: 'map' } };
      if (model.phase.kind === 'itemDrop') return { ...model, bag, phase: model.phase.returnTo };
      return { ...model, bag };
    }

    case 'openBag':
      return model.phase.kind === 'bag'
        ? model
        : { ...model, phase: { kind: 'bag', returnTo: model.phase } };

    case 'leaveBag':
      return model.phase.kind === 'bag' ? { ...model, phase: model.phase.returnTo } : model;

    case 'equipFromBag': {
      if (model.phase.kind !== 'bag') return model;
      const defId = model.bag[action.bagIndex];
      if (!defId) return model;
      // Take the chosen item out of the bag first; any displaced item returns to it.
      const baseBag = model.bag.filter((_, i) => i !== action.bagIndex);
      const res = equipWithBagSwap(model.core.roster, baseBag, action.playerIndex, defId);
      if (!res) return model;
      return { ...model, core: { ...model.core, roster: res.roster }, bag: res.bag };
    }

    case 'unequipToBag': {
      if (model.phase.kind !== 'bag') return model;
      const all = [...model.core.roster.starters, ...model.core.roster.bench];
      const target = all[action.playerIndex];
      if (!target?.item) return model;
      const bag = [...model.bag, target.item.defId];
      const roster = withUnequippedItem(model.core.roster, action.playerIndex);
      return { ...model, core: { ...model.core, roster }, bag };
    }

    case 'scoutLegend': {
      if (model.phase.kind !== 'legendReveal') return model;
      const roster = {
        ...model.core.roster,
        bench: [...model.core.roster.bench, model.phase.offer],
      };
      return { ...model, core: { ...model.core, roster }, phase: { kind: 'map' } };
    }

    case 'declineLegend': {
      if (model.phase.kind !== 'legendReveal') return model;
      // Passing on the legend still leaves the node's procedural recruit offers.
      return {
        ...model,
        phase: { kind: 'recruit', nodeId: model.phase.nodeId, offers: model.phase.fallback },
      };
    }

    case 'skipNode':
    case 'backToMap':
      return { ...model, phase: { kind: 'map' } };

    case 'endRun':
      return { ...model, phase: { kind: 'summary', champion: false } };
  }
}
