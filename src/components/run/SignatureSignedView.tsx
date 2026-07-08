import { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView, Dimensions } from 'react-native';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { FlashOverlay, ParticleBurst, ShakeView, StaggerIn } from '@/components/fx';
import { useIdle, HUB_IDLE_MS } from '@/feel';
import { useRewardBurst } from './useRewardBurst';
import { LegendaryHalo } from './reward-fx';
import { PlayerCard } from './PlayerCard';
import { StarIcon } from '@/components/run/PixelIcons';
import { SIGNATURE_TIER_NAMES } from '@/game/signature';
import type { SignatureDelta } from '@/game/home-roster';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * The "LEGEND SIGNED!" contract ceremony: the loudest signing beat in the game,
 * played when a Signature Card completes (both marks earned, any order, across any
 * runs) and the legend joins the collection for good. Mirrors PlayerScoutedView's
 * structure (always-gold: only legends reach this screen) and adds the card's
 * engraved plaque: the condition that was proven and the tier that demanded it.
 * Plays win OR lose (a lost run can complete a card whose title was earned
 * earlier), sequenced by RunScreen after the bounty and before the scouted
 * players. All juice one-shot and no-op under reduced motion.
 */

const CENTER_X = Dimensions.get('window').width / 2;

interface SignatureSignedViewProps {
  /** The cards completed this settle (always at least one; the caller gates). */
  deltas: SignatureDelta[];
  onNewRun: () => void;
  onHome: () => void;
}

export function SignatureSignedView({ deltas, onNewRun, onHome }: SignatureSignedViewProps) {
  const { shakeRef, flashRef, fire } = useRewardBurst();
  const { idle, bump } = useIdle(HUB_IDLE_MS);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    fire('legendary');
    setBurst((n) => n + 1);
  }, [fire]);

  return (
    <Screen style={styles.container} topGap={space(4)} onTouchStart={bump}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <ShakeView ref={shakeRef} style={styles.hero}>
          <StarIcon size={26} color={palette.gold} />
          <Text style={styles.title}>
            {deltas.length > 1 ? 'LEGENDS SIGNED!' : 'LEGEND SIGNED!'}
          </Text>
          <Text style={styles.sub}>The Signature Card is complete. They are yours, forever.</Text>
          <View style={styles.list}>
            {deltas.map((d, i) => (
              <StaggerIn key={d.challenge.legendKey} index={i} style={styles.row}>
                <View style={styles.cardWrap}>
                  <LegendaryHalo visible paused={idle} />
                  <PlayerCard
                    rp={d.player}
                    showSpecialty
                    right={<Text style={styles.signedTag}>SIGNED</Text>}
                  />
                </View>
                <View style={styles.plaque}>
                  <Text style={styles.plaqueTier}>
                    {SIGNATURE_TIER_NAMES[d.challenge.tier]} CARD
                  </Text>
                  <Text style={styles.plaqueText}>{d.challenge.text}</Text>
                </View>
              </StaggerIn>
            ))}
          </View>
          <ParticleBurst
            origin={{ x: CENTER_X, y: 90 }}
            variant="confetti"
            color={palette.gold}
            count={18}
            trigger={burst}
          />
        </ShakeView>

        <Pressable style={[styles.button, styles.primary]} onPress={onNewRun}>
          <Text style={styles.primaryText}>NEW RUN</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={onHome}>
          <Text style={styles.homeText}>HOME</Text>
        </Pressable>
      </ScrollView>

      <FlashOverlay ref={flashRef} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space(5) },
  scroll: { alignSelf: 'stretch' },
  scrollContent: { alignItems: 'center', paddingBottom: space(6) },
  hero: { alignSelf: 'stretch', alignItems: 'center' },
  title: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h2,
    color: palette.gold,
    textAlign: 'center',
    marginTop: space(2),
  },
  sub: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.inkDim,
    marginTop: space(1),
  },
  list: { alignSelf: 'stretch', width: '100%', maxWidth: 360, marginTop: space(4), gap: space(3) },
  row: { alignSelf: 'stretch' },
  cardWrap: { position: 'relative', width: '100%' },
  signedTag: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.gold,
    marginLeft: space(2),
  },
  plaque: {
    marginTop: space(1),
    paddingVertical: space(2),
    paddingHorizontal: space(3),
    borderWidth: BORDER.thin,
    borderColor: palette.gold + '55',
    borderRadius: RADIUS.chip,
    backgroundColor: palette.bgPanel,
  },
  plaqueTier: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.gold,
  },
  plaqueText: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.ink,
    marginTop: space(1),
  },
  button: {
    marginTop: space(4),
    paddingVertical: space(3),
    paddingHorizontal: space(8),
    borderWidth: BORDER.chunk,
    borderColor: palette.gold,
    borderRadius: RADIUS.chip,
  },
  primary: { backgroundColor: palette.gold + '1A', marginTop: space(6) },
  primaryText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.label,
    color: palette.gold,
    textAlign: 'center',
  },
  homeText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.body,
    color: palette.ink,
    textAlign: 'center',
  },
});
