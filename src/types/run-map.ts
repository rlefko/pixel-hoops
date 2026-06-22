import type { Roster } from './roster';

/**
 * The branching tournament run, modeled on Slay the Spire / pokelike maps. A
 * run is a layered DAG of nodes; the player chooses a path forward, playing
 * games and visiting non-combat nodes (recruit / train / shop / rest) until the
 * boss. The generator and traversal live in src/game/run-map.ts. The playable
 * slice uses a minimal linear run first; the full branching UI is a later phase.
 */

export type MapNodeType =
  | 'game' // standard opponent
  | 'elite' // tougher opponent, better reward
  | 'boss' // run finale
  | 'recruit' // add a player to the bench (the "catch" analog)
  | 'training' // spend XP / boost a player
  | 'shop' // gear / equipment
  | 'rest'; // restore / re-seed the lineup

export interface MapNode {
  /** Stable id, e.g. "n-2-1" (layer-index). */
  id: string;
  type: MapNodeType;
  /** Row in the DAG (0 = entry layer). */
  layer: number;
  /** Ids of nodes in the next layer this connects to (the branching edges). */
  next: string[];
  /** Round number for game/elite/boss nodes (feeds difficulty scaling). */
  round?: number;
  visited: boolean;
  cleared: boolean;
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

/** Meta currencies accumulated across a run (stubbed now, spent later). */
export interface RunRewards {
  coins: number;
  reputation: number;
  trainingXP: number;
}

export interface RunState {
  map: RunMap;
  /** null while choosing an entry node. */
  currentNodeId: string | null;
  /** Persists across nodes within a run. */
  roster: Roster;
  /** Run seed; per-game seeds derive from it (keeps replays stable). */
  seed: number | string;
  rewards: RunRewards;
}
