import { ScrollView, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import RulesSection from '@/components/RulesSection';
import { ExternalLink } from '@/components/ExternalLink';
import { Text } from '@/components/StyledText';

/** Each titled rules section shown in the How to Play modal. */
const RULES: { title: string; body: string }[] = [
  {
    title: 'THE GOAL',
    body: 'Win each game by outscoring your opponent over 4 quarters. Win to advance the tournament. Lose and the run ends, but your players carry their progress home.',
  },
  {
    title: 'EACH QUARTER',
    body: 'Tap a card to select it, then tap PLAY. You attack on offense while the opponent defends, then the opponent attacks back and you defend. Both possessions resolve at once.',
  },
  {
    title: 'CARD TYPES',
    body: 'Green offense cards score points. Purple defense cards (zone, pressure) blunt the opponent. Orange specials bend the rules: reroll your hand, boost a stat, or carry momentum.',
  },
  {
    title: 'STATS DECIDE',
    body: 'Every play compares your stat against the defender\'s counter. Success rate = your stat / (your stat + their stat). Higher relative stats mean bigger odds and bigger payoffs.',
  },
];

/** How to Play modal: explains the core loop using reusable rules sections. */
export default function HowToPlayScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>HOW TO PLAY</Text>

      {RULES.map(rule => (
        <RulesSection key={rule.title} title={rule.title} body={rule.body} />
      ))}

      <ExternalLink
        style={styles.link}
        href="https://github.com/rlefko/pixel-hoops/blob/main/docs/game-concept.md"
      >
        <Text style={styles.linkText}>Read the full game concept</Text>
      </ExternalLink>

      <Text style={styles.closeButton} onPress={() => router.back()}>
        Got it
      </Text>

      <StatusBar style="light" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A2E',
  },
  content: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFD54F',
    letterSpacing: 3,
    marginBottom: 16,
  },
  link: {
    paddingVertical: 16,
  },
  linkText: {
    fontSize: 13,
    color: '#7FB3FF',
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  closeButton: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFD54F',
    textAlign: 'center',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FFD54F',
    backgroundColor: 'rgba(255,213,79,0.1)',
    marginTop: 16,
    overflow: 'hidden',
  },
});
