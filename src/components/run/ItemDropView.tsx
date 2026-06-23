import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Text } from '@/components/StyledText';
import { PlayerCard } from './PlayerCard';
import { ITEM_RARITY_COLOR } from './item-ui';
import type { ItemDef } from '@/game/items';
import type { Roster } from '@/types/roster';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';

/** Post-combat gear drop (elite/boss): equip it to a player, or leave it. */
interface ItemDropViewProps {
  drop: ItemDef;
  roster: Roster;
  onTake: (playerIndex: number) => void;
  onSkip: () => void;
}

export function ItemDropView({ drop, roster, onTake, onSkip }: ItemDropViewProps) {
  const players = [...roster.starters, ...roster.bench];
  const color = ITEM_RARITY_COLOR[drop.rarity];
  return (
    <View style={styles.container}>
      <Text style={styles.title}>GEAR DROP!</Text>
      <View style={[styles.dropCard, { borderColor: color }]}>
        <Text style={[styles.dropName, { color }]}>{drop.name}</Text>
        <Text style={styles.dropBlurb}>{drop.blurb}</Text>
        <Text style={styles.rarity}>{drop.rarity.toUpperCase()}</Text>
      </View>
      <Text style={styles.subtitle}>Equip it to a player</Text>
      <ScrollView contentContainerStyle={styles.list}>
        {players.map((rp, i) => (
          <Pressable key={i} style={styles.pick} onPress={() => onTake(i)}>
            <PlayerCard rp={rp} />
          </Pressable>
        ))}
      </ScrollView>
      <Pressable onPress={onSkip}>
        <Text style={styles.skip}>Leave it</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bgDeep, padding: space(5), paddingTop: space(10) },
  title: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h3,
    color: palette.gold,
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
  skip: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(4),
  },
});
