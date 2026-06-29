import { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView, Dimensions } from 'react-native';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { FlashOverlay, ParticleBurst, ShakeView } from '@/components/fx';
import { useRewardBurst } from './useRewardBurst';
import { LegendaryHalo } from './reward-fx';
import { WhistleIcon } from '@/components/run/PixelIcons';
import { CoachCard } from '@/components/coach/CoachCard';
import { CLASS_COLOR } from '@/components/run/class-ui';
import type { CoachClass, CoachProfile } from '@/game/coaches';
import type { Rarity } from '@/game/rarity';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * The "COACH UNLOCKED!" reveal: the reward beat after a championship that wins one or
 * more coaches for the first time. It steps through the won coaches one at a time, each
 * landing a class-scaled confetti burst (S/S+ light the legend halo), shows the coach
 * chip via the shared CoachCard (with its built-in "equip for next run" action), and
 * ends on New Run / Home so the unlock flows straight into the next run. All juice
 * no-ops under reduced motion. Sequenced by RunScreen after the champion celebration.
 */

const CENTER_X = Dimensions.get('window').width / 2;

/** Coach class -> celebration rarity: a higher class lands a louder burst (S/S+ get the
 * legendary halo + most confetti), mirroring how ChampionView scales by victory tier. */
function classToRarity(cls: CoachClass): Rarity {
  if (cls === 'S' || cls === 'S+') return 'legendary';
  if (cls === 'A') return 'epic';
  return 'rare'; // C, B: still a real unlock, so at least rare-level juice.
}

interface CoachUnlockViewProps {
  coaches: CoachProfile[];
  /** The currently-equipped coach id, so a just-equipped coach reads "EQUIPPED". */
  equippedId: string;
  onEquip: (id: string) => void;
  onNewRun: () => void;
  onHome: () => void;
}

export function CoachUnlockView({ coaches, equippedId, onEquip, onNewRun, onHome }: CoachUnlockViewProps) {
  const [index, setIndex] = useState(0);
  const coach = coaches[index];
  const rarity = classToRarity(coach.class);
  const accent = CLASS_COLOR[coach.class];
  const legendary = rarity === 'legendary';
  const last = index >= coaches.length - 1;

  const { shakeRef, flashRef, fire } = useRewardBurst();
  const [burst, setBurst] = useState(0);

  // Fire the burst on mount and on every step to a new coach (re-fires the confetti).
  useEffect(() => {
    fire(rarity);
    setBurst((n) => n + 1);
  }, [fire, rarity, index]);

  return (
    <Screen style={styles.container} topGap={space(4)}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <ShakeView ref={shakeRef} style={styles.hero}>
          <WhistleIcon size={26} color={accent} />
          <Text style={styles.title}>COACH UNLOCKED!</Text>
          {coaches.length > 1 ? (
            <Text style={styles.count}>
              {index + 1} of {coaches.length}
            </Text>
          ) : null}
          <View style={styles.cardWrap}>
            <LegendaryHalo visible={legendary} />
            <CoachCard
              coach={coach}
              owned
              equipped={coach.id === equippedId}
              onEquip={() => onEquip(coach.id)}
            />
          </View>
          <ParticleBurst
            origin={{ x: CENTER_X, y: 100 }}
            variant="confetti"
            color={accent}
            count={legendary ? 18 : rarity === 'epic' ? 14 : 10}
            trigger={burst}
          />
        </ShakeView>

        {!last ? (
          <Pressable style={[styles.button, styles.primary]} onPress={() => setIndex((i) => i + 1)}>
            <Text style={styles.primaryText}>NEXT</Text>
          </Pressable>
        ) : (
          <>
            <Pressable style={[styles.button, styles.primary]} onPress={onNewRun}>
              <Text style={styles.primaryText}>NEW RUN</Text>
            </Pressable>
            <Pressable style={styles.button} onPress={onHome}>
              <Text style={styles.homeText}>HOME</Text>
            </Pressable>
          </>
        )}
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
    color: palette.chrome,
    textAlign: 'center',
    marginTop: space(2),
  },
  count: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
    marginTop: space(2),
  },
  cardWrap: {
    position: 'relative',
    width: '100%',
    maxWidth: 340,
    marginTop: space(5),
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
