import type { MapNode, MapNodeType, RunMap, RunState } from '@/types/run-map';
import { createRNG, type RNG } from './rng';

/**
 * Generates and traverses one short fixed-SHAPE map of the pokelike run. Every
 * map shares the same authored topology (rows [2,3,2,1] plus the edges below);
 * only the interior node TYPES vary by seed. Pinned every run: the entry pair
 * (recruit left, boost right), one rest in the pre-boss row, and the boss.
 * Deterministic from a per-map seed (run-machine derives one per map index).
 */

export interface FixedMapConfig {
  seed: number | string;
  /** Which map of the run this is (0-based). Drives difficulty and node ids. */
  mapIndex: number;
}

/** Nodes per row, entry (0) to boss. The map's fixed shape. */
const ROW_SIZES = [2, 3, 2, 1] as const;
const BOSS_ROW = ROW_SIZES.length - 1;
const PRE_BOSS_ROW = BOSS_ROW - 1;

/**
 * Authored edges: EDGES[layer][i] lists the next-row indices node i connects to.
 * The entry forks recruit and boost toward different sides, the wide middle row
 * funnels into the two pre-boss nodes, and both pre-boss nodes feed the boss.
 */
const EDGES: number[][][] = [
  [[0, 1], [1, 2]], // entry: recruit -> r1[0,1]; boost -> r1[1,2]
  [[0], [0, 1], [1]], // row 1 -> the two pre-boss nodes
  [[0], [0]], // pre-boss -> boss
];

const COMBAT: ReadonlySet<MapNodeType> = new Set<MapNodeType>(['game', 'elite', 'boss']);

/** Weighted random interior type, game-heavy; elites only from the second map. */
function randomInteriorType(mapIndex: number, rng: RNG): MapNodeType {
  const entries: [MapNodeType, number][] = [
    ['game', 6],
    ['elite', mapIndex >= 1 ? 2 : 0],
    ['recruit', 2],
    ['boost', 1],
    ['rest', 1],
    ['training', 2],
  ];
  return rng.weightedPick(entries);
}

/** Pinned types: entry [recruit, boost], the pre-boss rest, and the boss. */
function pinnedType(layer: number, index: number, restSlot: number): MapNodeType | null {
  if (layer === 0) return index === 0 ? 'recruit' : 'boost';
  if (layer === BOSS_ROW) return 'boss';
  if (layer === PRE_BOSS_ROW && index === restSlot) return 'rest';
  return null;
}

/** Difficulty round for a combat node: games scale by map, the boss peaks above. */
function roundFor(type: MapNodeType, mapIndex: number): number | undefined {
  if (!COMBAT.has(type)) return undefined;
  return type === 'boss' ? mapIndex + 2 : mapIndex + 1;
}

export function generateFixedMap(config: FixedMapConfig): RunMap {
  const { mapIndex } = config;
  const rng = createRNG(config.seed);
  const nodes: Record<string, MapNode> = {};
  const layers: string[][] = [];

  // Draw the guaranteed pre-boss rest slot first so the type draws below stay
  // in a stable order for a given seed.
  const restSlot = rng.int(0, ROW_SIZES[PRE_BOSS_ROW] - 1);

  for (let layer = 0; layer < ROW_SIZES.length; layer++) {
    const ids: string[] = [];
    for (let index = 0; index < ROW_SIZES[layer]; index++) {
      const id = `m${mapIndex}-n-${layer}-${index}`;
      const type = pinnedType(layer, index, restSlot) ?? randomInteriorType(mapIndex, rng);
      nodes[id] = {
        id,
        type,
        layer,
        next: [],
        round: roundFor(type, mapIndex),
        visited: false,
        cleared: false,
      };
      ids.push(id);
    }
    layers.push(ids);
  }

  // Wire the fixed edges between consecutive rows.
  for (let layer = 0; layer < EDGES.length; layer++) {
    EDGES[layer].forEach((targets, i) => {
      nodes[layers[layer][i]].next = targets.map((j) => layers[layer + 1][j]);
    });
  }

  return {
    nodes,
    layers,
    startNodeIds: layers[0],
    bossNodeId: layers[BOSS_ROW][0],
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

/** Advance within a map: clear the current node and move to the chosen next node. */
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
