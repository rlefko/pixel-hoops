import { useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { PlayerCard } from './PlayerCard';
import { ITEM_RARITY_COLOR } from './item-ui';
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
  onLeave: () => void;
}

export function BoostNodeView({ stock, roster, onTake, onLeave }: BoostNodeViewProps) {
  const players = [...roster.starters, ...roster.bench];
  const [selected, setSelected] = useState<ItemDef | null>(null);

  if (selected) {
    return (
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
        <Pressable onPress={() => setSelected(null)}>
          <Text style={styles.skip}>Back</Text>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen style={styles.container}>
      <Text style={styles.title}>BOOST</Text>
      <Text style={styles.subtitle}>Grab one free item and equip it to a player</Text>
      <ScrollView contentContainerStyle={styles.list}>
        {stock.map((item, i) => {
          const color = ITEM_RARITY_COLOR[item.rarity];
          return (
            <Pressable
              key={i}
              style={[styles.card, { borderColor: color }]}
              onPress={() => setSelected(item)}
            >
              <View style={styles.cardHead}>
                <Text style={[styles.cardName, { color }]}>{item.name}</Text>
                <Text style={styles.free}>FREE</Text>
              </View>
              <Text style={styles.cardBlurb}>{item.blurb}</Text>
              <Text style={styles.rarity}>{item.rarity.toUpperCase()}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable onPress={onLeave}>
        <Text style={styles.skip}>Leave</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space(5) },
  title: { fontFamily: FONT.display, fontSize: FONT_SIZE.h3, color: palette.gold, textAlign: 'center' },
  subtitle: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    marginTop: space(2),
    textAlign: 'center',
  },
  list: { marginTop: space(5), gap: space(3), paddingBottom: space(4) },
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
});
