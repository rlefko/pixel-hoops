import { useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text } from '@/components/StyledText';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import { mix } from '@/theme/color';
import { useGlowPulse, useScalePulse } from '@/feel';
import { previewOpponent } from '@/game/opponent-preview';
import { NodeIcon, FlameIcon, CrownIcon } from './PixelIcons';
import { TeamLogo } from './TeamLogo';
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
  /** Hold the reachable-tile breathe steady while the player is idle on the map. */
  paused?: boolean;
}

export function MapNodeTile({
  node,
  index,
  count,
  seed,
  isReachable,
  isCurrent,
  onChoose,
  paused = false,
}: MapNodeTileProps) {
  const meta = NODE_META[node.type];
  const isCombat = COMBAT.includes(node.type);
  // Only reachable tiles breathe, and even those hold steady while the map sits idle,
  // so a still map costs zero loops.
  const glowStyle = useGlowPulse(900, { paused: !isReachable || paused });
  const scaleStyle = useScalePulse(900, { paused: !isReachable || paused });

  const preview = useMemo(
    () => (isCombat ? previewOpponent(seed, node.id) : null),
    [isCombat, seed, node.id]
  );

  const round = node.round ?? node.layer + 1;
  // A played combat node stamps a W/L and its final score inside the tile; the label
  // below keeps the opponent abbreviation so the map still reads as a history. result
  // is only ever set on combat nodes.
  const result = isCombat ? node.result : undefined;
  const played = !!result;
  const resultColor =
    result && (result.won ? palette.makeGreen : palette.missRed);
  const labelText = preview ? preview.abbreviation : meta.label;
  const labelColor = node.cleared ? palette.inkDim : meta.color;
  const fill = preview
    ? mix(palette.bgPanel, preview.primaryHex, 0.22)
    : palette.bgPanel;

  const borderColor =
    isCurrent || isReachable
      ? palette.gold
      : node.cleared
        ? palette.inkDim
        : meta.color;

  // Played tiles stay brighter than other cleared tiles so the W/L stamp reads.
  const opacity =
    isCurrent || isReachable ? 1 : played ? 0.85 : node.cleared ? 0.5 : 0.35;

  return (
    <View
      style={[
        styles.cell,
        {
          left: nodeCenterX(index, count) - NODE_SIZE / 2,
          top: nodeTop(node.layer),
        },
      ]}
    >
      <Animated.View style={[styles.tileWrap, isReachable && scaleStyle]}>
        {isReachable ? (
          <Animated.View style={[styles.glow, glowStyle]} />
        ) : null}
        <Pressable
          disabled={!isReachable}
          onPress={() => onChoose(node.id)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityState={{ disabled: !isReachable }}
          accessibilityLabel={`${meta.label}${preview ? ` vs ${preview.city} ${preview.name}` : ''}${result ? `, ${result.won ? 'won' : 'lost'} ${result.home} to ${result.away}` : isCurrent ? ', you are here' : isReachable ? ', reachable' : node.cleared ? ', cleared' : ', locked'}`}
          style={[
            styles.tile,
            {
              backgroundColor: isCurrent ? palette.gold + '33' : fill,
              borderColor,
              opacity,
            },
          ]}
        >
          {isCombat && preview ? (
            <>
              <TeamLogo
                abbr={preview.abbreviation}
                size={LOGO_SIZE}
                opacity={result ? 0.3 : 1}
              />
              {result ? (
                <View style={styles.resultOverlay}>
                  <Text style={[styles.resultStamp, { color: resultColor }]}>
                    {result.won ? 'W' : 'L'}
                  </Text>
                  <Text
                    style={[styles.resultScore, { color: resultColor }]}
                    numberOfLines={1}
                  >
                    {result.home}-{result.away}
                  </Text>
                </View>
              ) : null}
            </>
          ) : (
            <NodeIcon
              type={node.type}
              size={NODE_SIZE * 0.46}
              color={ICON_COLOR[node.type]}
            />
          )}
          {/* Elite/boss combat tiles keep a small tier mark so danger still reads
              now that the center is the opponent's logo. */}
          {node.type === 'elite' || node.type === 'boss' ? (
            <View style={styles.tierBadge}>
              {node.type === 'boss' ? (
                <CrownIcon size={TIER_MARK} color={palette.gold} />
              ) : (
                <FlameIcon size={TIER_MARK} color={palette.orange} />
              )}
            </View>
          ) : null}
          {isCombat && !played ? (
            <View style={styles.roundBadge}>
              <Text style={styles.roundText}>R{round}</Text>
            </View>
          ) : null}
          {node.cleared && !played ? (
            <View style={styles.checkBadge}>
              <Text style={styles.checkText}>{'✓'}</Text>
            </View>
          ) : null}
        </Pressable>
      </Animated.View>
      <Text style={[styles.label, { color: labelColor }]} numberOfLines={1}>
        {labelText}
      </Text>
    </View>
  );
}

const GLOW_PAD = 5;
// Logos read a touch larger than the old basketball glyph (NODE_SIZE * 0.46).
const LOGO_SIZE = NODE_SIZE * 0.62;
// px, the small elite/boss corner mark that keeps the danger tier legible.
const TIER_MARK = 13;

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
  // The W/L + score stack, centered over the dimmed logo and filling the whole tile
  // so a 3-3 digit score has the full tile width to fit on one line.
  resultOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultStamp: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h3,
    textShadowColor: palette.bgDeep,
    textShadowRadius: 2,
    textShadowOffset: { width: 0, height: 1 },
  },
  resultScore: {
    fontFamily: FONT.body,
    fontSize: 9,
    marginTop: 1,
    textShadowColor: palette.bgDeep,
    textShadowRadius: 2,
    textShadowOffset: { width: 0, height: 1 },
  },
  tierBadge: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    padding: 1,
    backgroundColor: palette.bgPanel + 'CC',
    borderRadius: RADIUS.chip,
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
