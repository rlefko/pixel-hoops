import { useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { PlayerCard } from './PlayerCard';
import { CoinIcon } from './PixelIcons';
import { ITEM_RARITY_COLOR } from './item-ui';
import type { ItemDef } from '@/game/items';
import type { Roster } from '@/types/roster';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * Shop node: buy gear with this run's coins, then equip it to a player (max 1
 * each; equipping over an existing item replaces it). Items are run-scoped.
 */
interface ItemShopViewProps {
  stock: ItemDef[];
  coins: number;
  roster: Roster;
  onBuy: (defId: string, playerIndex: number) => void;
  onLeave: () => void;
}

export function ItemShopView({ stock, coins, roster, onBuy, onLeave }: ItemShopViewProps) {
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
            <Pressable
              key={i}
              style={styles.pick}
              onPress={() => {
                onBuy(selected.id, i);
                setSelected(null);
              }}
            >
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
      <View style={styles.headerRow}>
        <Text style={styles.title}>ITEM SHOP</Text>
        <View style={styles.coinRow}>
          <CoinIcon size={12} color={palette.gold} />
          <Text style={styles.coins}>{coins}</Text>
        </View>
      </View>
      <Text style={styles.subtitle}>Buy gear, then equip it to a player</Text>
      <ScrollView contentContainerStyle={styles.list}>
        {stock.map((item, i) => {
          const color = ITEM_RARITY_COLOR[item.rarity];
          const afford = coins >= item.cost;
          return (
            <Pressable
              key={i}
              disabled={!afford}
              style={[styles.card, { borderColor: color, opacity: afford ? 1 : 0.45 }]}
              onPress={() => setSelected(item)}
            >
              <View style={styles.cardHead}>
                <Text style={[styles.cardName, { color }]}>{item.name}</Text>
                <View style={styles.coinRow}>
                  <CoinIcon size={10} color={palette.gold} />
                  <Text style={styles.cost}>{item.cost}</Text>
                </View>
              </View>
              <Text style={styles.cardBlurb}>{item.blurb}</Text>
              <Text style={styles.rarity}>{item.rarity.toUpperCase()}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable onPress={onLeave}>
        <Text style={styles.skip}>Leave Shop</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space(5) },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  coinRow: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
  coins: { fontFamily: FONT.display, fontSize: FONT_SIZE.body, color: palette.gold },
  title: { fontFamily: FONT.display, fontSize: FONT_SIZE.h3, color: palette.gold },
  subtitle: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    marginTop: space(2),
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
  cost: { fontFamily: FONT.display, fontSize: FONT_SIZE.small, color: palette.gold },
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
