import { useEffect, useRef, type ReactNode } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text } from '@/components/StyledText';
import { PixelPlayer } from '@/components/fx';
import { usePop, usePulse } from '@/feel';
import { InjuryIcon } from '@/components/run/PixelIcons';
import { jerseyNumber, skinIndexFor } from '@/components/game/jersey';
import { POSITION_COLOR } from '@/components/game/positionColor';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import { ovr, off, def, ath, tierFor, classForOvr, CLASS_ORDER, type TierKey } from '@/game/ratings';
import { applyTrainingDelta, MAX_TRAINED_STAT } from '@/game/effects';
import { ITEM_BY_ID } from '@/game/items';
import { getAbility } from '@/game/abilities';
import { getGachaAbility } from '@/game/abilities-gacha';
import { ITEM_RARITY_COLOR } from './item-ui';
import { StatNumber } from './StatNumber';
import { PLAYSTYLE_STAT_KEYS, STAT_NORMAL_MAX, type PlayerStats } from '@/types/player';
import type { RosterPlayer } from '@/types/roster';

/**
 * The arcade-simplicity centerpiece: one reusable surface for a roster player.
 * Collapsed, it shows only the sprite, position, tier, OVR, and three composite
 * chips (OFF/DEF/ATH). The full ten ratings stay one tap away in an expandable
 * panel, grouped so the breakdown reads like a scouting card rather than a wall
 * of numbers. Reused by the lineup builder, recruit, training, and pregame board.
 */

interface PlayerCardProps {
  rp: RosterPlayer;
  /** Whether the full-ratings panel is open (controlled by the parent). */
  expanded?: boolean;
  /** Tapping the chevron toggles expansion; omitted hides the chevron. */
  onToggleExpand?: () => void;
  /** Optional trailing slot (e.g. the lineup slot chip), shown collapsed. */
  right?: ReactNode;
  /** Surface condition: an OUT badge for injured players, dimmed. */
  condition?: boolean;
  /** Layout: a horizontal row (default) or a taller tile for the recruit grid. */
  variant?: 'row' | 'tile';
  /**
   * Slim the card to a single row by dropping the OFF/DEF/ATH chips, for dense
   * lists like the pregame scouting report where OVR + tier is the glance read.
   */
  compact?: boolean;
}

/** Tier key -> palette color for the badge (verified palette keys, no new hex). */
const TIER_COLOR: Record<TierKey, string> = {
  rookie: palette.inkDim, // D: the streetball floor
  bronze: palette.steelBlue, // C
  silver: palette.makeGreen, // B
  gold: palette.gold, // A
  elite: palette.flame, // S
  apex: palette.orange, // S+: legendary tier
  zenith: palette.gold, // S++: animated shining gold, the trained/boss apex
};

/** One rating's short label, for the expanded breakdown grid. */
const RATING_LABEL: Record<keyof PlayerStats, string> = {
  inside: 'INSIDE',
  outside: 'OUTSIDE',
  playmaking: 'PLAYMAKING',
  perimeterD: 'PERIM D',
  interiorD: 'INTERIOR D',
  athleticism: 'ATHLETIC',
  iq: 'IQ',
  clutch: 'CLUTCH',
  stamina: 'STAMINA',
  durability: 'DURABLE',
  blocking: 'BLOCKING',
  stealing: 'STEALING',
  strength: 'STRENGTH',
  rebounding: 'REBOUND',
};

/** The expanded panel's groups, ordered offense -> defense -> physical -> play style.
 * Play style (the two condition stats plus the four intrinsic traits) is grouped
 * last and read-only: these are never trained or upgraded, only recruited. */
const RATING_GROUPS: { label: string; keys: (keyof PlayerStats)[] }[] = [
  { label: 'OFFENSE', keys: ['inside', 'outside', 'playmaking'] },
  { label: 'DEFENSE', keys: ['perimeterD', 'interiorD'] },
  { label: 'PHYSICAL + MENTAL', keys: ['athleticism', 'iq', 'clutch'] },
  { label: 'PLAY STYLE', keys: [...PLAYSTYLE_STAT_KEYS] },
];

export function PlayerCard({
  rp,
  expanded = false,
  onToggleExpand,
  right,
  condition = false,
  variant = 'row',
  compact = false,
}: PlayerCardProps) {
  // Fold run-scoped training into the displayed stats so a trained player reads
  // its true OVR/tier (up to S++) everywhere the card appears.
  const stats = applyTrainingDelta(rp.player.stats, rp.trainingDelta);
  const overall = ovr(stats, rp.position);
  const tier = tierFor(overall);
  const tierColor = TIER_COLOR[tier.key];
  // Show the player's fixed original class with an arrow to the current class when
  // upgrades/abilities/training have lifted them past their starting tier.
  const currentClass = classForOvr(overall);
  const upgradedFrom =
    rp.originalClass && rp.originalClass !== currentClass ? rp.originalClass : null;
  // Celebrate an in-place class promotion (a training/upgrade/reward pushing the
  // player across a grade band): pop the badge when this card's class rises between
  // renders. Initialized to the current class on mount, so a fresh card never pops.
  const classRank = CLASS_ORDER.indexOf(currentClass);
  const prevClassRank = useRef(classRank);
  const leveledUp = classRank > prevClassRank.current;
  useEffect(() => {
    prevClassRank.current = classRank;
  }, [classRank]);
  const injured = condition && (rp.gamesOut ?? 0) > 0;
  const isTile = variant === 'tile';
  const isLegendary = rp.legendary ?? false;
  const itemDef = rp.item ? ITEM_BY_ID[rp.item.defId] : undefined;
  const abilityDef = getAbility(rp.ability);
  const gachaDef = getGachaAbility(rp.equippedAbility?.id);
  // A slow gold breathe behind a legendary's name, so a real great reads as a
  // jackpot wherever the card appears (recruit, lineup, pregame).
  const { glowStyle } = usePulse();

  return (
    <View
      style={[
        styles.card,
        isTile && styles.cardTile,
        compact && styles.cardCompact,
        injured && styles.injured,
      ]}
    >
      <View style={[styles.head, isTile && styles.headTile]}>
        <View style={styles.avatar}>
          <PixelPlayer
            color={palette.homeTeam}
            accent={palette.homeTeamAccent}
            number={rp.jerseyNumber ?? jerseyNumber(rp.player.name)}
            skinIndex={skinIndexFor(rp.player.name)}
            size={26}
          />
        </View>
        <View style={[styles.posChip, { borderColor: POSITION_COLOR[rp.position] }]}>
          <Text style={[styles.pos, { color: POSITION_COLOR[rp.position] }]}>
            {rp.position}
          </Text>
        </View>
        {upgradedFrom ? (
          <Text style={styles.classFrom}>{upgradedFrom}{'→'}</Text>
        ) : null}
        <TierBadge
          label={tier.label}
          color={tierColor}
          animated={tier.key === 'zenith'}
          celebrate={leveledUp}
        />
        <View style={styles.nameCol}>
          {isLegendary ? (
            <Animated.View pointerEvents="none" style={[styles.legendGlow, glowStyle]} />
          ) : null}
          <View style={styles.nameRow}>
            <Text
              style={[styles.name, isLegendary && styles.legendName]}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {rp.player.name}
            </Text>
            {isLegendary ? <Text style={styles.legendStar}>★</Text> : null}
            {itemDef ? (
              <Text style={[styles.itemMark, { color: ITEM_RARITY_COLOR[itemDef.rarity] }]}>
                ◆
              </Text>
            ) : null}
          </View>
          {injured ? (
            <View style={styles.outRow}>
              <InjuryIcon size={10} />
              <Text style={styles.outText}>OUT {rp.gamesOut}</Text>
            </View>
          ) : null}
        </View>
        <StatNumber value={overall} style={styles.ovr} animate={false} />
        {right}
        {onToggleExpand ? (
          <Pressable
            onPress={onToggleExpand}
            hitSlop={space(2)}
            style={styles.chevronBtn}
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Hide ratings' : 'Show ratings'}
          >
            <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
          </Pressable>
        ) : null}
      </View>

      {compact ? null : (
        <View style={styles.chips}>
          <CompositeChip label="OFF" value={off(stats)} />
          <CompositeChip label="DEF" value={def(stats)} />
          <CompositeChip label="ATH" value={ath(stats)} />
        </View>
      )}

      {expanded ? (
        <View style={styles.panel}>
          {abilityDef ? (
            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: palette.gold }]}>SIGNATURE</Text>
              <Text style={styles.metaText}>
                {abilityDef.name}: {abilityDef.blurb}
              </Text>
            </View>
          ) : null}
          {gachaDef ? (
            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: palette.steelBlue }]}>ABILITY</Text>
              <Text style={styles.metaText}>
                {gachaDef.name}: {gachaDef.blurb}
              </Text>
            </View>
          ) : null}
          {itemDef ? (
            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: ITEM_RARITY_COLOR[itemDef.rarity] }]}>
                ITEM
              </Text>
              <Text style={styles.metaText}>
                {itemDef.name}: {itemDef.blurb}
              </Text>
            </View>
          ) : null}
          {RATING_GROUPS.map((group) => (
            <View key={group.label} style={styles.group}>
              <Text style={styles.groupLabel}>{group.label}</Text>
              {group.keys.map((key) => (
                <View key={key} style={styles.ratingRow}>
                  <Text style={styles.ratingLabel}>{RATING_LABEL[key]}</Text>
                  <PipBar value={stats[key]} />
                  <StatNumber value={stats[key]} style={styles.ratingValue} />
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** A small colored tier badge (C/B/A/S/S+/S++). The S++ apex animates a shining
 * gold halo (the legendary breathe), so a fully-trained player reads as a jackpot.
 * On a class promotion (`celebrate`) it scale-punches so the milestone reads. */
function TierBadge({
  label,
  color,
  animated,
  celebrate,
}: {
  label: string;
  color: string;
  animated?: boolean;
  celebrate?: boolean;
}) {
  const { glowStyle } = usePulse();
  const { popStyle, pop } = usePop();
  useEffect(() => {
    if (celebrate) pop({ scale: 1.4 });
  }, [celebrate, pop]);
  return (
    <Animated.View style={[styles.tierWrap, popStyle]}>
      {animated ? (
        <Animated.View pointerEvents="none" style={[styles.tierGlow, glowStyle]} />
      ) : null}
      <View style={[styles.tier, { borderColor: color }, animated && styles.tierSolid]}>
        <Text style={[styles.tierText, { color }]}>{label}</Text>
      </View>
    </Animated.View>
  );
}

/** A surface composite chip (OFF/DEF/ATH) with its rounded value. */
function CompositeChip({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipLabel}>{label}</Text>
      <StatNumber value={value} style={styles.chipValue} />
    </View>
  );
}

/**
 * A proportional fill bar for a single rating. The bar fills to the NORMAL cap
 * (STAT_NORMAL_MAX = 20), so a maxed-for-tier stat reads as a full, satisfying bar
 * (the "max it out" milestone) instead of two-thirds full against the unreachable
 * 30 ceiling. A trained/legend stat past 20 reads the bar as full with a growing
 * gold "charged" tip toward the all-gold S++ apex, so over-cap reads "beyond elite"
 * at a glance. The exact value is shown beside it.
 */
function PipBar({ value }: { value: number }) {
  const inBand = Math.max(0, Math.min(value, STAT_NORMAL_MAX)) / STAT_NORMAL_MAX;
  const over =
    Math.max(0, Math.min(value, MAX_TRAINED_STAT) - STAT_NORMAL_MAX) /
    (MAX_TRAINED_STAT - STAT_NORMAL_MAX);
  if (over <= 0) {
    return (
      <View style={styles.pipBar}>
        <View style={[styles.pipFill, { flex: inBand }]} />
        <View style={{ flex: 1 - inBand }} />
      </View>
    );
  }
  return (
    <View style={styles.pipBar}>
      <View style={[styles.pipFill, { flex: 1 - over }]} />
      <View style={[styles.pipOver, { flex: over }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    paddingVertical: space(1),
  },
  cardTile: {
    padding: space(2),
    borderWidth: BORDER.chunk,
    borderColor: palette.bgPanel,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.bgPanel,
  },
  cardCompact: {
    paddingVertical: space(0.5),
  },
  injured: { opacity: 0.55 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headTile: { marginBottom: space(1) },
  avatar: {
    width: 30,
    alignItems: 'center',
    marginRight: space(2),
  },
  posChip: {
    width: 34,
    paddingVertical: space(0.5),
    borderWidth: BORDER.chunk,
    borderRadius: RADIUS.chip,
    alignItems: 'center',
    marginRight: space(2),
  },
  pos: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro },
  classFrom: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
    marginRight: space(0.5),
  },
  tierWrap: { position: 'relative', marginRight: space(2) },
  tierGlow: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    backgroundColor: palette.gold + '55',
    borderRadius: RADIUS.chip,
  },
  tier: {
    minWidth: 18,
    paddingVertical: space(0.5),
    paddingHorizontal: space(1),
    borderWidth: BORDER.chunk,
    borderRadius: RADIUS.chip,
    alignItems: 'center',
  },
  tierSolid: { backgroundColor: palette.bgDeep }, // keeps S++ text crisp over the glow
  tierText: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro },
  // minWidth: 0 lets the name column (and the row/text inside it) shrink within the
  // head row instead of being held at its content width (web's min-width: auto). The
  // name is flex: 1 so its width is driven by this column, NOT by measuring its own
  // content. That means the card must sit in a parent that gives it a real width: a
  // column container, or a flex: 1 wrapper. Placing the card directly in a row-direction
  // parent (no width/flex) collapses the name to zero width on native. See LineupBoard.
  nameCol: { flex: 1, minWidth: 0, justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', minWidth: 0, gap: space(1) },
  name: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.ink,
    flex: 1,
    minWidth: 0,
  },
  legendName: { color: palette.gold },
  legendStar: { fontFamily: FONT.body, fontSize: FONT_SIZE.small, color: palette.gold },
  itemMark: { fontFamily: FONT.body, fontSize: FONT_SIZE.small },
  legendGlow: {
    position: 'absolute',
    left: -space(1),
    right: -space(1),
    top: 0,
    bottom: 0,
    backgroundColor: palette.gold + '22',
    borderRadius: RADIUS.chip,
  },
  metaRow: { gap: space(0.5) },
  metaLabel: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro },
  metaText: { fontFamily: FONT.body, fontSize: FONT_SIZE.small, color: palette.ink },
  outRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1),
    marginTop: 1,
  },
  outText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.injury,
  },
  ovr: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h3,
    marginLeft: space(2),
  },
  chevronBtn: {
    paddingHorizontal: space(2),
    marginLeft: space(1),
  },
  chevron: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
  },
  chips: {
    flexDirection: 'row',
    gap: space(2),
    marginTop: space(1),
    marginLeft: 30 + space(2),
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1),
    paddingHorizontal: space(1.5),
    paddingVertical: space(0.5),
    borderWidth: BORDER.thin,
    borderColor: palette.inkDim,
    borderRadius: RADIUS.chip,
  },
  chipLabel: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
  },
  chipValue: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
  },
  panel: {
    marginTop: space(2),
    paddingTop: space(2),
    borderTopWidth: BORDER.thin,
    borderTopColor: palette.bgPanel,
    gap: space(2),
  },
  group: { gap: space(1) },
  groupLabel: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.gold,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
  },
  ratingLabel: {
    width: 88,
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
  },
  ratingValue: {
    width: 18,
    textAlign: 'right',
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
  },
  pipBar: {
    flex: 1,
    flexDirection: 'row',
    height: 8,
    backgroundColor: palette.bgPanel,
    borderRadius: RADIUS.none,
    overflow: 'hidden',
  },
  pipFill: { backgroundColor: palette.makeGreen },
  pipOver: { backgroundColor: palette.gold }, // the over-cap "charged" tip (trained past 20)
});
