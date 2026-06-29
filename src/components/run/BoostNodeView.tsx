import { useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { ShakeView, FlashOverlay } from '@/components/fx';
import { PlayerCard } from './PlayerCard';
import { LegendaryHalo, RewardConfetti } from './reward-fx';
import { RARITY_COLOR, RARITY_LABEL, REWARD_CHROME, SYNERGY_CHROME } from './rarity-ui';
import { itemFamilyLabels } from './set-ui';
import { useRewardBurst } from './useRewardBurst';
import type { ItemDef } from '@/game/items';
import type { Roster } from '@/types/roster';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * Boost node (the renamed, coin-free shop): grab ONE free item and equip it to a
 * player (max 1 each; equipping over an existing item replaces it). Items are
 * run-scoped; coins are spent only in the Locker Room, never here.
 */
interface BoostNodeViewProps {
  stock: ItemDef[];
  roster: Roster;
  onTake: (defId: string, playerIndex: number) => void;
  onKeepInBag: (defId: string) => void;
  onLeave: () => void;
}

export function BoostNodeView({ stock, roster, onTake, onKeepInBag, onLeave }: BoostNodeViewProps) {
  const players = [...roster.starters, ...roster.bench];
  const [selected, setSelected] = useState<ItemDef | null>(null);
  const { shakeRef, flashRef, fire, confettiTrigger } = useRewardBurst();

  // Grabbing an item is the "receive" beat; fire juice scaled by its rarity.
  const select = (item: ItemDef) => {
    setSelected(item);
    fire(item.rarity);
  };

  const body = selected ? (
    <Screen style={styles.container}>
      <Text style={styles.title}>EQUIP TO</Text>
      <Text style={styles.subtitle}>
        {selected.name}: {selected.blurb}
      </Text>
      <ScrollView contentContainerStyle={styles.list}>
        {players.map((rp, i) => (
          <Pressable key={i} style={styles.pick} onPress={() => onTake(selected.id, i)}>
            <PlayerCard rp={rp} />
          </Pressable>
        ))}
      </ScrollView>
      <Pressable style={styles.keepBtn} onPress={() => onKeepInBag(selected.id)}>
        <Text style={styles.keepText}>Keep in bag</Text>
      </Pressable>
      <Pressable onPress={() => setSelected(null)}>
        <Text style={styles.skip}>Back</Text>
      </Pressable>
    </Screen>
  ) : (
    <Screen style={styles.container}>
      <Text style={styles.title}>BOOST</Text>
      <Text style={styles.subtitle}>Grab one free item: equip it, or keep it in your bag</Text>
      <ScrollView contentContainerStyle={styles.list}>
        {stock.map((item, i) => {
          const color = RARITY_COLOR[item.rarity];
          const legendary = item.rarity === 'legendary';
          const family = itemFamilyLabels(item.id).join(' · ');
          return (
            <Pressable key={i} style={styles.cardWrap} onPress={() => select(item)}>
              <LegendaryHalo visible={legendary} />
              <View style={[styles.card, { borderColor: color }]}>
                <View style={styles.cardHead}>
                  <Text style={[styles.cardName, { color }]}>{item.name}</Text>
                  <Text style={styles.free}>FREE</Text>
                </View>
                <Text style={styles.cardBlurb}>{item.blurb}</Text>
                {family ? <Text style={styles.familyTag}>{family}</Text> : null}
                <Text style={[styles.rarity, { color }]}>{RARITY_LABEL[item.rarity]}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable onPress={onLeave}>
        <Text style={styles.skip}>Leave</Text>
      </Pressable>
    </Screen>
  );

  return (
    <ShakeView ref={shakeRef} style={styles.flex}>
      {body}
      <FlashOverlay ref={flashRef} />
      <RewardConfetti trigger={confettiTrigger} />
    </ShakeView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { paddingHorizontal: space(5) },
  title: { fontFamily: FONT.display, fontSize: FONT_SIZE.h3, color: REWARD_CHROME, textAlign: 'center' },
  subtitle: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    marginTop: space(2),
    textAlign: 'center',
  },
  list: { marginTop: space(5), gap: space(3), paddingBottom: space(4) },
  cardWrap: { position: 'relative' },
  card: {
    padding: space(3),
    borderWidth: BORDER.chunk,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.bgPanel,
    gap: space(1),
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardName: { fontFamily: FONT.display, fontSize: FONT_SIZE.body },
  free: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, color: palette.makeGreen },
  cardBlurb: { fontFamily: FONT.body, fontSize: FONT_SIZE.small, color: palette.ink },
  familyTag: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, color: SYNERGY_CHROME },
  rarity: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, color: palette.inkDim },
  pick: {
    borderWidth: BORDER.chunk,
    borderColor: palette.bgPanel,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.bgPanel,
    padding: space(2),
  },
  skip: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(4),
  },
  keepBtn: {
    alignSelf: 'center',
    marginTop: space(4),
    paddingVertical: space(2.5),
    paddingHorizontal: space(6),
    borderWidth: BORDER.chunk,
    borderColor: REWARD_CHROME,
    borderRadius: RADIUS.chip,
    backgroundColor: REWARD_CHROME + '1A',
  },
  keepText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.label,
    color: REWARD_CHROME,
    textAlign: 'center',
  },
});
