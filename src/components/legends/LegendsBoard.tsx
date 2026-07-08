import { memo, useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet, Pressable, FlatList } from 'react-native';
import { Text } from '@/components/StyledText';
import { StaggerIn } from '@/components/fx';
import { PlayerCard } from '@/components/run/PlayerCard';
import { FavorIcon, StarIcon } from '@/components/run/PixelIcons';
import { TeachCallout } from '@/components/teach/TeachCallout';
import { useHomeRoster } from '@/context/HomeRosterContext';
import {
  buyLegacyContract,
  clearScoutTarget,
  pinScoutTarget,
  playerKey,
} from '@/game/home-roster';
import {
  SIGNATURE_TIER_NAMES,
  allSignatureChallenges,
  contractPriceFor,
  legendByKey,
  type SignatureChallenge,
} from '@/game/signature';
import { realPlayerToRosterPlayer } from '@/game/player-pool';
import { haptics, sfx } from '@/feel';
import type { RosterPlayer } from '@/types/roster';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * THE LEGENDS BOARD: all 92 Signature Cards in one place. Every legend shows their
 * bespoke condition, tier floor, and earned marks; an un-signed legend can be
 * ARMED (the trial pin: they join qualifying drafts on loan) and, once their
 * moment is proven, signed outright with a Legacy Contract (coins or a voucher).
 * Signed legends read as settled gold plaques: the shelf you fill is the endgame.
 *
 * Sorting is chase-first: open cards by tier (the reachable climbs on top), then
 * the signed shelf. Virtualized; rows memoized on their own card state.
 */

interface BoardRow {
  challenge: SignatureChallenge;
  player: RosterPlayer;
}

/** One legend's card + Signature Card state. Memo'd: a pin or purchase re-renders
 * only the rows whose signed/marks/armed/afford props actually changed. */
const LegendRow = memo(function LegendRow({
  row,
  index,
  signed,
  momentDone,
  titleDone,
  armed,
  favorLabel,
  contractLabel,
  contractEnabled,
  onArm,
  onContract,
}: {
  row: BoardRow;
  index: number;
  signed: boolean;
  momentDone: boolean;
  titleDone: boolean;
  armed: boolean;
  favorLabel: string | null;
  /** Null hides the contract line (moment not proven yet, or already signed). */
  contractLabel: string | null;
  contractEnabled: boolean;
  onArm: (key: string) => void;
  onContract: (key: string) => void;
}) {
  const { challenge } = row;
  const key = challenge.legendKey;
  return (
    <StaggerIn index={Math.min(index, 12)} style={styles.row}>
      <PlayerCard
        rp={row.player}
        showSpecialty
        right={signed ? <Text style={styles.signedTag}>SIGNED</Text> : undefined}
      />
      {signed ? (
        <Text style={styles.settledLine}>
          {SIGNATURE_TIER_NAMES[challenge.tier]} CARD COMPLETE
        </Text>
      ) : (
        <View style={styles.cardBody}>
          <View style={styles.chips}>
            <Text style={styles.tierChip}>{SIGNATURE_TIER_NAMES[challenge.tier]}</Text>
            <Text style={styles.floorChip}>{challenge.floor.toUpperCase()}+ S-LADDER</Text>
          </View>
          <Text style={styles.condition}>{challenge.text}</Text>
          <View style={styles.marks}>
            <Text style={[styles.markChip, momentDone && styles.markDone]}>
              {momentDone ? 'MOMENT PROVEN' : 'MOMENT'}
            </Text>
            <Text style={[styles.markChip, titleDone && styles.markDone]}>
              {titleDone ? 'TITLE WON' : 'TITLE TOGETHER'}
            </Text>
            {favorLabel ? <Text style={styles.favor}>{favorLabel}</Text> : null}
          </View>
          <View style={styles.actions}>
            <Pressable onPress={() => onArm(key)} style={styles.armBtn} hitSlop={space(1)}>
              <FavorIcon size={10} color={armed ? palette.gold : palette.inkDim} />
              <Text style={[styles.armText, armed && styles.armTextOn]}>
                {armed ? 'ARMED FOR THE DRAFT' : 'ARM TRIAL'}
              </Text>
            </Pressable>
            {contractLabel ? (
              <Pressable
                onPress={() => onContract(key)}
                disabled={!contractEnabled}
                style={[styles.contractBtn, !contractEnabled && styles.contractDisabled]}
              >
                <StarIcon size={10} color={palette.gold} />
                <Text style={styles.contractText}>{contractLabel}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      )}
    </StaggerIn>
  );
});

export function LegendsBoard() {
  const { homeRoster, saveHomeRoster } = useHomeRoster();
  const homeRosterRef = useRef(homeRoster);
  homeRosterRef.current = homeRoster;

  // The 92 cards, built once (the catalog is static for a session).
  const rows = useMemo<BoardRow[]>(
    () =>
      allSignatureChallenges().flatMap((challenge) => {
        const baked = legendByKey(challenge.legendKey);
        return baked ? [{ challenge, player: realPlayerToRosterPlayer(baked) }] : [];
      }),
    []
  );
  const ownedKeys = useMemo(
    () => new Set((homeRoster?.players ?? []).map(playerKey)),
    [homeRoster]
  );
  // Chase-first ordering: open cards by tier (reachable climbs on top, PANTHEON
  // last), then the signed shelf in catalog order.
  const ordered = useMemo(() => {
    const open = rows.filter((r) => !ownedKeys.has(r.challenge.legendKey));
    const done = rows.filter((r) => ownedKeys.has(r.challenge.legendKey));
    open.sort((a, b) => a.challenge.tier - b.challenge.tier);
    return [...open, ...done];
  }, [rows, ownedKeys]);

  const onArm = useCallback(
    (key: string) => {
      const home = homeRosterRef.current;
      if (!home) return;
      haptics.selection();
      sfx.tap('secondary');
      saveHomeRoster(
        home.scoutTargets?.legendary === key
          ? clearScoutTarget(home, 'legendary')
          : pinScoutTarget(home, 'legendary', key)
      );
    },
    [saveHomeRoster]
  );
  const onContract = useCallback(
    (key: string) => {
      const home = homeRosterRef.current;
      if (!home) return;
      const bought = buyLegacyContract(home, key);
      if (bought === home) {
        sfx.error();
        return;
      }
      haptics.success();
      sfx.win();
      saveHomeRoster(bought);
    },
    [saveHomeRoster]
  );

  if (!homeRoster) return null;
  const signedCount = rows.filter((r) => ownedKeys.has(r.challenge.legendKey)).length;
  const vouchers = homeRoster.legendVouchers ?? 0;

  return (
    <View style={styles.board}>
      <View style={styles.headRow}>
        <Text style={styles.headCount}>{signedCount}/{rows.length} SIGNED</Text>
        {vouchers > 0 ? <Text style={styles.voucher}>VOUCHERS: {vouchers}</Text> : null}
      </View>
      <TeachCallout tip="legendSignature" style={styles.tip} />
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={ordered}
        keyExtractor={(row) => row.challenge.legendKey}
        renderItem={({ item, index }) => {
          const key = item.challenge.legendKey;
          const signed = ownedKeys.has(key);
          const card = homeRoster.signatures[key];
          const momentDone = !!card?.moment;
          const favor = homeRoster.favor[key] ?? 0;
          const price = contractPriceFor(item.challenge);
          const contractLabel =
            signed || !momentDone
              ? null
              : vouchers > 0
                ? 'CONTRACT · USE VOUCHER'
                : `CONTRACT · ${price}c`;
          return (
            <LegendRow
              row={item}
              index={index}
              signed={signed}
              momentDone={momentDone}
              titleDone={!!card?.title}
              armed={homeRoster.scoutTargets?.legendary === key}
              favorLabel={favor > 0 ? `${favor} FAVOR` : null}
              contractLabel={contractLabel}
              contractEnabled={vouchers > 0 || homeRoster.coins >= price}
              onArm={onArm}
              onContract={onContract}
            />
          );
        }}
        windowSize={5}
        initialNumToRender={8}
        removeClippedSubviews
      />
    </View>
  );
}

const styles = StyleSheet.create({
  board: { flex: 1, alignSelf: 'stretch' },
  headRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: space(1),
  },
  headCount: { fontFamily: FONT.display, fontSize: FONT_SIZE.small, color: palette.gold },
  voucher: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, color: palette.gold },
  tip: { marginTop: space(2) },
  list: { marginTop: space(2), alignSelf: 'stretch' },
  listContent: { gap: space(2), paddingBottom: space(4) },
  row: {
    borderBottomWidth: BORDER.thin,
    borderBottomColor: palette.bgPanel,
    paddingBottom: space(2),
  },
  signedTag: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.gold,
    marginLeft: space(2),
  },
  settledLine: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
    marginTop: space(1),
  },
  cardBody: { marginTop: space(1), gap: space(1) },
  chips: { flexDirection: 'row', gap: space(2), alignItems: 'center' },
  tierChip: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, color: palette.gold },
  floorChip: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, color: palette.steelBlue },
  condition: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.ink,
  },
  marks: { flexDirection: 'row', gap: space(2), alignItems: 'center', flexWrap: 'wrap' },
  markChip: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
    borderWidth: BORDER.thin,
    borderColor: palette.inkDim + '55',
    borderRadius: RADIUS.chip,
    paddingHorizontal: space(1.5),
    paddingVertical: space(0.5),
  },
  markDone: { color: palette.gold, borderColor: palette.gold + '88' },
  favor: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, color: palette.steelBlue },
  actions: { flexDirection: 'row', gap: space(3), alignItems: 'center', flexWrap: 'wrap' },
  armBtn: { flexDirection: 'row', alignItems: 'center', gap: space(1.5), paddingVertical: space(1) },
  armText: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, color: palette.inkDim },
  armTextOn: { color: palette.gold },
  contractBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
    borderWidth: BORDER.thin,
    borderColor: palette.gold + '88',
    borderRadius: RADIUS.chip,
    paddingHorizontal: space(2),
    paddingVertical: space(1),
  },
  contractDisabled: { opacity: 0.4 },
  contractText: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, color: palette.gold },
});
