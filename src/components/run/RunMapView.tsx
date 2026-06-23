import { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Text } from '@/components/StyledText';
import { Scanlines } from '@/components/fx';
import { getReachableNodes } from '@/game/run-map';
import { NODE_META } from './node-meta';
import { ArenaBackdrop } from './ArenaBackdrop';
import { DottedPath } from './DottedPath';
import { MapNodeTile } from './MapNodeTile';
import { PositionMarker, EntryBanner } from './PositionMarker';
import { ResourceHeader } from './ResourceHeader';
import { RosterStrip } from './RosterStrip';
import { BoostRow } from './BoostRow';
import {
  BOARD_WIDTH,
  ROW_PITCH,
  boardHeight,
  buildEdges,
  nodeCenterX,
} from './map-geometry';
import { palette, FONT, FONT_SIZE, space } from '@/theme';
import type { MapNodeType, RunState } from '@/types/run-map';
import type { PassiveBoost } from '@/game/boosts';

/** The branching run map: tap a reachable node to play it. */

interface RunMapViewProps {
  core: RunState;
  /** Equipped passive boosts, shown in the HUD pill and the boost row. */
  boosts: PassiveBoost[];
  onChoose: (nodeId: string) => void;
  onQuit: () => void;
  /** Opens the lineup builder from the roster strip (optional). */
  onOpenLineup?: () => void;
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

export function RunMapView({ core, boosts, onChoose, onQuit, onOpenLineup }: RunMapViewProps) {
  const reachable = useMemo(
    () =>
      new Set(getReachableNodes(core.map, core.currentNodeId).map((n) => n.id)),
    [core.map, core.currentNodeId]
  );

  const edges = useMemo(() => {
    const cleared = new Set(
      Object.values(core.map.nodes)
        .filter((n) => n.cleared)
        .map((n) => n.id)
    );
    return buildEdges(core.map, core.currentNodeId, cleared);
  }, [core.map, core.currentNodeId]);

  const height = boardHeight(core.map.layers.length);
  const currentLayer =
    core.currentNodeId != null
      ? core.map.nodes[core.currentNodeId]?.layer ?? null
      : null;
  const round = currentLayer != null ? currentLayer + 1 : 1;

  const scrollRef = useRef<ScrollView>(null);
  // Keep the player's position in view as they advance (top while choosing entry).
  useEffect(() => {
    const y =
      currentLayer == null ? 0 : Math.max(0, currentLayer * ROW_PITCH - ROW_PITCH);
    scrollRef.current?.scrollTo({ y, animated: true });
  }, [currentLayer]);

  // The current node's screen position, for the "you are here" marker.
  const currentMarker = useMemo(() => {
    if (core.currentNodeId == null) return null;
    const node = core.map.nodes[core.currentNodeId];
    if (!node) return null;
    const layerIds = core.map.layers[node.layer];
    const index = layerIds.indexOf(node.id);
    return { centerX: nodeCenterX(index, layerIds.length), layer: node.layer };
  }, [core.map, core.currentNodeId]);

  return (
    <View style={styles.container}>
      <ResourceHeader
        rewards={core.rewards}
        round={round}
        totalRounds={core.map.layers.length}
        boostCount={boosts.length}
      />
      <BoostRow boosts={boosts} />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.board, { width: BOARD_WIDTH, height }]}>
          <ArenaBackdrop width={BOARD_WIDTH} height={height} />

          {edges.map((edge) => (
            <DottedPath key={edge.key} edge={edge} />
          ))}

          {core.currentNodeId == null ? <EntryBanner width={BOARD_WIDTH} /> : null}

          {core.map.layers.map((layer) =>
            layer.map((id, i) => {
              const node = core.map.nodes[id];
              return (
                <MapNodeTile
                  key={id}
                  node={node}
                  index={i}
                  count={layer.length}
                  seed={core.seed}
                  isReachable={reachable.has(id)}
                  isCurrent={core.currentNodeId === id}
                  onChoose={onChoose}
                />
              );
            })
          )}

          {currentMarker ? (
            <PositionMarker centerX={currentMarker.centerX} layer={currentMarker.layer} />
          ) : null}
        </View>
      </ScrollView>

      <View style={styles.legend}>
        {LEGEND.map((t) => (
          <Text key={t} style={[styles.legendItem, { color: NODE_META[t].color }]}>
            {NODE_META[t].label}
          </Text>
        ))}
      </View>

      <RosterStrip roster={core.roster} onPress={onOpenLineup} />

      <Pressable onPress={onQuit}>
        <Text style={styles.quit}>Quit Run</Text>
      </Pressable>

      <Scanlines />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bgDeep },
  scroll: { alignItems: 'center', paddingVertical: space(3) },
  board: { position: 'relative' },
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
    paddingVertical: space(2),
  },
});
