import { useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text } from '@/components/StyledText';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import { mix } from '@/theme/color';
import { useGlowPulse, useScalePulse } from '@/feel';
import { previewOpponent } from '@/game/opponent-preview';
import { NodeIcon } from './PixelIcons';
import { NODE_META } from './node-meta';
import { NODE_SIZE, nodeCenterX, nodeTop } from './map-geometry';
import type { MapNode, MapNodeType, RunState } from '@/types/run-map';

/**
 * A single run-map node: an opaque pixel tile with its type icon. Combat tiles
 * (game/elite/boss) are tinted with the franchise they will field and labeled
 * with that team's abbreviation, previewed deterministically so the tile never
 * lies about the matchup. Reachable tiles glow and pulse; the current tile fills
 * gold; cleared tiles dim and show a check; locked tiles dim but still show the
 * icon so the player can scout the road ahead.
 */

const COMBAT: MapNodeType[] = ['game', 'elite', 'boss'];

const ICON_COLOR: Record<MapNodeType, string> = {
  game: palette.orange,
  elite: palette.orange,
  boss: palette.gold,
  recruit: palette.steelBlue,
  training: palette.makeGreen,
  rest: palette.gold,
  boost: palette.chrome,
};

interface MapNodeTileProps {
  node: MapNode;
  index: number;
  count: number;
  seed: RunState['seed'];
  isReachable: boolean;
  isCurrent: boolean;
  onChoose: (nodeId: string) => void;
}

export function MapNodeTile({
  node,
  index,
  count,
  seed,
  isReachable,
  isCurrent,
  onChoose,
}: MapNodeTileProps) {
  const meta = NODE_META[node.type];
  const isCombat = COMBAT.includes(node.type);
  // Only reachable tiles breathe; the rest hold steady (no loop) so an idle map costs nothing.
  const glowStyle = useGlowPulse(900, { paused: !isReachable });
  const scaleStyle = useScalePulse(900, { paused: !isReachable });

  const preview = useMemo(
    () => (isCombat ? previewOpponent(seed, node.id) : null),
    [isCombat, seed, node.id]
  );

  const round = node.round ?? node.layer + 1;
  const labelText = preview ? preview.abbreviation : meta.label;
  const fill = preview ? mix(palette.bgPanel, preview.primaryHex, 0.22) : palette.bgPanel;

  const borderColor =
    isCurrent || isReachable
      ? palette.gold
      : node.cleared
        ? palette.inkDim
        : meta.color;

  const opacity = isCurrent || isReachable ? 1 : node.cleared ? 0.5 : 0.35;

  return (
    <View
      style={[
        styles.cell,
        { left: nodeCenterX(index, count) - NODE_SIZE / 2, top: nodeTop(node.layer) },
      ]}
    >
      <Animated.View style={[styles.tileWrap, isReachable && scaleStyle]}>
        {isReachable ? <Animated.View style={[styles.glow, glowStyle]} /> : null}
        <Pressable
          disabled={!isReachable}
          onPress={() => onChoose(node.id)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityState={{ disabled: !isReachable }}
          accessibilityLabel={`${meta.label}${preview ? ` vs ${preview.city} ${preview.name}` : ''}${isCurrent ? ', you are here' : isReachable ? ', reachable' : node.cleared ? ', cleared' : ', locked'}`}
          style={[
            styles.tile,
            {
              backgroundColor: isCurrent ? palette.gold + '33' : fill,
              borderColor,
              opacity,
            },
          ]}
        >
          <NodeIcon type={node.type} size={NODE_SIZE * 0.46} color={ICON_COLOR[node.type]} />
          {isCombat ? (
            <View style={styles.roundBadge}>
              <Text style={styles.roundText}>R{round}</Text>
            </View>
          ) : null}
          {node.cleared ? (
            <View style={styles.checkBadge}>
              <Text style={styles.checkText}>{'✓'}</Text>
            </View>
          ) : null}
        </Pressable>
      </Animated.View>
      <Text
        style={[styles.label, { color: node.cleared ? palette.inkDim : meta.color }]}
        numberOfLines={1}
      >
        {labelText}
      </Text>
    </View>
  );
}

const GLOW_PAD = 5;

const styles = StyleSheet.create({
  cell: {
    position: 'absolute',
    width: NODE_SIZE,
    alignItems: 'center',
  },
  tileWrap: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    top: -GLOW_PAD,
    left: -GLOW_PAD,
    width: NODE_SIZE + GLOW_PAD * 2,
    height: NODE_SIZE + GLOW_PAD * 2,
    borderWidth: BORDER.chunk,
    borderColor: palette.gold,
    borderRadius: RADIUS.chip,
  },
  tile: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderWidth: BORDER.chunk,
    borderRadius: RADIUS.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundBadge: {
    position: 'absolute',
    top: 2,
    left: 2,
    paddingHorizontal: 2,
    backgroundColor: palette.bgPanel,
    borderRadius: RADIUS.chip,
  },
  roundText: {
    fontFamily: FONT.display,
    fontSize: 7,
    color: palette.inkDim,
  },
  checkBadge: {
    position: 'absolute',
    top: 1,
    right: 2,
  },
  checkText: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.makeGreen,
  },
  label: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.micro,
    marginTop: space(1),
  },
});
