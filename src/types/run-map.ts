import type { Roster } from './roster';

/**
 * The pokelike run, a sequence of short fixed-SHAPE maps the player climbs one
 * at a time. Every map shares the same authored topology (rows, nodes per row,
 * edges); the interior node TYPES are randomized, except the pinned entry pair
 * (recruit left, boost right), at least one rest before the boss, and the boss
 * that ends the map. Clearing a map's boss opens a passive-boost draft and the
 * next map; clearing the final boss wins the run. Generator and traversal live
 * in src/game/run-map.ts.
 */

export type MapNodeType =
  | 'game' // standard opponent
  | 'elite' // tougher opponent, better reward
  | 'boss' // map finale
  | 'recruit' // add a player to the bench (the "catch" analog)
  | 'training' // spend training points to boost a player (run-scoped)
  | 'boost' // grab one free item (formerly the coin shop)
  | 'rest'; // restore / re-seed the lineup

export interface MapNode {
  /** Stable id, e.g. "n-2-1" (layer-index). */
  id: string;
  type: MapNodeType;
  /** Row in the DAG (0 = entry layer). */
  layer: number;
  /** Ids of nodes in the next layer this connects to (the branching edges). */
  next: string[];
  /** Coarse integer round (map-indexed) for combat nodes: drives the run's
   * economy and rarity gates (coins, legend chance, drops, boost stock). */
  round?: number;
  /** Continuous difficulty level (float) from the node's absolute run position:
   * drives opponent/recruit stat scaling so difficulty rises smoothly across the
   * run instead of resetting each map. See src/game/difficulty.ts. */
  difficulty?: number;
  visited: boolean;
  cleared: boolean;
  /** Set after this combat node's game resolves, so the map can stamp a W/L and the
   * final score on the tile. `home` is the player's score, `away` the opponent's. */
  result?: { won: boolean; home: number; away: number };
}

export interface RunMap {
  nodes: Record<string, MapNode>;
  /** Node ids grouped per layer, for layout. */
  layers: string[][];
  /** Entry choices (layer 0). */
  startNodeIds: string[];
  /** The final node all paths converge to. */
  bossNodeId: string;
}

/** Currencies accumulated across a run. Coins persist home (spent in the Locker
 * Room); training points are run-scoped and spent at Training nodes. */
export interface RunRewards {
  coins: number;
  reputation: number;
  /** Banked training points (1 game / 2 elite / 4 boss per win), spent at
   * Training nodes for run-scoped +1s. Never persisted home. */
  trainingPoints: number;
}

export interface RunState {
  /** The map currently being climbed (maps[currentMapIndex]). */
  map: RunMap;
  /** Which map of the run this is (0-based; the run has a fixed number of maps). */
  currentMapIndex: number;
  /** null while choosing an entry node. */
  currentNodeId: string | null;
  /** Persists across nodes within a run. */
  roster: Roster;
  /** Run seed; per-game and per-map seeds derive from it (keeps replays stable). */
  seed: number | string;
  rewards: RunRewards;
}
