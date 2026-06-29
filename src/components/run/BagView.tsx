import { useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { PlayerCard } from './PlayerCard';
import { LegendaryHalo } from './reward-fx';
import { ITEM_BY_ID } from '@/game/items';
import { RARITY_COLOR, REWARD_CHROME } from './rarity-ui';
import type { Roster } from '@/types/roster';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/**
 * The item bag: run-scoped storage so gear is never lost. Tap a stored item to
 * equip it onto a player (their old item, if any, swaps back into the bag), or
 * unequip a held item into the bag. Items are discarded at run end like all
 * run-scoped gear.
 */
interface BagViewProps {
  bag: string[];
  roster: Roster;
  onEquip: (bagIndex: number, playerIndex: number) => void;
  onUnequip: (playerIndex: number) => void;
  onDone: () => void;
}

export function BagView({ bag, roster, onEquip, onUnequip, onDone }: BagViewProps) {
  const players = [...roster.starters, ...roster.bench];
  const [equipping, setEquipping] = useState<number | null>(null);

  // Step 2: pick a player to equip the chosen bag item onto.
  if (equipping != null) {
    const def = ITEM_BY_ID[bag[equipping]];
    return (
      <Screen style={styles.container}>
        <Text style={styles.title}>EQUIP TO</Text>
        {def ? (
          <Text style={styles.subtitle}>
            {def.name}: {def.blurb}
          </Text>
        ) : null}
        <ScrollView contentContainerStyle={styles.list}>
          {players.map((rp, i) => (
            <Pressable
              key={i}
              style={styles.pick}
              onPress={() => {
                onEquip(equipping, i);
                setEquipping(null);
              }}
            >
              <PlayerCard rp={rp} />
            </Pressable>
          ))}
        </ScrollView>
        <Pressable onPress={() => setEquipping(null)}>
          <Text style={styles.link}>Back</Text>
        </Pressable>
      </Screen>
    );
  }

  const equipped = players.map((rp, i) => ({ rp, i })).filter((x) => x.rp.item);

  return (
    <Screen style={styles.container} bottomGap={space(5)}>
      <Text style={styles.title}>ITEM BAG</Text>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
        <Text style={styles.sectionLabel}>BAG ({bag.length})</Text>
        {bag.length === 0 ? (
          <Text style={styles.hint}>Empty. Items you grab or unequip are kept here.</Text>
        ) : (
          bag.map((defId, i) => {
            const def = ITEM_BY_ID[defId];
            if (!def) return null;
            const color = RARITY_COLOR[def.rarity];
            return (
              <View key={i} style={styles.legendWrap}>
                <LegendaryHalo visible={def.rarity === 'legendary'} />
                <Pressable
                  style={[styles.card, { borderColor: color }]}
                  onPress={() => setEquipping(i)}
                >
                  <View style={styles.cardHead}>
                    <Text style={[styles.cardName, { color }]}>{def.name}</Text>
                    <Text style={[styles.action, { color }]}>EQUIP</Text>
                  </View>
                  <Text style={styles.cardBlurb}>{def.blurb}</Text>
                </Pressable>
              </View>
            );
          })
        )}

        <Text style={styles.sectionLabel}>EQUIPPED</Text>
        {equipped.length === 0 ? (
          <Text style={styles.hint}>No player is holding an item.</Text>
        ) : (
          equipped.map(({ rp, i }) => (
            <View key={i} style={styles.equippedRow}>
              <View style={styles.cardWrap}>
                <PlayerCard rp={rp} />
              </View>
              <Pressable style={styles.unequipBtn} onPress={() => onUnequip(i)}>
                <Text style={styles.unequipText}>TO BAG</Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
      <Pressable style={styles.doneButton} onPress={onDone}>
        <Text style={styles.doneText}>Done</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space(5) },
  title: { fontFamily: FONT.display, fontSize: FONT_SIZE.h3, color: REWARD_CHROME, textAlign: 'center' },
  subtitle: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(2),
  },
  scroll: { flex: 1, alignSelf: 'stretch' },
  list: { marginTop: space(4), gap: space(2), paddingBottom: space(4) },
  sectionLabel: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: REWARD_CHROME,
    marginTop: space(3),
  },
  hint: { fontFamily: FONT.body, fontSize: FONT_SIZE.small, color: palette.inkDim },
  legendWrap: { position: 'relative' }, // anchors a legendary item's gold halo to its card
  card: {
    padding: space(3),
    borderWidth: BORDER.chunk,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.bgPanel,
    gap: space(1),
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardName: { fontFamily: FONT.display, fontSize: FONT_SIZE.body },
  action: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro },
  cardBlurb: { fontFamily: FONT.body, fontSize: FONT_SIZE.small, color: palette.ink },
  equippedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    borderBottomWidth: BORDER.thin,
    borderBottomColor: palette.bgPanel,
    paddingBottom: space(2),
  },
  cardWrap: { flex: 1 },
  unequipBtn: {
    paddingVertical: space(1),
    paddingHorizontal: space(2),
    borderWidth: BORDER.thin,
    borderColor: palette.inkDim,
    borderRadius: RADIUS.chip,
  },
  unequipText: { fontFamily: FONT.display, fontSize: FONT_SIZE.micro, color: palette.inkDim },
  pick: {
    borderWidth: BORDER.chunk,
    borderColor: palette.bgPanel,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.bgPanel,
    padding: space(2),
  },
  link: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.steelBlue,
    textAlign: 'center',
    marginTop: space(3),
  },
  doneButton: {
    alignSelf: 'center',
    marginTop: space(4),
    paddingVertical: space(3),
    paddingHorizontal: space(6),
    borderWidth: BORDER.chunk,
    borderColor: REWARD_CHROME,
    borderRadius: RADIUS.chip,
    backgroundColor: REWARD_CHROME + '1A',
  },
  doneText: { fontFamily: FONT.display, fontSize: FONT_SIZE.label, color: REWARD_CHROME, textAlign: 'center' },
});
