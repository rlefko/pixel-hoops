import { useEffect } from 'react';
import { View, StyleSheet, Pressable, ScrollView, Dimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { ShakeView, FlashOverlay, ParticleBurst } from '@/components/fx';
import { haptics, usePulse } from '@/feel';
import { PlayerCard } from './PlayerCard';
import { RARITY_COLOR, RARITY_LABEL, REWARD_CHROME } from './rarity-ui';
import { useRewardBurst } from './useRewardBurst';
import type { ItemDef } from '@/game/items';
import type { Roster } from '@/types/roster';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

const CENTER_X = Dimensions.get('window').width / 2;

/** Post-combat gear drop (boss only): equip it to a player, or leave it. */
interface ItemDropViewProps {
  drop: ItemDef;
  roster: Roster;
  onTake: (playerIndex: number) => void;
  onAddToBag: () => void;
  onSkip: () => void;
}

export function ItemDropView({ drop, roster, onTake, onAddToBag, onSkip }: ItemDropViewProps) {
  const players = [...roster.starters, ...roster.bench];
  const color = RARITY_COLOR[drop.rarity];
  const legendary = drop.rarity === 'legendary';
  const { shakeRef, flashRef, fire, confettiTrigger } = useRewardBurst();
  const { glowStyle } = usePulse();
  // Celebrate the drop the moment it reveals; juice scales with rarity.
  useEffect(() => {
    fire(drop.rarity);
  }, [fire, drop.rarity]);

  return (
    <ShakeView ref={shakeRef} style={styles.flex}>
      <Screen style={styles.container}>
        <Text style={styles.title}>GEAR DROP!</Text>
        <View>
          {legendary ? (
            <Animated.View pointerEvents="none" style={[styles.legendGlow, glowStyle]} />
          ) : null}
          <View style={[styles.dropCard, { borderColor: color }]}>
            <Text style={[styles.dropName, { color }]}>{drop.name}</Text>
            <Text style={styles.dropBlurb}>{drop.blurb}</Text>
            <Text style={[styles.rarity, { color }]}>{RARITY_LABEL[drop.rarity]}</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>Equip it to a player, or keep it in your bag</Text>
        <ScrollView contentContainerStyle={styles.list}>
          {players.map((rp, i) => (
            <Pressable
              key={i}
              style={styles.pick}
              onPress={() => {
                haptics.selection();
                onTake(i);
              }}
            >
              <PlayerCard rp={rp} />
            </Pressable>
          ))}
        </ScrollView>
        <Pressable style={styles.bagBtn} onPress={onAddToBag}>
          <Text style={styles.bagBtnText}>Add to bag</Text>
        </Pressable>
        <Pressable onPress={onSkip}>
          <Text style={styles.skip}>Leave it</Text>
        </Pressable>
      </Screen>
      <FlashOverlay ref={flashRef} />
      <ParticleBurst
        origin={confettiTrigger > 0 ? { x: CENTER_X, y: 120 } : null}
        variant="confetti"
        color={palette.gold}
        trigger={confettiTrigger}
      />
    </ShakeView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { paddingHorizontal: space(5) },
  title: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h3,
    color: REWARD_CHROME,
    textAlign: 'center',
  },
  dropCard: {
    marginTop: space(4),
    padding: space(4),
    borderWidth: BORDER.chunk,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.bgPanel,
    alignItems: 'center',
    gap: space(1),
  },
  legendGlow: {
    position: 'absolute',
    left: -space(2),
    right: -space(2),
    top: space(3),
    bottom: -space(1),
    backgroundColor: palette.gold + '22',
    borderRadius: RADIUS.chip,
  },
  dropName: { fontFamily: FONT.display, fontSize: FONT_SIZE.body },
  dropBlurb: { fontFamily: FONT.body, fontSize: FONT_SIZE.small, color: palette.ink, textAlign: 'center' },
  rarity: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, color: palette.inkDim },
  subtitle: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(5),
  },
  list: { marginTop: space(3), gap: space(2), paddingBottom: space(4) },
  pick: {
    borderWidth: BORDER.chunk,
    borderColor: palette.bgPanel,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.bgPanel,
    padding: space(2),
  },
  bagBtn: {
    alignSelf: 'center',
    marginTop: space(4),
    paddingVertical: space(2.5),
    paddingHorizontal: space(6),
    borderWidth: BORDER.chunk,
    borderColor: REWARD_CHROME,
    borderRadius: RADIUS.chip,
    backgroundColor: REWARD_CHROME + '1A',
  },
  bagBtnText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.label,
    color: REWARD_CHROME,
    textAlign: 'center',
  },
  skip: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(3),
  },
});
