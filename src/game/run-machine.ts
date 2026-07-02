import { createRNG, deriveSeed, type RNG } from './rng';
import { generateFixedMap, traverseTo } from './run-map';
import {
  generateOpponentTeam,
  generateRecruitOffers,
  pickSpecialistOfClass,
  planForRoster,
} from './tournament';
import { isSpecialist } from './specialty';
import { buildTeam, validateLineup } from './lineup';
import { simulateGame } from './simulation';
import { ownedRosterPlayers, resolveDraftRotation, type HomeRoster } from './home-roster';
import {
  difficultyMods,
  globalHighestCleared,
  LADDER_CLASSES,
  type Difficulty,
  type DifficultyMods,
  type LadderClass,
} from './difficulty-mode';
import { classLevel } from './classes';
import {
  canConfirmLoadout,
  defaultLoadout,
  MAX_RUN_ROSTER,
} from './draft';
import { effectivePlayers, teamModifierFor } from './apply-effects';
import {
  MAX_TRAINED_STAT,
  trainedStat,
  mergeTeamModifiers,
  teamModifierFromPartial,
  type RunCounters,
} from './effects';
import {
  getCoach,
  planForCoach,
  rotationForCoach,
  coachSystemModifier,
  type CoachProfile,
} from './coaches';
import { coachForTeamName } from './opponent-coach';
import { recommendLineup, reorderForCoach, recMinDelta, type CoachRec } from './coach-reco';
import { legendRecruitFavored } from './player-pool';
import { FAVOR_CHAMPION_BONUS, FAVOR_WIN_POINTS, addFavor } from './favor';
import {
  MAX_BOOSTS,
  BOOST_BY_ID,
  BOOST_DEFS,
  drawBoostOffers,
  type BoostOffer,
  type PassiveBoost,
} from './boosts';
import { pityRarityOffset, PITY_MAX } from './rarity';
import { ITEM_BY_ID, rollDrop, rollBoostStock, type ItemDef } from './items';
import type { MapNode, MapNodeType } from '@/types/run-map';
import type { RunState } from '@/types/run-map';
import { nameKey, type RosterPlayer } from '@/types/roster';
import type { BoxLine, SimResult } from '@/types/sim';
import type { Team } from '@/types/team';
import type { PlayerStats } from '@/types/player';
// Import the palette module directly (not the @/theme barrel, which pulls in
// font `require`s) so this pure reducer stays Node/Vitest-safe.
import { palette } from '@/theme/palette';

/**
 * The roguelike run state machine: pure types, an initializer, and a reducer.
 * No React, no storage, no theme barrel, so it unit-tests headless. The hook
 * (src/hooks/useRun.ts) wraps this with state + persistence side effects.
 *
 * A run is a sequence of TOTAL_MAPS short fixed-shape maps on a chosen
 * (difficulty x ladder class). It opens with a points DRAFT from the owned
 * collection; a passive-boost draft opens each map; clearing a map's boss opens
 * the next map, and clearing the final boss wins the run (advancing the ladder).
 */

/** Maps in a run; each ends in a boss and opens with a passive-boost draft. */
export const TOTAL_MAPS = 7;
const RECRUIT_OFFER_COUNT = 3;
/** Recruit nodes without any specialist offered before pity forces one in, so a
 * player chasing a rim protector / glass cleaner is never shut out for long. */
const RECRUIT_PITY_THRESHOLD = 3;
const REST_REPUTATION = 2;

// --- Training points (earned per win, banked all run, spent at Training nodes) ---
const TP_GAME = 1;
const TP_ELITE = 2;
const TP_BOSS = 4;

// --- Coin economy (spent only in the Locker Room / Arcade between runs) ---
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
/** Game load that maps to "full minutes" (load / this ~ 1 for a full game). The
 * cap on games sidelined comes from the difficulty (src/game/difficulty-mode.ts). */
const INJURY_LOAD_NORM = 90;

export type RunPhase =
  | { kind: 'map' }
  // Draft a position-slot loadout (5 starters + up to 3 bench) from the owned
  // collection under the difficulty's point budget, paying by each player's class
  // relative to the ladder. Defaults to the previous run's lineup.
  | {
      kind: 'draft';
      available: RosterPlayer[];
      defaultStarters: RosterPlayer[];
      defaultBench: RosterPlayer[];
    }
  // `timeoutUsed` is set when this pregame was re-entered after a forgiven loss, so
  // the pregame scouting screen can flag the spent timeout and that this is a replay.
  // `coachRec` is the equipped coach's optional one-click lineup suggestion for this
  // matchup. Sentinel semantics keep the async compute (see computeCoachRec) honest:
  // `undefined` = not computed yet (useRun schedules the search off the tap), `null` =
  // resolved with nothing to show (below the bar, accepted, edited, or a replay).
  | { kind: 'pregame'; nodeId: string; timeoutUsed?: boolean; coachRec?: CoachRec | null }
  | { kind: 'game'; nodeId: string }
  | { kind: 'postgame'; nodeId: string; won: boolean }
  | { kind: 'recruit'; nodeId: string; offers: RosterPlayer[]; rerolled: boolean[] }
  // Recruiting past the 12-man run cap: pick a player to drop for the incoming one.
  // `returnTo` is where the drop resolves to (a boss signing must land back on the
  // next map's boost draft, not the map); absent = the map, as before.
  | { kind: 'dropForRecruit'; nodeId: string; incoming: RosterPlayer; returnTo?: RunPhase }
  | { kind: 'training'; nodeId: string }
  | { kind: 'rest'; nodeId: string }
  // A 1-of-N passive-boost draft, opened once before each map. `forced` is set
  // when the boost list is full and a drop is required.
  | {
      kind: 'boostDraft';
      round: number;
      offers: BoostOffer[];
      pendingFull: boolean;
      forced?: BoostOffer;
      /** Seed label this node's offers were drawn from, so a banish replacement
       * derives a fresh deterministic offer (`<drawLabel>-banish-<n>`). */
      drawLabel: string;
    }
  // Boost node: grab one free item and assign it (the renamed, coin-free shop).
  | { kind: 'boost'; nodeId: string; stock: ItemDef[] }
  | { kind: 'itemDrop'; nodeId: string; drop: ItemDef; returnTo: RunPhase }
  | { kind: 'legendReveal'; nodeId: string; offer: RosterPlayer; fallback: RosterPlayer[] }
  // Boss Legend Signing (hard/insane, S/S+ ladders): after a boss win, the beaten
  // franchise's legend offers to join on-loan. Chained after the boss item drop;
  // `returnTo` is the next map's boost draft.
  | { kind: 'legendSign'; nodeId: string; offer: RosterPlayer; returnTo: RunPhase }
  | { kind: 'lineup'; returnTo: RunPhase }
  // The item bag: equip stored items onto players or unequip held ones back.
  | { kind: 'bag'; returnTo: RunPhase }
  | { kind: 'summary'; champion: boolean };

export interface RunModel {
  core: RunState;
  phase: RunPhase;
  wins: number;
  /** The difficulty this run is played at (sets draft points + opponent modifiers). */
  difficulty: Difficulty;
  /** The ladder class this run centers on; clearing it advances that difficulty's ladder. */
  ladderClass: LadderClass;
  /** The coach equipped for this run (read from HomeRoster at initRun; never mutated
   * mid-run, so it is the run's strategic identity). */
  coachId: string;
  /** Cached difficulty modifiers, applied at consumption time. */
  mods: DifficultyMods;
  /** Whether this run is at the player's ladder frontier, so a championship unlocks
   * the next class (drives the run-summary reward beat). */
  atFrontier: boolean;
  /** Equipped passive boosts (max 5). Lives here, not in RunState, so it never
   * leaks into the home roster at merge. */
  boosts: PassiveBoost[];
  /** Run-scoped item bag: defIds of unequipped items kept for later. */
  bag: string[];
  /** Legendary on-loan offer tracking (once per run + soft pity). Shared by the
   * recruit-node legend gate AND the boss-signing gate, so a run never sees two
   * legend offers across the two channels. */
  legend: { dryStreak: number; offeredThisRun: boolean };
  /** Owned S+ player keys snapshotted at initRun, so a boss signing never offers a
   * legend already in the collection. Optional: old suspended runs default to []. */
  ownedLegendKeys?: string[];
  /** Base favor points accrued this run, per playerKey of every player who logged
   * minutes in a WON game (losses earn nothing). Settled into the home ledger at run
   * end for the un-owned only (see home-roster settleFavor); bounded by the 12-man
   * roster. Optional: old suspended runs default to {}. */
  favor?: Record<string, number>;
  /** The home favor ledger snapshotted at initRun. Biases WHICH un-owned legend the
   * once-per-run reveal offers and weights favored players up in recruit offers (the
   * re-offer reunion). Small (un-owned players with favor only) and read-only for the
   * whole run. Optional: old suspended runs default to {}. */
  homeFavor?: Record<string, number>;
  /** Recruit nodes in a row without a specialist offered; pity forces one in once
   * it reaches RECRUIT_PITY_THRESHOLD so a specialist build is always reachable. */
  recruitDryStreak: number;
  /** Forgiven losses ("timeouts") left in the run-wide pool. While > 0, a lost game
   * is replayed instead of ending the run (seeded by difficulty's secondChances). */
  secondChancesRemaining: number;
  /** Count of timeouts spent so far, used to vary the replay seed so a retry of the
   * same node is a fresh roll rather than a deterministic repeat of the loss. */
  forgivenLosses: number;
  /** Boost def ids banished from this run's draft pool (hard-capped, run-scoped). */
  banishedBoosts: string[];
  /** Consecutive boost-draft nodes that came up with no epic+ offer. Biases the next
   * draw toward epic+ (run-scoped pity, capped at PITY_MAX). Separate from the
   * persistent legendary-PLAYER pity in legend.dryStreak. */
  boostPity: number;
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
  // Resume a suspended run by loading its saved model wholesale (see useRun).
  | { type: 'loadRun'; model: RunModel }
  | { type: 'confirmDraft'; starters: RosterPlayer[]; bench: RosterPlayer[] }
  | { type: 'chooseNode'; nodeId: string }
  | { type: 'openLineupBuilder' }
  | { type: 'setLineup'; starters: RosterPlayer[]; bench: RosterPlayer[] }
  | { type: 'cancelLineup' }
  | { type: 'acceptCoachRec' }
  // Lands the asynchronously computed coach suggestion on its pregame (see
  // computeCoachRec); `rec: null` records "nothing worth surfacing" so it computes once.
  | { type: 'setCoachRec'; nodeId: string; rec: CoachRec | null }
  | { type: 'enterGame' }
  | { type: 'finishReplay' }
  | { type: 'resolveGameResult' }
  | { type: 'recruit'; player: RosterPlayer }
  | { type: 'rerollRecruit'; index: number }
  | { type: 'dropForRecruit'; index: number }
  | { type: 'trainPlayer'; index: number; stat: keyof PlayerStats }
  | { type: 'rest' }
  | { type: 'draftBoost'; offer: BoostOffer }
  | { type: 'dropBoostForNew'; dropIndex: number }
  | { type: 'skipBoostDraft' }
  | { type: 'banishBoost'; offer: BoostOffer }
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
  | { type: 'acceptLegendSign' }
  | { type: 'declineLegendSign' }
  | { type: 'skipNode' }
  | { type: 'backToMap' };

/** Whether a championship here would raise the GLOBAL highest-cleared class and so
 * unlock a new ladder class (a class cleared on any difficulty is selectable on all
 * of them). Drives the summary "ladder unlocked" beat and the loss nudge. */
function isFrontierRun(home: HomeRoster, ladderClass: LadderClass): boolean {
  const best = globalHighestCleared(home.clearedCells ?? []);
  return best == null || LADDER_CLASSES.indexOf(ladderClass) > LADDER_CLASSES.indexOf(best);
}

/** Build a fresh run from a seed and the player's home roster. */
export function initRun(seed: string, homeRoster: HomeRoster): RunModel {
  const difficulty = homeRoster.selectedDifficulty ?? 'easy';
  const ladderClass = homeRoster.selectedLadderClass ?? 'C';
  const coachId = getCoach(homeRoster.selectedCoachId).id;
  const mods = difficultyMods(difficulty);
  const map = generateFixedMap({
    seed: deriveSeed(seed, 'map-0'),
    mapIndex: 0,
    difficulty,
    ladderLevel: classLevel(ladderClass),
  });
  const available = ownedRosterPlayers(homeRoster);
  const { starters: defaultStarters, bench: defaultBench } = defaultLoadout(
    available,
    ladderClass,
    difficulty,
    resolveDraftRotation(homeRoster, difficulty, ladderClass)
  );
  const core: RunState = {
    map,
    currentMapIndex: 0,
    currentNodeId: null,
    // The run roster is empty until the draft confirms a rotation.
    roster: { starters: [], bench: [] },
    seed,
    rewards: { coins: 0, reputation: 0, trainingPoints: 0 },
  };
  return {
    core,
    phase: { kind: 'draft', available, defaultStarters, defaultBench },
    wins: 0,
    difficulty,
    ladderClass,
    coachId,
    mods,
    atFrontier: isFrontierRun(homeRoster, ladderClass),
    boosts: [],
    bag: [],
    legend: { dryStreak: homeRoster.legendDryStreak ?? 0, offeredThisRun: false },
    ownedLegendKeys: homeRoster.players
      .filter((p) => (p.legendary ?? false) || p.originalClass === 'S+')
      .map((p) => nameKey(p.player.name, p.position)),
    favor: {},
    homeFavor: { ...homeRoster.favor },
    recruitDryStreak: 0,
    secondChancesRemaining: mods.secondChances,
    forgivenLosses: 0,
    banishedBoosts: [],
    boostPity: 0,
    game: null,
  };
}

/** Run-scoped banish cap: one per map across a 7-map run is generous but bounded,
 * so the pool can never be narrowed into a guaranteed build. */
export const MAX_BANISHES = 6;

// --- Coin payout ---

/** Coins for a win: round-scaled, node-type multiplied, plus a dominance bonus.
 * A harder difficulty pays proportionally more per win (mods.coinMul), with the big
 * difficulty premium reserved for mods.clearBonus on a championship, so the payout
 * rewards finishing brutal runs rather than farming their gentle early maps. */
function coinsForWin(node: MapNode, result: SimResult, mods: DifficultyMods): number {
  const round = node.round ?? node.layer + 1;
  let coins = COIN_BASE + COIN_PER_ROUND * (round - 1);
  if (node.type === 'elite') coins *= 1.5;
  else if (node.type === 'boss') coins *= 2;
  const margin = result.finalHome - result.finalAway;
  coins += Math.min(DOMINANCE_CAP, Math.max(0, margin - 5) * 0.6);
  return Math.round(coins * mods.coinMul);
}

/** Training points a win awards: node-type scaled, with the difficulty's bonus on
 * elite and boss wins (routine games stay flat everywhere, so harder runs train
 * denser without training longer). Training is the only channel into the S++ apex,
 * which the hard/insane finale actually demands. */
function trainingPointsFor(node: MapNode, mods: DifficultyMods): number {
  if (node.type === 'boss') return TP_BOSS + mods.trainingBonus.boss;
  if (node.type === 'elite') return TP_ELITE + mods.trainingBonus.elite;
  return TP_GAME;
}

/** What the postgame win on screen will bank when the player continues, computed
 * from the same payout functions resolveGameResult uses, so the tally the UI
 * celebrates is exactly the amount that lands. Null off the winning postgame. */
export function pendingWinRewards(
  model: RunModel
): { coins: number; trainingPoints: number; reputation: number; nodeType: MapNodeType } | null {
  if (model.phase.kind !== 'postgame' || !model.phase.won || !model.game) return null;
  const node = model.core.map.nodes[model.phase.nodeId];
  if (!node) return null;
  return {
    coins: coinsForWin(node, model.game.result, model.mods),
    trainingPoints: trainingPointsFor(node, model.mods),
    reputation: Math.round((node.layer + 1) * model.mods.repMul),
    nodeType: node.type,
  };
}

// --- Legendary recruit gate (S / S+ ladders only) ---

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

/**
 * Recruit pity. If the rolled offers already contain a play-style specialist, the
 * streak resets. Otherwise it bumps; once it reaches RECRUIT_PITY_THRESHOLD a real
 * specialist replaces the last slot (and the streak resets), so a player chasing a
 * rim protector / glass cleaner is never shut out for long. Deterministic.
 */
function applyRecruitPity(
  rolled: RosterPlayer[],
  dryStreak: number,
  owned: Set<string>,
  ladderClass: LadderClass,
  rng: RNG
): { offers: RosterPlayer[]; recruitDryStreak: number } {
  if (rolled.some(isSpecialist)) return { offers: rolled, recruitDryStreak: 0 };
  const next = dryStreak + 1;
  if (next < RECRUIT_PITY_THRESHOLD) return { offers: rolled, recruitDryStreak: next };
  const taken = new Set([...owned, ...rolled.map((o) => o.player.name)]);
  const forced = pickSpecialistOfClass(ladderClass, taken, rng);
  if (!forced) return { offers: rolled, recruitDryStreak: next }; // none left; keep trying
  return { offers: [...rolled.slice(0, -1), forced], recruitDryStreak: 0 };
}

/** playerKeys of roster players who logged minutes in the just-simmed game. Favor
 * accrues to players who actually took the floor in a WIN, never benched spectators
 * (a parked recruit earning passive trust would gut the field-them-or-not tradeoff).
 * No box (defensive) = no favor. */
function fieldedFavorKeys(roster: RunState['roster'], box: BoxLine[] | undefined): string[] {
  if (!box) return [];
  const played = new Set(box.filter((line) => line.seconds > 0).map((line) => line.name));
  return [...roster.starters, ...roster.bench]
    .filter((p) => played.has(p.player.name))
    .map((p) => nameKey(p.player.name, p.position));
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

/** The combined run-roster size (starters + bench). */
function rosterSize(roster: RunState['roster']): number {
  return roster.starters.length + roster.bench.length;
}

/**
 * The five (plus bench) that actually dress for a game: healthy players first,
 * injured players backfilled only if there are fewer than five healthy, so a run
 * can never be bricked by injuries.
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
 * five minus the player's chosen starters. Empty when nobody is hurt.
 */
export function steppingInSubs(roster: RunState['roster']): RosterPlayer[] {
  const chosen = new Set<RosterPlayer>(roster.starters);
  return dressedRoster(roster).starters.filter((p) => !chosen.has(p));
}

/**
 * The player's effective home Team for a given run roster + equipped coach: the
 * dressed five plus bench with items, abilities, and passive boosts baked in, the
 * coach's preferred game plan applied, and the coach's conditional system bonus merged
 * in when the five fits its style. Pure (no RunModel), so the coach recommendation
 * engine scores candidate rosters through the exact same path the sim will use.
 */
export function buildCoachedHomeTeam(
  roster: RunState['roster'],
  coach: CoachProfile,
  boosts: PassiveBoost[],
  counters?: RunCounters
): Team {
  const dressed = dressedRoster(roster);
  const effStarters = effectivePlayers(dressed.starters);
  const plan = planForCoach(planForRoster(dressed), coach, dressed);
  // teamModifierFor folds in passive boosts, abilities, item hooks, snowball scaling,
  // and set/duo synergies (the last three only when counters are present, i.e. the
  // player path); the coach's conditional system bonus then merges cleanly on top.
  const modifier = mergeTeamModifiers([
    teamModifierFor(dressed.starters, boosts, counters),
    teamModifierFromPartial(coachSystemModifier(effStarters, plan, coach)),
  ]);
  return buildTeam(
    'Your Squad',
    effStarters,
    plan,
    palette.homeTeam,
    palette.homeTeamAccent,
    effectivePlayers(dressed.bench),
    modifier
  );
}

/**
 * The player's effective home Team for a game. Shared by the pregame preview and the
 * game sim so both read the exact same lineup, plan, and coach effects. Run counters
 * (snowball stacks, sets) are captured here at build time, so the sim stays a pure
 * function of the serialized Team.
 */
export function buildHomeTeam(model: RunModel): Team {
  const counters: RunCounters = {
    wins: model.wins,
    mapIndex: model.core.currentMapIndex,
    forgivenLosses: model.forgivenLosses,
  };
  return buildCoachedHomeTeam(model.core.roster, getCoach(model.coachId), model.boosts, counters);
}

/**
 * The opponent the lineup builder should reorder against, when one is in view: the
 * current pregame matchup (or the pregame the builder was opened from). Outside a
 * matchup (the map / a rest node) there is no opponent, so the reorder falls back to
 * a pure-style read. Lets the "let the coach set my lineup" button thread the same
 * matchup the pregame banner does, when it is known.
 */
function builderOpponent(model: RunModel): Team | undefined {
  const phase = model.phase;
  if (phase.kind === 'pregame') return buildOpponentTeam(model.core, phase.nodeId, model.mods);
  if (phase.kind === 'lineup' && phase.returnTo.kind === 'pregame') {
    return buildOpponentTeam(model.core, phase.returnTo.nodeId, model.mods);
  }
  return undefined;
}

/** The ordered identity of a roster (starters in slot order, then bench), so the
 * button can tell whether the coach would change anything, including a pure re-slot. */
function rosterOrder(roster: RunState['roster']): string {
  const k = (rp: RosterPlayer): string => nameKey(rp.player.name, rp.position);
  return [...roster.starters.map(k), '/', ...roster.bench.map(k)].join(',');
}

/**
 * The equipped coach's full reorder of a given roster, in the coach's playstyle, for
 * the lineup builder's "let the coach set it" button. Matchup-aware when an opponent
 * is in view (see {@link builderOpponent}), pure-style otherwise. Returns null only
 * when the coach would not change anything (same five, same slots, same bench order),
 * so the button also tidies an incoherent slot order, not just player swaps. Pure (no
 * dispatch): the builder applies the returned order locally, then the player can still
 * hand-tweak any slot before confirming.
 */
export function coachReorderRoster(model: RunModel, roster: RunState['roster']): RunState['roster'] | null {
  const coach = getCoach(model.coachId);
  const counters: RunCounters = {
    wins: model.wins,
    mapIndex: model.core.currentMapIndex,
    forgivenLosses: model.forgivenLosses,
  };
  const { roster: reordered } = reorderForCoach({
    roster,
    coach,
    opponent: builderOpponent(model),
    buildHome: (r) => buildCoachedHomeTeam(r, coach, model.boosts, counters),
  });
  return rosterOrder(reordered) === rosterOrder(roster) ? null : reordered;
}

/**
 * The deterministic opponent Team for a combat node. The node's baked difficulty
 * already encodes the run's ladder class AND the difficulty's ramp (see
 * src/game/difficulty.ts), so it is the opponent level directly and the pregame
 * scouting preview and the simulated game always build the identical five from the
 * same seed.
 */
export function buildOpponentTeam(core: RunState, nodeId: string, mods: DifficultyMods): Team {
  const node = core.map.nodes[nodeId];
  const level = node.difficulty ?? node.round ?? node.layer + 1;
  const isBoss = node.type === 'boss' || nodeId === core.map.bossNodeId;
  const opp = generateOpponentTeam(
    level,
    createRNG(deriveSeed(core.seed, `opp-${nodeId}`)),
    { isBoss, extraLegend: isBoss && mods.bossExtraLegend }
  );
  // The franchise's real coach shapes how the opponent plays (tempo / focus / star
  // usage), STYLE ONLY: no system bonus is applied, so opponents are distinct
  // without an unfair rating bump. A pure table lookup keyed by franchise, so it
  // adds no RNG draw and determinism / the opponent preview hold. Their substitution
  // depth (rotationForCoach) rides on SimConfig.awayRotation at the tip-off call.
  const coach = coachForTeamName(opp.name);
  return buildTeam(
    opp.name,
    effectivePlayers(opp.roster.starters),
    planForCoach(planForRoster(opp.roster), coach, opp.roster),
    opp.colorHex,
    opp.accentHex,
    effectivePlayers(opp.roster.bench),
    teamModifierFor(opp.roster.starters, [])
  );
}

/**
 * The equipped coach's optional lineup suggestion for a combat node's pregame: it
 * surfaces only when the edge clears the difficulty-scaled bar, so easy runs stay
 * quiet and hard runs get adjustments often. This is the heavy part of entering a
 * node (a lineup search over full team builds), so the reducer does NOT run it
 * inline: useRun calls it after the pregame frame commits and lands the result via
 * the setCoachRec action. Pure and deterministic from the model (seeded opponent,
 * RNG-free search), so a resumed or replayed pregame recomputes the identical rec.
 */
export function computeCoachRec(model: RunModel, nodeId: string): CoachRec | null {
  const node = model.core.map.nodes[nodeId];
  if (!node || (node.type !== 'game' && node.type !== 'elite' && node.type !== 'boss')) return null;
  const coach = getCoach(model.coachId);
  const away = buildOpponentTeam(model.core, nodeId, model.mods);
  // Same counters the game will use, so candidate lineups are scored with the run's
  // live snowball stacks and set/duo synergies (a swap that completes a duo counts).
  const counters: RunCounters = {
    wins: model.wins,
    mapIndex: model.core.currentMapIndex,
    forgivenLosses: model.forgivenLosses,
  };
  return recommendLineup({
    roster: model.core.roster,
    coach,
    opponent: away,
    buildHome: (r) => buildCoachedHomeTeam(r, coach, model.boosts, counters),
    minDelta: recMinDelta(model.difficulty, node.type),
  });
}

/**
 * After a game, recover everyone one game (decrement gamesOut) and roll fresh
 * injuries for the players who dressed. Risk rises with accumulated load and falls
 * with durability. Deterministic from the game's derived seed.
 */
function applyInjuries(
  core: RunState,
  homeBox: BoxLine[],
  nodeId: string,
  mods: DifficultyMods
): RunState['roster'] {
  const rng = createRNG(deriveSeed(core.seed, `injury-${nodeId}`));
  const lineByName = new Map(homeBox.map((b) => [b.name, b]));
  const update = (p: RosterPlayer): RosterPlayer => {
    let gamesOut = Math.max(0, (p.gamesOut ?? 0) - 1); // heal one game
    const line = lineByName.get(p.player.name);
    if (line && line.seconds > 0) {
      const risk =
        (INJURY_BASE * mods.injuryMul * (line.load / INJURY_LOAD_NORM) *
          (11 - p.player.stats.durability)) / 8;
      if (rng.chance(risk)) gamesOut = rng.int(1, mods.maxGamesOut);
    }
    return { ...p, gamesOut };
  };
  return mapRoster(core.roster, update);
}

/** Stamp a combat node with its final game result (W/L + score) so the map tile can
 * render it. Immutable: clones the node map and leaves the rest of the run untouched. */
function withNodeResult(
  core: RunState,
  nodeId: string,
  result: { won: boolean; home: number; away: number }
): RunState {
  const node = core.map.nodes[nodeId];
  if (!node) return core;
  return {
    ...core,
    map: { ...core.map, nodes: { ...core.map.nodes, [nodeId]: { ...node, result } } },
  };
}

/** Fraction of the run completed by map index (0 on the first map, ~1 on the last). */
function mapProgress(mapIndex: number): number {
  return TOTAL_MAPS > 1 ? mapIndex / (TOTAL_MAPS - 1) : 0;
}

/**
 * Resolve a chosen node into its phase. Combat opens pregame; recruit nodes offer
 * real players at the ladder class (with a growing chance of the class above), and
 * on the S / S+ ladders can roll a rare on-loan legendary; boost nodes roll a free
 * item stock.
 */
function enterNode(model: RunModel, nodeId: string): RunModel {
  const core = traverseTo(model.core, nodeId);
  const node = core.map.nodes[nodeId];
  const round = node.round ?? node.layer + 1;
  switch (node.type) {
    case 'game':
    case 'elite':
    case 'boss':
      // Just the phase flip: the coach's matchup scout (computeCoachRec) is heavy, so
      // useRun schedules it after this tap's frame commits and lands it via
      // setCoachRec. `coachRec` stays undefined here, meaning "not computed yet".
      return { ...model, core, phase: { kind: 'pregame', nodeId } };
    case 'recruit': {
      const owned = new Set(
        [...core.roster.starters, ...core.roster.bench].map((p) => p.player.name)
      );
      const rolled = generateRecruitOffers(
        model.ladderClass,
        model.difficulty,
        mapProgress(core.currentMapIndex),
        RECRUIT_OFFER_COUNT,
        createRNG(deriveSeed(core.seed, `recruit-${nodeId}`)),
        owned,
        model.homeFavor ?? {}
      );
      // Pity: if no specialist showed and the dry streak is long enough, force one
      // into the last slot so a specialist build is always reachable.
      const { offers, recruitDryStreak } = applyRecruitPity(
        rolled,
        model.recruitDryStreak,
        owned,
        model.ladderClass,
        createRNG(deriveSeed(core.seed, `recruit-${nodeId}-pity`))
      );
      // Legendaries (S+) surface only on the S / S+ ladders.
      const legendsAllowed = model.ladderClass === 'S' || model.ladderClass === 'S+';
      const gateRng = createRNG(deriveSeed(core.seed, `legend-${nodeId}`));
      if (
        legendsAllowed &&
        !model.legend.offeredThisRun &&
        gateRng.chance(legendGateChance(round, model.legend.dryStreak))
      ) {
        return {
          ...model,
          core,
          recruitDryStreak,
          legend: { ...model.legend, offeredThisRun: true },
          phase: {
            kind: 'legendReveal',
            nodeId,
            // Favor steers WHO walks in (the highest-favor un-owned legend); the
            // gate above kept whether-and-when pure chance-and-pity.
            offer: legendRecruitFavored(
              model.ownedLegendKeys ?? [],
              model.homeFavor ?? {},
              gateRng
            ),
            fallback: offers,
          },
        };
      }
      return {
        ...model,
        core,
        recruitDryStreak,
        phase: { kind: 'recruit', nodeId, offers, rerolled: offers.map(() => false) },
      };
    }
    case 'training':
      return { ...model, core, phase: { kind: 'training', nodeId } };
    case 'rest':
      return { ...model, core, phase: { kind: 'rest', nodeId } };
    case 'boost': {
      const stock = rollBoostStock(
        createRNG(deriveSeed(core.seed, `boost-${nodeId}`)),
        model.mods.rarityBonus
      );
      return { ...model, core, phase: { kind: 'boost', nodeId, stock } };
    }
    default:
      return { ...model, core, phase: { kind: 'map' } };
  }
}

/** A boost board is "dry" if it offered no epic-or-better boost. */
function boardWasDry(offers: readonly BoostOffer[]): boolean {
  return !offers.some((o) => {
    const r = BOOST_BY_ID[o.defId]?.rarity;
    return r === 'epic' || r === 'legendary';
  });
}

/** After a boost draft resolves (draft/drop/skip), advance the pity streak when the
 * board the player saw was dry (capped) or reset it when it was not, then open the
 * map. The streak biases the NEXT node's draw toward epic+. */
function afterBoostDraft(model: RunModel, offers: readonly BoostOffer[]): RunModel {
  const boostPity = boardWasDry(offers) ? Math.min(model.boostPity + 1, PITY_MAX) : 0;
  return { ...model, boostPity, phase: { kind: 'map' } };
}

/** Clear a boss: build the next map, reset position, and open its boost draft. */
function advanceToNextMap(model: RunModel): RunModel {
  const nextIndex = model.core.currentMapIndex + 1;
  const map = generateFixedMap({
    seed: deriveSeed(model.core.seed, `map-${nextIndex}`),
    mapIndex: nextIndex,
    difficulty: model.difficulty,
    ladderLevel: classLevel(model.ladderClass),
  });
  const core = { ...model.core, map, currentMapIndex: nextIndex, currentNodeId: null };
  const round = nextIndex + 1;
  const drawLabel = `boost-m${nextIndex}`;
  const offers = drawBoostOffers(
    model.boosts,
    createRNG(deriveSeed(model.core.seed, drawLabel)),
    model.mods.boostOfferCount,
    {
      banished: new Set(model.banishedBoosts),
      pityOffset: pityRarityOffset(model.boostPity),
      rarityBonus: model.mods.rarityBonus,
    }
  );
  return {
    ...model,
    core,
    game: null,
    phase: { kind: 'boostDraft', round, offers, pendingFull: false, drawLabel },
  };
}

/** Add a recruit to the bench, enforcing the 12-man run cap (else ask for a drop).
 * `returnTo` is where the flow resolves (default: the map); a boss signing passes the
 * next map's boost draft so accepting never eats that beat. */
function recruitOrDrop(
  model: RunModel,
  nodeId: string,
  player: RosterPlayer,
  returnTo: RunPhase = { kind: 'map' }
): RunModel {
  if (rosterSize(model.core.roster) >= MAX_RUN_ROSTER) {
    return { ...model, phase: { kind: 'dropForRecruit', nodeId, incoming: player, returnTo } };
  }
  const roster = {
    ...model.core.roster,
    bench: [...model.core.roster.bench, player],
  };
  return { ...model, core: { ...model.core, roster }, phase: returnTo };
}

/**
 * Boss Legend Signings: after a non-final boss win on hard/insane S / S+ ladders, a
 * seeded roll may have the beaten franchise's legend offer to sign ("beat the legend,
 * sign the legend"). The offer is the NATURAL-stat legend (not the level-scaled boss
 * copy), re-derived by re-calling generateOpponentTeam with the node's exact seed (the
 * franchise is the first draw, so this reproduces the boss byte-for-byte). One legend
 * offer per run across BOTH channels (shared offeredThisRun flag), never a legend
 * already owned or already on the squad. The roll rides its own child seed, so replays
 * and resumes are stable and the drop roll is untouched.
 */
function rollBossSigning(model: RunModel, nodeId: string): RosterPlayer | null {
  const { mods, ladderClass } = model;
  if (mods.legendSign.base <= 0) return null;
  if (ladderClass !== 'S' && ladderClass !== 'S+') return null;
  if (model.legend.offeredThisRun) return null;
  const chance = mods.legendSign.base + mods.legendSign.perMap * model.core.currentMapIndex;
  if (!createRNG(deriveSeed(model.core.seed, `sign-${nodeId}`)).chance(chance)) return null;
  const node = model.core.map.nodes[nodeId];
  const level = node.difficulty ?? node.round ?? node.layer + 1;
  const headliner = generateOpponentTeam(
    level,
    createRNG(deriveSeed(model.core.seed, `opp-${nodeId}`)),
    { isBoss: true, extraLegend: mods.bossExtraLegend }
  ).headliner;
  if (!headliner) return null;
  const key = nameKey(headliner.player.name, headliner.position);
  if ((model.ownedLegendKeys ?? []).includes(key)) return null;
  const onSquad = [...model.core.roster.starters, ...model.core.roster.bench].some(
    (p) => p.player.name === headliner.player.name
  );
  if (onSquad) return null;
  return { ...headliner, onLoan: true };
}

export function runReducer(
  model: RunModel | null,
  action: RunAction
): RunModel | null {
  if (action.type === 'newRun') return initRun(action.seed, action.homeRoster);
  if (action.type === 'loadRun') return action.model;
  if (model === null) return null;

  switch (action.type) {
    case 'confirmDraft': {
      if (model.phase.kind !== 'draft') return model;
      const { starters, bench } = action;
      if (!canConfirmLoadout(starters, bench, model.ladderClass, model.difficulty).ok) return model;
      // Starters arrive already slot-ordered (index 0 = PG ... 4 = C) from the
      // loadout, so the run starts correctly positioned. No OVR re-sort.
      const roster = { starters, bench };
      const drawLabel = 'boost-m0';
      const offers = drawBoostOffers(
        [],
        createRNG(deriveSeed(model.core.seed, drawLabel)),
        model.mods.boostOfferCount,
        {
          banished: new Set(model.banishedBoosts),
          pityOffset: pityRarityOffset(model.boostPity),
          rarityBonus: model.mods.rarityBonus,
        }
      );
      return {
        ...model,
        core: { ...model.core, roster },
        phase: { kind: 'boostDraft', round: 1, offers, pendingFull: false, drawLabel },
      };
    }

    case 'chooseNode': {
      // Only choosable from the map (never before the draft sets a roster, which
      // would build a team from zero players); guards against an empty-roster sim.
      if (model.phase.kind !== 'map') return model;
      const node = model.core.map.nodes[action.nodeId];
      if (!node) return model;
      return enterNode(model, action.nodeId);
    }

    case 'openLineupBuilder':
      return { ...model, phase: { kind: 'lineup', returnTo: model.phase } };

    case 'setLineup': {
      if (model.phase.kind !== 'lineup') return model;
      if (!validateLineup(action.starters).ok) return model;
      const roster = { starters: action.starters, bench: action.bench };
      // A manual edit makes any coach suggestion stale (shown OR still computing),
      // so resolve it to null: the pregame's scout stays permanently quiet, and the
      // async compute can never land a rec against the roster the player just set.
      let returnTo = model.phase.returnTo;
      if (returnTo.kind === 'pregame') {
        returnTo = { ...returnTo, coachRec: null };
      }
      return { ...model, core: { ...model.core, roster }, phase: returnTo };
    }

    case 'cancelLineup':
      return model.phase.kind === 'lineup'
        ? { ...model, phase: model.phase.returnTo }
        : model;

    case 'acceptCoachRec': {
      // One-click apply of the coach's suggestion: commit its five via the same
      // validated path as a manual lineup edit, then clear the banner.
      if (model.phase.kind !== 'pregame' || !model.phase.coachRec) return model;
      const rec = model.phase.coachRec;
      if (!validateLineup(rec.starters).ok) return model;
      const roster = { starters: rec.starters, bench: rec.bench };
      return {
        ...model,
        core: { ...model.core, roster },
        phase: { ...model.phase, coachRec: null },
      };
    }

    case 'setCoachRec': {
      // Lands the async coach scout. Applies only to the pregame it was computed for,
      // and only while that pregame has never resolved a rec (undefined = not computed yet;
      // null = computed/cleared), so a late result can never land on a different node,
      // a replay, or a roster the player already edited.
      if (model.phase.kind !== 'pregame') return model;
      if (model.phase.nodeId !== action.nodeId) return model;
      if (model.phase.coachRec !== undefined) return model;
      return { ...model, phase: { ...model.phase, coachRec: action.rec } };
    }

    case 'enterGame': {
      if (model.phase.kind !== 'pregame') return model;
      const nodeId = model.phase.nodeId;
      const home = buildHomeTeam(model);
      const away = buildOpponentTeam(model.core, nodeId, model.mods);
      // Salt the seed with timeouts spent so a replayed game (after a forgiven loss)
      // is a fresh roll, not a deterministic repeat. The opponent (opp-${nodeId}) is
      // unchanged, so it is the same five, re-contested.
      const result = simulateGame({
        home,
        away,
        seed: deriveSeed(model.core.seed, `game-${nodeId}-${model.forgivenLosses}`),
        homeRotation: rotationForCoach(getCoach(model.coachId)),
        awayRotation: rotationForCoach(coachForTeamName(away.name)),
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
        // Spend a timeout if any remain: the run survives and the player returns to
        // pregame to replay (a fresh seed via forgivenLosses), instead of ending. No
        // loss/win rewards bank here; coins only accrue on the eventual win.
        if (model.secondChancesRemaining > 0) {
          return {
            ...model,
            secondChancesRemaining: model.secondChancesRemaining - 1,
            forgivenLosses: model.forgivenLosses + 1,
            game: null,
            // coachRec resolves to null: a replay pregame never shows the banner
            // (same as before the scout went async), so nothing recomputes here.
            phase: { kind: 'pregame', nodeId, timeoutUsed: true, coachRec: null },
          };
        }
        const rewards = { ...model.core.rewards, coins: model.core.rewards.coins + LOSS_COINS };
        // Stamp the lost node with a red L for forward-compatibility (losses end the
        // run today, so the map is not shown again, but this keeps the data honest).
        const lostCore = model.game
          ? withNodeResult({ ...model.core, rewards }, nodeId, {
              won: false,
              home: model.game.result.finalHome,
              away: model.game.result.finalAway,
            })
          : { ...model.core, rewards };
        return { ...model, core: lostCore, phase: { kind: 'summary', champion: false } };
      }
      const node = model.core.map.nodes[nodeId];
      const isBoss = node.type === 'boss' || nodeId === model.core.map.bossNodeId;
      const coins = model.game ? coinsForWin(node, model.game.result, model.mods) : COIN_BASE;
      const rewards = {
        ...model.core.rewards,
        coins: model.core.rewards.coins + coins,
        reputation: model.core.rewards.reputation + Math.round((node.layer + 1) * model.mods.repMul),
        trainingPoints: model.core.rewards.trainingPoints + trainingPointsFor(node, model.mods),
      };
      const roster = model.game
        ? applyInjuries(model.core, model.game.result.box.home, nodeId, model.mods)
        : model.core.roster;
      const core = { ...model.core, rewards, roster };
      const wins = model.wins + 1;
      const isChampionship = isBoss && core.currentMapIndex >= TOTAL_MAPS - 1;
      // Favor accrues to every player who logged minutes in this WIN: base points by
      // opponent tier, plus the flat championship bonus on the title game. Losses and
      // timeout replays never touch the ledger (accrue-on-wins is what keeps a thrown
      // run worth zero favor); the whole run's ledger banks at settle, win or lose.
      const winPoints = isBoss
        ? FAVOR_WIN_POINTS.boss
        : node.type === 'elite'
          ? FAVOR_WIN_POINTS.elite
          : FAVOR_WIN_POINTS.game;
      const favor = addFavor(
        model.favor ?? {},
        fieldedFavorKeys(roster, model.game?.result.box.home),
        winPoints + (isChampionship ? FAVOR_CHAMPION_BONUS : 0)
      );
      if (isBoss) {
        if (isChampionship) {
          // The championship clear bonus banks with the final win's coins (as-earned,
          // like every payout), so only a FINISHED run ever touches the difficulty's
          // coin premium; partial runs cannot farm it.
          const crowned = {
            ...core,
            rewards: { ...rewards, coins: rewards.coins + model.mods.clearBonus },
          };
          return { ...model, core: crowned, wins, favor, phase: { kind: 'summary', champion: true } };
        }
        // Boss Legend Signings roll BEFORE the map advances (the chance ramps on the
        // map index just beaten); an offered signing counts as the run's one legend
        // offer, shared with the recruit-node gate.
        const signOffer = rollBossSigning({ ...model, core, wins }, nodeId);
        const advanced = advanceToNextMap({
          ...model,
          core,
          wins,
          favor,
          legend: signOffer ? { ...model.legend, offeredThisRun: true } : model.legend,
        });
        // A boss always drops gear (rare / epic / legendary, never common). Beat order:
        // the drop lands first, then the signing offer closes the show, then the next
        // map's boost draft.
        const afterDrop: RunPhase = signOffer
          ? { kind: 'legendSign', nodeId, offer: signOffer, returnTo: advanced.phase }
          : advanced.phase;
        const drop = rollDrop(
          'boss',
          createRNG(deriveSeed(model.core.seed, `drop-${nodeId}`)),
          model.mods.bossRarityBonus
        );
        return drop
          ? { ...advanced, phase: { kind: 'itemDrop', nodeId, drop, returnTo: afterDrop } }
          : { ...advanced, phase: afterDrop };
      }
      // Elites no longer drop gear (coins / TP / reputation only). Stamp the node with
      // the win + score so the map tile shows a green W and the final (boss wins replace
      // the map via advanceToNextMap, so their node is never revisited and is not stamped).
      const stamped = model.game
        ? withNodeResult(core, nodeId, {
            won: true,
            home: model.game.result.finalHome,
            away: model.game.result.finalAway,
          })
        : core;
      return { ...model, core: stamped, wins, favor, phase: { kind: 'map' }, game: null };
    }

    case 'recruit': {
      if (model.phase.kind !== 'recruit') return model;
      return recruitOrDrop(model, model.phase.nodeId, action.player);
    }

    case 'rerollRecruit': {
      if (model.phase.kind !== 'recruit') return model;
      const { index } = action;
      const { offers, rerolled, nodeId } = model.phase;
      if (index < 0 || index >= offers.length || rerolled[index]) return model;
      // Exclude owned players and ALL current offers (including the one being
      // rerolled) so the reroll always lands on a different player.
      const exclude = new Set([
        ...model.core.roster.starters,
        ...model.core.roster.bench,
      ].map((p) => p.player.name));
      offers.forEach((o) => exclude.add(o.player.name));
      const replacement = generateRecruitOffers(
        model.ladderClass,
        model.difficulty,
        mapProgress(model.core.currentMapIndex),
        1,
        createRNG(deriveSeed(model.core.seed, `recruit-${nodeId}-reroll-${index}`)),
        exclude,
        model.homeFavor ?? {}
      )[0];
      if (!replacement) return model;
      return {
        ...model,
        phase: {
          kind: 'recruit',
          nodeId,
          offers: offers.map((o, i) => (i === index ? replacement : o)),
          rerolled: rerolled.map((r, i) => (i === index ? true : r)),
        },
      };
    }

    case 'dropForRecruit': {
      if (model.phase.kind !== 'dropForRecruit') return model;
      const { incoming, returnTo } = model.phase;
      const all = [...model.core.roster.starters, ...model.core.roster.bench];
      const dropped = all[action.index];
      if (!dropped) return model;
      // Dropping returns any held item to the bag; the player leaves the run roster.
      const bag = dropped.item ? [...model.bag, dropped.item.defId] : model.bag;
      const kept = all.filter((_, i) => i !== action.index);
      kept.push(incoming);
      const roster = { starters: kept.slice(0, 5), bench: kept.slice(5) };
      return {
        ...model,
        core: { ...model.core, roster },
        bag,
        phase: returnTo ?? { kind: 'map' },
      };
    }

    case 'trainPlayer': {
      if (model.phase.kind !== 'training') return model;
      if (model.core.rewards.trainingPoints <= 0) return model;
      const all = [...model.core.roster.starters, ...model.core.roster.bench];
      const target = all[action.index];
      if (!target) return model;
      if (trainedStat(target, action.stat) >= MAX_TRAINED_STAT) return model;
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
      return { ...model, core: { ...model.core, roster, rewards } };
    }

    case 'rest': {
      if (model.phase.kind !== 'rest') return model;
      const rewards = {
        ...model.core.rewards,
        reputation: model.core.rewards.reputation + Math.round(REST_REPUTATION * model.mods.repMul),
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
      if (model.boosts.length < MAX_BOOSTS) {
        const boosts = [...model.boosts, { id: offer.defId }];
        return afterBoostDraft({ ...model, boosts }, phase.offers);
      }
      return { ...model, phase: { ...phase, pendingFull: true, forced: offer } };
    }

    case 'dropBoostForNew': {
      if (model.phase.kind !== 'boostDraft') return model;
      const phase = model.phase;
      const forced = phase.forced;
      if (!forced || forced.kind !== 'new') return model;
      const boosts = model.boosts.filter((_, i) => i !== action.dropIndex);
      boosts.push({ id: forced.defId });
      return afterBoostDraft({ ...model, boosts }, phase.offers);
    }

    case 'skipBoostDraft': {
      if (model.phase.kind !== 'boostDraft') return model;
      return afterBoostDraft(model, model.phase.offers);
    }

    case 'banishBoost': {
      // Remove an offered boost from this run's pool (free, hard-capped) and draw a
      // single distinct replacement so the board stays at offerCount.
      if (model.phase.kind !== 'boostDraft' || model.phase.pendingFull) return model;
      const phase = model.phase;
      const { defId } = action.offer;
      if (model.banishedBoosts.length >= MAX_BANISHES) return model;
      if (model.banishedBoosts.includes(defId)) return model;
      if (!phase.offers.some((o) => o.defId === defId)) return model;
      const banished = [...model.banishedBoosts, defId];
      // Pool-floor guard: never banish below the offer count (cannot bite with the
      // shipped caps, but keeps the invariant explicit and future-proof).
      if (BOOST_DEFS.length - model.boosts.length - banished.length < model.mods.boostOfferCount) {
        return model;
      }
      const survivors = phase.offers.filter((o) => o.defId !== defId);
      // Pass the surviving offers as "owned" so the replacement is distinct from them.
      const replacement = drawBoostOffers(
        [...model.boosts, ...survivors.map((o) => ({ id: o.defId }))],
        createRNG(deriveSeed(model.core.seed, `${phase.drawLabel}-banish-${banished.length}`)),
        1,
        {
          banished: new Set(banished),
          pityOffset: pityRarityOffset(model.boostPity),
          rarityBonus: model.mods.rarityBonus,
        }
      )[0];
      const offers = replacement ? [...survivors, replacement] : survivors;
      return { ...model, banishedBoosts: banished, phase: { ...phase, offers } };
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
      return recruitOrDrop(model, model.phase.nodeId, model.phase.offer);
    }

    case 'declineLegend': {
      if (model.phase.kind !== 'legendReveal') return model;
      const { nodeId, fallback } = model.phase;
      return {
        ...model,
        phase: { kind: 'recruit', nodeId, offers: fallback, rerolled: fallback.map(() => false) },
      };
    }

    case 'acceptLegendSign': {
      if (model.phase.kind !== 'legendSign') return model;
      const { nodeId, offer, returnTo } = model.phase;
      return recruitOrDrop(model, nodeId, offer, returnTo);
    }

    case 'declineLegendSign': {
      if (model.phase.kind !== 'legendSign') return model;
      return { ...model, phase: model.phase.returnTo };
    }

    case 'skipNode':
    case 'backToMap':
      return { ...model, phase: { kind: 'map' } };
  }
}
