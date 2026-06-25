import { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { PlayerCard } from '@/components/run/PlayerCard';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import { getSpecialty } from '@/game/specialty';
import type { RosterPlayer } from '@/types/roster';

/** Recruit node: pick one of a few depth-scaled candidates for your bench. */

interface RecruitViewProps {
  offers: RosterPlayer[];
  /** Per-option reroll usage; each option can be rerolled once per node. */
  rerolled: boolean[];
  benchCount: number;
  onRecruit: (player: RosterPlayer) => void;
  onReroll: (index: number) => void;
  onSkip: () => void;
}

export function RecruitView({
  offers,
  rerolled,
  benchCount,
  onRecruit,
  onReroll,
  onSkip,
}: RecruitViewProps) {
  // Tapping a card recruits; the chevron just reveals the full ratings, so a
  // single index of the expanded offer keeps the breakdown one tap from a pick.
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <Screen style={styles.container}>
      <Text style={styles.title}>RECRUIT</Text>
      <Text style={styles.subtitle}>
        Add one to your bench ({benchCount} benched)
      </Text>
      <Text style={styles.provisional}>Signed for this run. Clear the run to keep them.</Text>

      <View style={styles.offers}>
        {offers.map((rp, i) => (
          <View key={i} style={styles.card}>
            <Pressable onPress={() => onRecruit(rp)}>
              <PlayerCard
                rp={rp}
                expanded={expanded === i}
                onToggleExpand={() => setExpanded(expanded === i ? null : i)}
              />
            </Pressable>
            <View style={styles.metaRow}>
              <Text style={styles.specialty} numberOfLines={1}>
                {getSpecialty(rp)}
              </Text>
              {rerolled[i] ? (
                <Text style={styles.rerollUsed}>REROLLED</Text>
              ) : (
                <Pressable hitSlop={8} onPress={() => onReroll(i)}>
                  <Text style={styles.reroll}>{'↻'} REROLL</Text>
                </Pressable>
              )}
            </View>
          </View>
        ))}
      </View>

      <Pressable onPress={onSkip}>
        <Text style={styles.skip}>Skip</Text>
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
    color: palette.steelBlue,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(2),
  },
  provisional: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.small,
    color: palette.gold,
    textAlign: 'center',
    marginTop: space(1),
  },
  offers: { marginTop: space(6), gap: space(3) },
  card: {
    padding: space(2),
    borderWidth: BORDER.chunk,
    borderColor: palette.bgPanel,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.bgPanel,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space(1.5),
    paddingTop: space(1),
    borderTopWidth: BORDER.thin,
    borderTopColor: palette.bgDeep,
  },
  specialty: {
    flex: 1,
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.steelBlue,
  },
  reroll: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.gold,
  },
  rerollUsed: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.micro,
    color: palette.inkDim,
  },
  skip: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(6),
  },
});
