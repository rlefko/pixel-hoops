import { useEffect, useRef } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Text } from '@/components/StyledText';
import { Scanlines } from '@/components/fx';
import { getReachableNodes } from '@/game/run-map';
import { NODE_META } from './node-meta';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import type { MapNode, MapNodeType, RunState } from '@/types/run-map';

/** The branching run map: tap a reachable node to play it. */

interface RunMapViewProps {
  core: RunState;
  onChoose: (nodeId: string) => void;
  onQuit: () => void;
}

const LEGEND: MapNodeType[] = [
  'game',
  'elite',
  'recruit',
  'training',
  'rest',
  'shop',
  'boss',
];

// Board geometry. Nodes are placed on a fixed-width board so we can draw real
// edges between connected nodes (not one generic line per gap). A layer with N
// nodes spreads them evenly across the board at x = W * (i + 1) / (N + 1).
const NODE_SIZE = 52;
const LABEL_H = 14;
const CELL_H = NODE_SIZE + LABEL_H; // node + its type label
const CONNECTOR_H = space(7); // vertical gap that the edges span
const ROW_PITCH = CELL_H + CONNECTOR_H;
const COLUMNS = 3; // widest a middle layer gets (see run-map width)
const BOARD_WIDTH = COLUMNS * (NODE_SIZE + 28); // 240
const LABEL_W = 100; // width of the "YOU ARE HERE" marker over a node

/** Horizontal center of node `index` within a layer of `count` nodes. */
function nodeCenterX(index: number, count: number): number {
  return (BOARD_WIDTH * (index + 1)) / (count + 1);
}

/** Vertical center of a node in `layer`. */
function nodeCenterY(layer: number): number {
  return layer * ROW_PITCH + NODE_SIZE / 2;
}

interface Edge {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  active: boolean;
}

/** Build the line segments connecting every node to each of its next nodes. */
function buildEdges(map: RunState['map'], currentNodeId: string | null): Edge[] {
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
        edges.push({
          key: `${id}->${targetId}`,
          x1,
          y1,
          x2: nodeCenterX(j, nextLayer.length),
          y2: nodeCenterY(li + 1),
          // Light up the edges leaving the node you can move from.
          active: id === currentNodeId,
        });
      }
    });
  });
  return edges;
}

/** A single edge rendered as a thin, rotated View centered on its midpoint. */
function EdgeLine({ edge }: { edge: Edge }) {
  const dx = edge.x2 - edge.x1;
  const dy = edge.y2 - edge.y1;
  const length = Math.hypot(dx, dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.edge,
        edge.active && styles.edgeActive,
        {
          width: length,
          left: (edge.x1 + edge.x2) / 2 - length / 2,
          top: (edge.y1 + edge.y2) / 2,
          transform: [{ rotate: `${angle}deg` }],
        },
      ]}
    />
  );
}

interface MapNodeButtonProps {
  node: MapNode;
  index: number;
  count: number;
  isReachable: boolean;
  isCurrent: boolean;
  onChoose: (nodeId: string) => void;
}

function MapNodeButton({
  node,
  index,
  count,
  isReachable,
  isCurrent,
  onChoose,
}: MapNodeButtonProps) {
  const meta = NODE_META[node.type];
  return (
    <View
      style={[
        styles.cell,
        { left: nodeCenterX(index, count) - NODE_SIZE / 2, top: node.layer * ROW_PITCH },
      ]}
    >
      {isCurrent ? <Text style={styles.youAreHere}>YOU ARE HERE</Text> : null}
      <Pressable
        disabled={!isReachable}
        onPress={() => onChoose(node.id)}
        hitSlop={6}
        style={[
          styles.node,
          { borderColor: meta.color },
          isReachable ? styles.reachable : styles.dim,
          node.cleared && styles.cleared,
          isReachable && styles.reachableHalo,
          isCurrent && styles.current,
        ]}
      >
        <Text style={[styles.glyph, { color: meta.color }]}>
          {node.cleared ? '✓' : meta.glyph}
        </Text>
      </Pressable>
      <Text style={[styles.nodeLabel, { color: meta.color }]} numberOfLines={1}>
        {meta.label}
      </Text>
    </View>
  );
}

export function RunMapView({ core, onChoose, onQuit }: RunMapViewProps) {
  const reachable = new Set(
    getReachableNodes(core.map, core.currentNodeId).map((n) => n.id)
  );
  const edges = buildEdges(core.map, core.currentNodeId);
  const boardHeight = core.map.layers.length * ROW_PITCH;

  const scrollRef = useRef<ScrollView>(null);

  // Keep the player's current position in view as they advance the run.
  const currentLayer =
    core.currentNodeId != null ? core.map.nodes[core.currentNodeId]?.layer : null;
  useEffect(() => {
    if (currentLayer == null) return;
    const y = Math.max(0, currentLayer * ROW_PITCH - ROW_PITCH);
    scrollRef.current?.scrollTo({ y, animated: true });
  }, [currentLayer]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>THE RUN</Text>
        <Text style={styles.rewards}>
          {core.rewards.coins}c · {core.rewards.reputation}rep
        </Text>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.board, { width: BOARD_WIDTH, height: boardHeight }]}>
          {edges.map((edge) => (
            <EdgeLine key={edge.key} edge={edge} />
          ))}
          {core.map.layers.map((layer) =>
            layer.map((id, i) => {
              const node = core.map.nodes[id];
              return (
                <MapNodeButton
                  key={id}
                  node={node}
                  index={i}
                  count={layer.length}
                  isReachable={reachable.has(id)}
                  isCurrent={core.currentNodeId === id}
                  onChoose={onChoose}
                />
              );
            })
          )}
        </View>
      </ScrollView>

      <View style={styles.legend}>
        {LEGEND.map((t) => (
          <Text
            key={t}
            style={[styles.legendItem, { color: NODE_META[t].color }]}
          >
            {NODE_META[t].glyph} {NODE_META[t].label}
          </Text>
        ))}
      </View>

      <Pressable onPress={onQuit}>
        <Text style={styles.quit}>Quit Run</Text>
      </Pressable>

      <Scanlines />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bgDeep },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space(4),
    paddingTop: space(8),
    paddingBottom: space(2),
  },
  title: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.label,
    color: palette.gold,
  },
  rewards: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
  },
  scroll: { alignItems: 'center', paddingVertical: space(3) },
  board: { position: 'relative' },
  edge: {
    position: 'absolute',
    height: BORDER.chunk,
    backgroundColor: palette.gridLine,
  },
  edgeActive: {
    backgroundColor: palette.gold,
    height: BORDER.chunkier,
  },
  cell: {
    position: 'absolute',
    width: NODE_SIZE,
    alignItems: 'center',
  },
  node: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderWidth: BORDER.chunk,
    borderRadius: RADIUS.chip,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.bgPanel,
  },
  glyph: { fontFamily: FONT.display, fontSize: FONT_SIZE.body },
  nodeLabel: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.micro,
    marginTop: space(1),
  },
  reachable: { opacity: 1 },
  reachableHalo: {
    borderColor: palette.gold,
    backgroundColor: palette.gold + '18',
  },
  dim: { opacity: 0.3 },
  cleared: { opacity: 0.5 },
  current: { borderColor: palette.gold, backgroundColor: palette.gold + '33' },
  youAreHere: {
    position: 'absolute',
    top: -space(4),
    width: LABEL_W,
    left: (NODE_SIZE - LABEL_W) / 2,
    textAlign: 'center',
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.gold,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingHorizontal: space(4),
    paddingVertical: space(2),
    gap: space(2),
  },
  legendItem: { fontFamily: FONT.body, fontSize: FONT_SIZE.small },
  quit: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    textAlign: 'center',
    paddingVertical: space(3),
  },
});
