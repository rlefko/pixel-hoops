import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { PixelButton } from '@/components/PixelButton';
import { ShakeView, FlashOverlay } from '@/components/fx';
import { BOOST_BY_ID, type BoostOffer, type PassiveBoost } from '@/game/boosts';
import { BOOST_FAMILY_COLOR, offerDef } from './boost-ui';
import { useRewardBurst, type RewardTier } from './useRewardBurst';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/** Map a drafted boost's rarity to a juice tier so a capstone lands louder than a common. */
function offerTier(offer: BoostOffer | undefined): RewardTier {
  const def = offer ? offerDef(offer) : undefined;
  if (def?.rarity === 'capstone') return 'big';
  if (def?.rarity === 'rare') return 'medium';
  return 'small';
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
  onDraft: (offer: BoostOffer) => void;
  onDrop: (index: number) => void;
  onSkip: () => void;
}

export function BoostDraftView({
  round,
  offers,
  pendingFull,
  forced,
  owned,
  onDraft,
  onDrop,
  onSkip,
}: BoostDraftViewProps) {
  const { shakeRef, flashRef, fire } = useRewardBurst();
  const draft = (offer: BoostOffer) => {
    fire(offerTier(offer));
    onDraft(offer);
  };

  let content;
  if (pendingFull) {
    const incoming = forced ? offerDef(forced) : undefined;
    const incomingColor = incoming ? BOOST_FAMILY_COLOR[incoming.family] : palette.gold;
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
            <Text style={styles.family}>{incoming.family.toUpperCase()}</Text>
          </View>
        ) : null}
        <Text style={styles.dropLabel}>DROP ONE</Text>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.offers}>
          {owned.map((b, i) => {
            const def = BOOST_BY_ID[b.id];
            if (!def) return null;
            const color = BOOST_FAMILY_COLOR[def.family];
            return (
              <Pressable
                key={b.id}
                style={[styles.card, { borderColor: color }]}
                onPress={() => {
                  fire(offerTier(forced));
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
            const color = BOOST_FAMILY_COLOR[def.family];
            const isUpgrade = offer.kind === 'tierUp';
            return (
              <Pressable key={i} style={[styles.card, { borderColor: color }]} onPress={() => draft(offer)}>
                <View style={styles.cardHead}>
                  <Text style={[styles.cardName, { color }]}>{def.name}</Text>
                  <Text style={[styles.tag, { color }]}>
                    {isUpgrade ? `UPGRADE → T${offer.toTier}` : def.rarity.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.cardBlurb}>{def.blurb}</Text>
                <Text style={styles.family}>{def.family.toUpperCase()}</Text>
              </Pressable>
            );
          })}
          {offers.length === 0 ? (
            <Text style={styles.subtitle}>No new boosts available.</Text>
          ) : null}
        </ScrollView>
        <PixelButton label="Skip" onPress={onSkip} style={styles.bottomButton} />
      </Screen>
    );
  }

  return (
    <ShakeView ref={shakeRef} style={styles.flex}>
      {content}
      <FlashOverlay ref={flashRef} />
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
    color: palette.gold,
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
    backgroundColor: palette.gold + '14', // a faint highlight for the incoming boost
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
  family: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, color: palette.inkDim },
  bottomButton: { marginTop: space(4) },
});
