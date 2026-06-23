import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import {
  BOOST_BY_ID,
  SKIP_CONSOLATION_COINS,
  type BoostOffer,
  type PassiveBoost,
} from '@/game/boosts';
import { BOOST_FAMILY_COLOR, offerDef } from './boost-ui';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * The start-of-round passive-boost draft: pick 1 of 3 (or skip for coins). When
 * the 5 slots are full, taking a new boost flips into a "drop one" mode where the
 * player picks which equipped boost to sacrifice (lossy, no refund).
 */
interface BoostDraftViewProps {
  round: number;
  offers: BoostOffer[];
  pendingFull: boolean;
  owned: PassiveBoost[];
  onDraft: (offer: BoostOffer) => void;
  onDrop: (index: number) => void;
  onSkip: () => void;
}

export function BoostDraftView({
  round,
  offers,
  pendingFull,
  owned,
  onDraft,
  onDrop,
  onSkip,
}: BoostDraftViewProps) {
  if (pendingFull) {
    return (
      <Screen style={styles.container}>
        <Text style={styles.title}>BOOSTS FULL</Text>
        <Text style={styles.subtitle}>Drop one to make room for the new boost</Text>
        <ScrollView contentContainerStyle={styles.offers}>
          {owned.map((b, i) => {
            const def = BOOST_BY_ID[b.id];
            if (!def) return null;
            const color = BOOST_FAMILY_COLOR[def.family];
            return (
              <Pressable key={b.id} style={[styles.card, { borderColor: color }]} onPress={() => onDrop(i)}>
                <View style={styles.cardHead}>
                  <Text style={[styles.cardName, { color }]}>{def.name}</Text>
                  <Text style={styles.drop}>DROP</Text>
                </View>
                <Text style={styles.cardBlurb}>{def.blurb}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen style={styles.container}>
      <Text style={styles.title}>ROUND {round} BOOST</Text>
      <Text style={styles.subtitle}>Pick a passive boost for your squad</Text>
      <ScrollView contentContainerStyle={styles.offers}>
        {offers.map((offer, i) => {
          const def = offerDef(offer);
          if (!def) return null;
          const color = BOOST_FAMILY_COLOR[def.family];
          const isUpgrade = offer.kind === 'tierUp';
          return (
            <Pressable key={i} style={[styles.card, { borderColor: color }]} onPress={() => onDraft(offer)}>
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
          <Text style={styles.subtitle}>No new boosts available. Skip for coins.</Text>
        ) : null}
      </ScrollView>
      <Pressable onPress={onSkip}>
        <Text style={styles.skip}>Skip for +{SKIP_CONSOLATION_COINS} coins</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  offers: { marginTop: space(6), gap: space(3), paddingBottom: space(4) },
  card: {
    padding: space(3),
    borderWidth: BORDER.chunk,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.bgPanel,
    gap: space(1),
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardName: { fontFamily: FONT.display, fontSize: FONT_SIZE.body },
  tag: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro },
  drop: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, color: palette.missRed },
  cardBlurb: { fontFamily: FONT.body, fontSize: FONT_SIZE.small, color: palette.ink },
  family: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, color: palette.inkDim },
  skip: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(4),
  },
});
