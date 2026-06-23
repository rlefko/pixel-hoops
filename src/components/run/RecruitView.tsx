import { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from '@/components/StyledText';
import { PlayerCard } from '@/components/run/PlayerCard';
import { palette, FONT, FONT_SIZE, space, RADIUS, BORDER } from '@/theme';
import type { RosterPlayer } from '@/types/roster';

/** Recruit node: pick one of a few depth-scaled candidates for your bench. */

interface RecruitViewProps {
  offers: RosterPlayer[];
  benchCount: number;
  onRecruit: (player: RosterPlayer) => void;
  onSkip: () => void;
}

export function RecruitView({
  offers,
  benchCount,
  onRecruit,
  onSkip,
}: RecruitViewProps) {
  // Tapping a card recruits; the chevron just reveals the full ratings, so a
  // single index of the expanded offer keeps the breakdown one tap from a pick.
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>RECRUIT</Text>
      <Text style={styles.subtitle}>
        Add one to your bench ({benchCount} benched)
      </Text>

      <View style={styles.offers}>
        {offers.map((rp, i) => (
          <Pressable key={i} style={styles.card} onPress={() => onRecruit(rp)}>
            <PlayerCard
              rp={rp}
              expanded={expanded === i}
              onToggleExpand={() => setExpanded(expanded === i ? null : i)}
            />
          </Pressable>
        ))}
      </View>

      <Pressable onPress={onSkip}>
        <Text style={styles.skip}>Skip</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bgDeep,
    padding: space(5),
    paddingTop: space(10),
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
  offers: { marginTop: space(6), gap: space(3) },
  card: {
    padding: space(2),
    borderWidth: BORDER.chunk,
    borderColor: palette.bgPanel,
    borderRadius: RADIUS.chip,
    backgroundColor: palette.bgPanel,
  },
  skip: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.inkDim,
    textAlign: 'center',
    marginTop: space(6),
  },
});
