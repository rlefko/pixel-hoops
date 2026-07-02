import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Scanlines } from '@/components/fx';
import { getReachableNodes } from '@/game/run-map';
import { TOTAL_MAPS } from '@/game/run-machine';
import { NODE_META } from './node-meta';
import { ArenaBackdrop } from './ArenaBackdrop';
import { DottedPath } from './DottedPath';
import { MapNodeTile } from './MapNodeTile';
import { PositionMarker, EntryBanner } from './PositionMarker';
import { ResourceHeader } from './ResourceHeader';
import {
  DIFFICULTY_LABELS,
  type Difficulty,
  type LadderClass,
} from '@/game/difficulty-mode';
import { useHomeRoster } from '@/context/HomeRosterContext';
import { crowdDensityFor } from '@/components/fx/pixelCrowdLayout';
import { useIdle, HUB_IDLE_MS } from '@/feel';
import { useCourtTheme } from '@/hooks/useCourtTheme';
import { RosterStrip } from './RosterStrip';
import { BoostRow } from './BoostRow';
import { SetRow } from './SetRow';
import { GearIcon } from './PixelIcons';
import { RunSettingsModal } from './RunSettingsModal';
import {
  BOARD_WIDTH,
  ROW_PITCH,
  boardHeight,
  buildEdges,
  nodeCenterX,
} from './map-geometry';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import type { MapNodeType, RunState } from '@/types/run-map';
import type { PassiveBoost } from '@/game/boosts';

/** The branching run map: tap a reachable node to play it. */

/** The scroll offset that puts a layer's position in view (top while choosing entry). */
function layerScrollY(layer: number | null): number {
  return layer == null ? 0 : Math.max(0, layer * ROW_PITCH - ROW_PITCH);
}

interface RunMapViewProps {
  core: RunState;
  /** Equipped passive boosts, shown in the HUD pill and the boost row. */
  boosts: PassiveBoost[];
  /** The run's difficulty + ladder class, shown in the HUD badge. */
  difficulty: Difficulty;
  ladderClass: LadderClass;
  /** Forgiven losses ("timeouts") left in the run, shown in the HUD. */
  timeouts: number;
  /** The run's win streak, for the HUD's run-heat flame chip. */
  wins: number;
  /** Number of items in the run bag, shown on the Bag button. */
  bagCount: number;
  onChoose: (nodeId: string) => void;
  /** Suspend the run and return home; the run stays saved and resumable. */
  onLeave: () => void;
  /** Opens the lineup builder from the roster strip (optional). */
  onOpenLineup?: () => void;
  /** Opens the item bag. */
  onOpenBag: () => void;
}

const LEGEND: MapNodeType[] = [
  'game',
  'elite',
  'recruit',
  'training',
  'rest',
  'boost',
  'boss',
];

export function RunMapView({
  core,
  boosts,
  difficulty,
  ladderClass,
  timeouts,
  wins,
  bagCount,
  onChoose,
  onLeave,
  onOpenLineup,
  onOpenBag,
}: RunMapViewProps) {
  // Coins bank as-earned into the wallet, so the HUD shows the live home total.
  const { homeRoster } = useHomeRoster();
  // Quiet the map's ambient loops (crowd shimmer, position bob, reachable-node breathe,
  // entry-banner glow) after a stretch of no touch, like the hub screens; the next touch
  // wakes them. The map is a screen the player stares at while choosing a node.
  const { idle, bump } = useIdle(HUB_IDLE_MS);
  const courtTheme = useCourtTheme();
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
  // The last map is the championship stage: packed stands and a gold frame.
  const finale = core.currentMapIndex >= TOTAL_MAPS - 1;
  const currentLayer =
    core.currentNodeId != null
      ? (core.map.nodes[core.currentNodeId]?.layer ?? null)
      : null;

  const scrollRef = useRef<ScrollView>(null);
  // The map must LAND already in position and interactive, never sweep to it: the view
  // remounts on every return from a game, and during an animated scrollTo a tap cancels
  // the scroll instead of reaching the node's Pressable, so a sweep eats the first tap
  // (worst after late-map elite/boss games, whose sweep is longest). A layout effect
  // issues the jump inside the mount commit, before the first frame paints. Jumping via
  // the ref (not a contentOffset prop) leaves the ScrollView uncontrolled, so re-renders
  // can never snap a manually scrolled map back.
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ y: layerScrollY(currentLayer), animated: false });
  }, [currentLayer]);

  // Leaving suspends the run (it auto-saves as you climb), so this is lossless and
  // resumable. A light confirm just guards against a stray back-tap mid-run. A custom
  // dialog (not Alert.alert, which has no working buttons on web).
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  // Settings open as an overlay here (not a route push) so the run survives.
  const [showSettings, setShowSettings] = useState(false);

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
    <Screen
      onBack={() => setConfirmingLeave(true)}
      backLabel="LEAVE"
      onTouchStart={bump}
    >
      <ResourceHeader
        rewards={core.rewards}
        walletCoins={homeRoster?.coins ?? 0}
        mapNumber={core.currentMapIndex + 1}
        totalMaps={TOTAL_MAPS}
        boostCount={boosts.length}
        timeouts={timeouts}
        modeLabel={`${DIFFICULTY_LABELS[difficulty].name} · ${ladderClass}`}
        wins={wins}
        paused={idle}
      />
      <BoostRow boosts={boosts} />
      <SetRow five={core.roster.starters} boosts={boosts} />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.board, { width: BOARD_WIDTH, height }]}>
          {/* The stands scale with the bracket: seats fill in as the run climbs and
              the final map seats a second row under a gold frame. */}
          <ArenaBackdrop
            width={BOARD_WIDTH}
            height={height}
            paused={idle}
            floorColor={courtTheme.floor}
            plankColor={courtTheme.plank}
            frameColor={finale ? palette.gold : courtTheme.line}
            crowdDensity={crowdDensityFor(core.currentMapIndex, TOTAL_MAPS)}
            crowdRows={finale ? 2 : 1}
            crowdSeed={`${core.seed}-crowd-${core.currentMapIndex}`}
          />

          {edges.map((edge) => (
            <DottedPath key={edge.key} edge={edge} />
          ))}

          {core.currentNodeId == null ? (
            <EntryBanner width={BOARD_WIDTH} paused={idle} />
          ) : null}

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
                  // Unreachable tiles never animate, so folding reachability in here
                  // keeps their prop a constant `true`: idle wake-ups (which race the
                  // very tap they precede) re-render only the 2-3 breathing tiles.
                  paused={idle || !reachable.has(id)}
                />
              );
            })
          )}

          {currentMarker ? (
            <PositionMarker
              centerX={currentMarker.centerX}
              layer={currentMarker.layer}
              paused={idle}
            />
          ) : null}
        </View>
      </ScrollView>

      <View style={styles.legend}>
        {LEGEND.map((t) => (
          <Text
            key={t}
            style={[styles.legendItem, { color: NODE_META[t].color }]}
          >
            {NODE_META[t].label}
          </Text>
        ))}
      </View>

      <View style={styles.actions}>
        <Pressable
          style={styles.bagButton}
          onPress={onOpenBag}
          accessibilityRole="button"
        >
          <Text style={styles.bagText}>BAG ({bagCount})</Text>
        </Pressable>
        <Pressable
          style={styles.gearButton}
          onPress={() => setShowSettings(true)}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          hitSlop={space(2)}
        >
          <GearIcon size={18} color={palette.gold} />
        </Pressable>
      </View>

      <RosterStrip roster={core.roster} onPress={onOpenLineup} />

      <Scanlines />

      <ConfirmDialog
        visible={confirmingLeave}
        title="LEAVE RUN?"
        message="Your run is saved. Resume anytime from the home screen."
        confirmLabel="LEAVE"
        onConfirm={() => {
          setConfirmingLeave(false);
          onLeave();
        }}
        onCancel={() => setConfirmingLeave(false)}
      />

      <RunSettingsModal
        visible={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(3),
    paddingBottom: space(1),
  },
  bagButton: {
    paddingVertical: space(1.5),
    paddingHorizontal: space(5),
    borderWidth: BORDER.thin,
    borderColor: palette.gold + '88',
    borderRadius: RADIUS.chip,
    backgroundColor: palette.bgPanel,
  },
  bagText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.small,
    color: palette.gold,
  },
  gearButton: {
    paddingVertical: space(1),
    paddingHorizontal: space(3),
    borderWidth: BORDER.thin,
    borderColor: palette.gold + '88',
    borderRadius: RADIUS.chip,
    backgroundColor: palette.bgPanel,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
