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
import { SIGNATURE_TIER_NAMES, signatureByKey } from '@/game/signature';
import { getFinaleLegend } from '@/game/signature-finale';
import type { LadderClass } from '@/game/difficulty-mode';
import { useHomeRoster } from '@/context/HomeRosterContext';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

const CENTER_X = Dimensions.get('window').width / 2;

interface SignatureFinaleViewProps {
  /** The armed legend's franchise team abbreviation. */
  teamAbbr: string;
  /** The run's difficulty (for scaling the trial-pin legend). */
  difficulty: 'easy' | 'medium' | 'hard' | 'insane';
  /** The run's ladder class (for scaling the trial-pin legend). */
  ladderClass: LadderClass;
  onContinue: () => void;
}

export function SignatureFinaleView({
  teamAbbr,
  difficulty,
  ladderClass,
  onContinue,
}: SignatureFinaleViewProps) {
  const { homeRoster } = useHomeRoster();

  // Guard: the home roster must be loaded before we can derive the armed legend.
  if (!homeRoster) return null;

  const { shakeRef, flashRef, fire } = useRewardBurst();
  const { idle, bump } = useIdle(HUB_IDLE_MS);
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    fire('legendary');
    setBurst((n) => n + 1);
  }, [fire]);

  // Derive the armed legend's data from the home roster context.
  const legendKey = homeRoster.scoutTargets?.legendary ?? null;
  const legend = legendKey
    ? getFinaleLegend(homeRoster, difficulty, ladderClass)
    : null;
  const challenge = legendKey ? signatureByKey(legendKey) : null;
  const tier = challenge?.tier ?? 1;
  const tierName = SIGNATURE_TIER_NAMES[tier as keyof typeof SIGNATURE_TIER_NAMES] || 'GREAT';

  // Guard: if no legend is armed, show nothing (the phase should not render without one).
  if (!legend || !challenge) return null;

  return (
    <Screen style={styles.container} topGap={space(4)} onTouchStart={bump}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <ShakeView ref={shakeRef} style={styles.hero}>
          <StarIcon size={26} color={palette.gold} />
          <Text style={styles.title}>
            SIGNATURE FINALE
          </Text>
          <Text style={styles.sub}>
            Your legend's franchise stands in the way of the title.
          </Text>
          <View style={styles.list}>
            <StaggerIn index={0} style={styles.row}>
              <View style={styles.cardWrap}>
                <LegendaryHalo visible paused={idle} />
                <PlayerCard
                  rp={legend}
                  showSpecialty
                  right={<Text style={styles.finaleTag}>{teamAbbr}</Text>}
                />
              </View>
              <View style={styles.plaque}>
                <Text style={styles.plaqueTier}>
                  {tierName} FINALE
                </Text>
                <Text style={styles.plaqueText}>{challenge.text}</Text>
              </View>
            </StaggerIn>
          </View>
          <Text style={styles.teamName}>
            vs {teamAbbr}
          </Text>
          <ParticleBurst
            origin={{ x: CENTER_X, y: 90 }}
            variant="confetti"
            color={palette.gold}
            count={18}
            trigger={burst}
          />
        </ShakeView>

        <Pressable style={[styles.button, styles.primary]} onPress={onContinue}>
          <Text style={styles.primaryText}>CONTINUE</Text>
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
  finaleTag: {
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
  teamName: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h3,
    color: palette.ink,
    marginTop: space(3),
    textAlign: 'center',
  },
  button: {
    marginTop: space(4),
    paddingVertical: space(3),
    paddingHorizontal: space(8),
    borderWidth: BORDER.chunk,
    borderColor: palette.gold,
    borderRadius: RADIUS.chip,
  },
  primary: { backgroundColor: palette.gold + '1A' },
  primaryText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.label,
    color: palette.gold,
    textAlign: 'center',
  },
});
