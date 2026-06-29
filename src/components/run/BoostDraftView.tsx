import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { PixelButton } from '@/components/PixelButton';
import { ShakeView, FlashOverlay } from '@/components/fx';
import { BOOST_BY_ID, type BoostOffer, type PassiveBoost } from '@/game/boosts';
import type { Rarity } from '@/game/rarity';
import type { RosterPlayer } from '@/types/roster';
import { offerDef } from './boost-ui';
import { setHintForOffer } from './set-ui';
import { LegendaryHalo, RewardConfetti } from './reward-fx';
import { RARITY_COLOR, RARITY_LABEL, REWARD_CHROME } from './rarity-ui';
import { useRewardBurst } from './useRewardBurst';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/** The rarity of the boost an offer refers to (drives color and reveal juice). */
function offerRarity(offer: BoostOffer | undefined): Rarity {
  return (offer ? offerDef(offer)?.rarity : undefined) ?? 'common';
}

/**
 * The passive-boost draft shown before each map: pick 1 of 3, or skip (free, no
 * reward). When the 5 slots are full, taking a new boost flips into a "drop one"
 * mode that shows the incoming boost beside the owned five, so the player can
 * drop one to make room or skip to keep their five.
 */
interface BoostDraftViewProps {
  round: number;
  offers: BoostOffer[];
  pendingFull: boolean;
  /** The incoming boost shown in drop mode (set only while pendingFull). */
  forced?: BoostOffer;
  owned: PassiveBoost[];
  /** The dressed five, used to hint when an offer completes a synergy set. */
  five?: RosterPlayer[];
  /** Coin cost of the next whole-board reroll (escalates within the node). */
  rerollCost?: number;
  /** Whether a reroll is affordable right now. */
  canReroll?: boolean;
  /** Banishes left in the run (0 hides the per-offer banish control). */
  banishesLeft?: number;
  onDraft: (offer: BoostOffer) => void;
  onDrop: (index: number) => void;
  onSkip: () => void;
  onReroll?: () => void;
  onBanish?: (offer: BoostOffer) => void;
}

export function BoostDraftView({
  round,
  offers,
  pendingFull,
  forced,
  owned,
  five,
  rerollCost,
  canReroll,
  banishesLeft,
  onDraft,
  onDrop,
  onSkip,
  onReroll,
  onBanish,
}: BoostDraftViewProps) {
  const { shakeRef, flashRef, fire, confettiTrigger } = useRewardBurst();
  const draft = (offer: BoostOffer) => {
    fire(offerRarity(offer));
    onDraft(offer);
  };
  const reroll = () => {
    fire('rare');
    onReroll?.();
  };
  const banish = (offer: BoostOffer) => {
    fire('common');
    onBanish?.(offer);
  };
  const canBanish = !!onBanish && (banishesLeft ?? 0) > 0;

  let content;
  if (pendingFull) {
    const incoming = forced ? offerDef(forced) : undefined;
    const incomingColor = incoming ? RARITY_COLOR[incoming.rarity] : REWARD_CHROME;
    content = (
      <Screen style={styles.container} bottomGap={space(5)}>
        <Text style={styles.title}>BOOSTS FULL</Text>
        <Text style={styles.subtitle}>Drop one to make room, or skip to keep your five</Text>
        {incoming ? (
          <View style={[styles.card, styles.incoming, { borderColor: incomingColor }]}>
            <View style={styles.cardHead}>
              <Text style={[styles.cardName, { color: incomingColor }]}>{incoming.name}</Text>
              <Text style={styles.adding}>ADDING</Text>
            </View>
            <Text style={styles.cardBlurb}>{incoming.blurb}</Text>
            <Text style={[styles.tag, { color: incomingColor }]}>{RARITY_LABEL[incoming.rarity]}</Text>
          </View>
        ) : null}
        <Text style={styles.dropLabel}>DROP ONE</Text>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.offers}>
          {owned.map((b, i) => {
            const def = BOOST_BY_ID[b.id];
            if (!def) return null;
            const color = RARITY_COLOR[def.rarity];
            return (
              <Pressable
                key={b.id}
                style={[styles.card, { borderColor: color }]}
                onPress={() => {
                  fire(offerRarity(forced));
                  onDrop(i);
                }}
              >
                <View style={styles.cardHead}>
                  <Text style={[styles.cardName, { color }]}>{def.name}</Text>
                  <Text style={styles.drop}>DROP</Text>
                </View>
                <Text style={styles.cardBlurb}>{def.blurb}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <PixelButton label="Skip (keep my five)" onPress={onSkip} style={styles.bottomButton} />
      </Screen>
    );
  } else {
    content = (
      <Screen style={styles.container} bottomGap={space(5)}>
        <Text style={styles.title}>ROUND {round} BOOST</Text>
        <Text style={styles.subtitle}>Pick a passive boost for your squad</Text>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.offers}>
          {offers.map((offer, i) => {
            const def = offerDef(offer);
            if (!def) return null;
            const color = RARITY_COLOR[def.rarity];
            const legendary = def.rarity === 'legendary';
            const setHint = five ? setHintForOffer(offer.defId, owned, five) : null;
            return (
              <View key={i} style={styles.offerRow}>
                <Pressable style={styles.cardWrap} onPress={() => draft(offer)}>
                  <LegendaryHalo visible={legendary} />
                  <View style={[styles.card, { borderColor: color }]}>
                    <View style={styles.cardHead}>
                      <Text style={[styles.cardName, { color }]}>{def.name}</Text>
                      <Text style={[styles.tag, { color }]}>{RARITY_LABEL[def.rarity]}</Text>
                    </View>
                    <Text style={styles.cardBlurb}>{def.blurb}</Text>
                    {setHint ? <Text style={styles.setHint}>{setHint}</Text> : null}
                  </View>
                </Pressable>
                {canBanish ? (
                  <Pressable hitSlop={8} style={styles.banishBtn} onPress={() => banish(offer)}>
                    <Text style={styles.banishX}>✕</Text>
                    <Text style={styles.banishLabel}>BANISH</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
          {offers.length === 0 ? (
            <Text style={styles.subtitle}>No new boosts available.</Text>
          ) : null}
        </ScrollView>
        <View style={styles.bottomRow}>
          {canReroll ? (
            <PixelButton label={`Reroll · ${rerollCost}c`} onPress={reroll} style={styles.rerollButton} />
          ) : null}
          <PixelButton label="Skip" onPress={onSkip} style={styles.skipButton} />
        </View>
      </Screen>
    );
  }

  return (
    <ShakeView ref={shakeRef} style={styles.flex}>
      {content}
      <FlashOverlay ref={flashRef} />
      <RewardConfetti trigger={confettiTrigger} />
    </ShakeView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    paddingHorizontal: space(5),
  },
  title: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h3,
    color: REWARD_CHROME,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(2),
  },
  scroll: { flex: 1, alignSelf: 'stretch' },
  offers: { marginTop: space(4), gap: space(3), paddingBottom: space(4) },
  card: {
    padding: space(3),
    borderWidth: BORDER.chunk,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.bgPanel,
    gap: space(1),
  },
  incoming: {
    marginTop: space(4),
    backgroundColor: REWARD_CHROME + '14', // a faint highlight for the incoming boost
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardName: { fontFamily: FONT.display, fontSize: FONT_SIZE.body },
  tag: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro },
  adding: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, color: palette.makeGreen },
  drop: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, color: palette.missRed },
  dropLabel: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
    textAlign: 'center',
    letterSpacing: 1,
    marginTop: space(4),
  },
  cardBlurb: { fontFamily: FONT.body, fontSize: FONT_SIZE.small, color: palette.ink },
  setHint: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, color: palette.purple, marginTop: space(0.5) },
  bottomButton: { marginTop: space(4) },
  offerRow: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  cardWrap: { position: 'relative', flex: 1 },
  banishBtn: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: space(1.5), paddingVertical: space(1) },
  banishX: { fontFamily: FONT.display, fontSize: FONT_SIZE.body, color: palette.missRed },
  banishLabel: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, color: palette.inkDim },
  bottomRow: { flexDirection: 'row', justifyContent: 'center', gap: space(3), marginTop: space(4) },
  rerollButton: { flex: 1 },
  skipButton: { flex: 1 },
});
