import type { MapNode, MapNodeType, RunMap, RunState } from '@/types/run-map';
import { createRNG, type RNG } from './rng';

/**
 * Generates and traverses the branching tournament run (a Slay-the-Spire-style
 * layered DAG). Deterministic from a seed. The playable slice uses a minimal
 * linear run; this is the foundation the full branching-map UI builds on later
 * (see docs/roadmap.md).
 */

export interface RunMapConfig {
  seed: number | string;
  /** Number of layers including the boss layer. Defaults to 7 (the 7 rounds). */
  layers?: number;
  /** Max nodes per middle layer. Defaults to 3. */
  width?: number;
}

const DEFAULT_LAYERS = 7;
const DEFAULT_WIDTH = 3;

/** Deterministic Fisher-Yates shuffle (fixed RNG draw count, unbiased). */
function shuffle<T>(items: readonly T[], rng: RNG): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick a node type for a middle layer, weighted to stay game-heavy early. */
function nodeTypeForLayer(layer: number, rng: RNG): MapNodeType {
  const entries: [MapNodeType, number][] = [
    ['game', 6],
    ['elite', layer >= 3 ? 2 : 0],
    ['recruit', 2],
    ['shop', 1],
    ['rest', 1],
    ['training', 1],
  ];
  return rng.weightedPick(entries);
}

export function generateRunMap(config: RunMapConfig): RunMap {
  const rng = createRNG(config.seed);
  const totalLayers = config.layers ?? DEFAULT_LAYERS;
  const width = config.width ?? DEFAULT_WIDTH;

  const nodes: Record<string, MapNode> = {};
  const layers: string[][] = [];

  for (let layer = 0; layer < totalLayers; layer++) {
    const isFirst = layer === 0;
    const isBoss = layer === totalLayers - 1;
    const count = isBoss ? 1 : isFirst ? width : rng.int(2, width);
    const ids: string[] = [];

    for (let index = 0; index < count; index++) {
      const id = `n-${layer}-${index}`;
      const type: MapNodeType = isBoss
        ? 'boss'
        : isFirst
          ? 'game'
          : nodeTypeForLayer(layer, rng);
      const isCombat = type === 'game' || type === 'elite' || type === 'boss';
      nodes[id] = {
        id,
        type,
        layer,
        next: [],
        round: isCombat ? layer + 1 : undefined,
        visited: false,
        cleared: false,
      };
      ids.push(id);
    }
    layers.push(ids);
  }

  // Connect each layer to the next: every node forks to at least two next nodes
  // whenever the next layer has room (so the player always has a real branch to
  // choose, never a forced single route), and every next-layer node keeps at
  // least one inbound edge so nothing is orphaned.
  for (let layer = 0; layer < totalLayers - 1; layer++) {
    const current = layers[layer];
    const nextIds = layers[layer + 1];
    const covered = new Set<string>();

    for (const id of current) {
      const edgeCount = Math.min(nextIds.length, rng.int(2, 3));
      const chosen = shuffle(nextIds, rng).slice(0, edgeCount);
      nodes[id].next = chosen;
      for (const c of chosen) covered.add(c);
    }

    // Patch any orphaned next node by wiring it from a random current node.
    for (const nextId of nextIds) {
      if (!covered.has(nextId)) {
        const from = current[rng.int(0, current.length - 1)];
        if (!nodes[from].next.includes(nextId)) nodes[from].next.push(nextId);
      }
    }
  }

  return {
    nodes,
    layers,
    startNodeIds: layers[0],
    bossNodeId: layers[totalLayers - 1][0],
  };
}

/** The nodes the player may move to from their current position. */
export function getReachableNodes(map: RunMap, currentNodeId: string | null): MapNode[] {
  if (currentNodeId === null) {
    return map.startNodeIds.map((id) => map.nodes[id]);
  }
  const current = map.nodes[currentNodeId];
  if (!current) return [];
  return current.next.map((id) => map.nodes[id]);
}

/** Advance the run: clear the current node and move to the chosen next node. */
export function traverseTo(state: RunState, nodeId: string): RunState {
  const nodes = { ...state.map.nodes };
  if (state.currentNodeId && nodes[state.currentNodeId]) {
    nodes[state.currentNodeId] = { ...nodes[state.currentNodeId], cleared: true };
  }
  if (nodes[nodeId]) {
    nodes[nodeId] = { ...nodes[nodeId], visited: true };
  }
  return {
    ...state,
    map: { ...state.map, nodes },
    currentNodeId: nodeId,
  };
}
