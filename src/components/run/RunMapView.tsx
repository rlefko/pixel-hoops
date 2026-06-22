import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Text } from '@/components/StyledText';
import { Scanlines } from '@/components/fx';
import { getReachableNodes } from '@/game/run-map';
import { NODE_META } from './node-meta';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import type { MapNodeType, RunState } from '@/types/run-map';

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

export function RunMapView({ core, onChoose, onQuit }: RunMapViewProps) {
  const reachable = new Set(
    getReachableNodes(core.map, core.currentNodeId).map((n) => n.id)
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>THE RUN</Text>
        <Text style={styles.rewards}>
          {core.rewards.coins}c · {core.rewards.reputation}rep
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {core.map.layers.map((layer, li) => (
          <View key={li}>
            <View style={styles.layer}>
              {layer.map((id) => {
                const node = core.map.nodes[id];
                const meta = NODE_META[node.type];
                const isReachable = reachable.has(id);
                const isCurrent = core.currentNodeId === id;
                return (
                  <Pressable
                    key={id}
                    disabled={!isReachable}
                    onPress={() => onChoose(id)}
                    style={[
                      styles.node,
                      { borderColor: meta.color },
                      isReachable ? styles.reachable : styles.dim,
                      node.cleared && styles.cleared,
                      isCurrent && styles.current,
                    ]}
                  >
                    <Text style={[styles.glyph, { color: meta.color }]}>
                      {node.cleared ? '✓' : meta.glyph}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {li < core.map.layers.length - 1 ? (
              <View style={styles.connector}>
                <View style={styles.connectorLine} />
              </View>
            ) : null}
          </View>
        ))}
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

const NODE_SIZE = 44;

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
  scroll: { alignItems: 'center', paddingVertical: space(2) },
  layer: { flexDirection: 'row', justifyContent: 'center', gap: space(3) },
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
  reachable: { opacity: 1 },
  dim: { opacity: 0.3 },
  cleared: { opacity: 0.5 },
  current: { borderColor: palette.gold, backgroundColor: palette.gold + '22' },
  connector: {
    height: space(4),
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectorLine: {
    width: BORDER.chunk,
    height: space(4),
    backgroundColor: palette.gridLine,
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
