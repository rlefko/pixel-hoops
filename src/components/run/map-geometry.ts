import { Dimensions } from 'react-native';
import { space } from '@/theme';
import type { RunMap } from '@/types/run-map';

/**
 * Layout math for the run map, shared by the board, the dotted-path renderer,
 * the node tiles, and the position marker so geometry lives in one place. Nodes
 * sit on a fixed-width board; a layer of N nodes spreads evenly at
 * x = W * (i + 1) / (N + 1). Edges are inset past the node radius so the dotted
 * trail occupies only the gap and never crosses a tile.
 */

export const NODE_SIZE = 56;
export const NODE_RADIUS = NODE_SIZE / 2;
export const LABEL_H = 14;
const CELL_H = NODE_SIZE + LABEL_H;
const CONNECTOR_H = space(8); // vertical gap the dotted path spans
export const ROW_PITCH = CELL_H + CONNECTOR_H;
export const COLUMNS = 3; // widest a middle layer gets (see run-map width)
/** Top padding so the marker and entry banner have room and never clip. */
export const BOARD_HEADROOM = space(11);
/** Keep the spacing between edges and tiles. */
const EDGE_GAP = space(1.5);
/** Horizontal breathing room budgeted per column around each tile. */
const COLUMN_GUTTER = 30;

/** Board width, capped to the device so a 3-wide layer never overflows. */
export const BOARD_WIDTH = Math.min(
  COLUMNS * (NODE_SIZE + COLUMN_GUTTER),
  Dimensions.get('window').width - space(10)
);

/** Horizontal center of node `index` within a layer of `count` nodes. */
export function nodeCenterX(index: number, count: number): number {
  return (BOARD_WIDTH * (index + 1)) / (count + 1);
}

/** Vertical center of a node in `layer`. */
export function nodeCenterY(layer: number): number {
  return BOARD_HEADROOM + layer * ROW_PITCH + NODE_SIZE / 2;
}

/** Top edge (for absolute tile placement) of a node in `layer`. */
export function nodeTop(layer: number): number {
  return BOARD_HEADROOM + layer * ROW_PITCH;
}

/** Total scrollable board height for `layerCount` layers. */
export function boardHeight(layerCount: number): number {
  return BOARD_HEADROOM + layerCount * ROW_PITCH + LABEL_H + space(4);
}

export type EdgeState = 'reachable' | 'traveled' | 'dim';

export interface Edge {
  key: string;
  /** Inset start/end so dots stay in the gap between tiles. */
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  gapLen: number;
  state: EdgeState;
}

/**
 * Build the dotted-path segments between every node and each of its `next`
 * nodes, inset past the node radius and tagged with their state so the UI can
 * light the reachable branches, dim the future ones, and mark the walked path.
 */
export function buildEdges(
  map: RunMap,
  currentNodeId: string | null,
  cleared: Set<string>
): Edge[] {
  const edges: Edge[] = [];
  map.layers.forEach((layer, li) => {
    if (li >= map.layers.length - 1) return;
    const nextLayer = map.layers[li + 1];
    layer.forEach((id, i) => {
      const node = map.nodes[id];
      const x1 = nodeCenterX(i, layer.length);
      const y1 = nodeCenterY(li);
      for (const targetId of node.next) {
        const j = nextLayer.indexOf(targetId);
        if (j < 0) continue;
        const x2 = nodeCenterX(j, nextLayer.length);
        const y2 = nodeCenterY(li + 1);
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const inset = NODE_RADIUS + EDGE_GAP;
        const sx = x1 + ux * inset;
        const sy = y1 + uy * inset;
        const ex = x2 - ux * inset;
        const ey = y2 - uy * inset;

        let state: EdgeState = 'dim';
        if (id === currentNodeId) state = 'reachable';
        else if (cleared.has(id) && (cleared.has(targetId) || targetId === currentNodeId))
          state = 'traveled';

        edges.push({
          key: `${id}->${targetId}`,
          sx,
          sy,
          ex,
          ey,
          gapLen: Math.hypot(ex - sx, ey - sy),
          state,
        });
      }
    });
  });
  return edges;
}
