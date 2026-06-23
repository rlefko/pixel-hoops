import { StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import RulesSection from '@/components/RulesSection';
import { ExternalLink } from '@/components/ExternalLink';
import { Text } from '@/components/StyledText';
import { Screen } from '@/components/Screen';
import { palette, FONT, FONT_SIZE, space } from '@/theme';

/** Each titled rules section shown in the How to Play modal. */
const RULES: { title: string; body: string }[] = [
  {
    title: 'THE GOAL',
    body: 'Win each game by outscoring your opponent over 4 quarters. Win to advance the bracket. Lose and the run ends, but your players carry their progress home.',
  },
  {
    title: 'BUILD YOUR FIVE',
    body: 'Set your starting lineup, one player per position. Their ratings and how they fit together decide games, so chase synergies: speedy backcourts, twin towers, lockdown wings.',
  },
  {
    title: 'SET A GAME PLAN',
    body: 'Before tip-off, pick your pace and focus: push the tempo or slow it down, attack inside or rain threes, lock down on defense. The plan shapes how the sim plays out.',
  },
  {
    title: 'WATCH IT PLAY',
    body: 'The game auto-sims possession by possession. Watch the play-by-play, then read the box score. Between games, recruit, train, and rest to compound your roster for the next round.',
  },
];

/** How to Play modal: explains the core loop using reusable rules sections. */
export default function HowToPlayScreen() {
  const router = useRouter();

  return (
    <Screen
      scroll
      onBack={() => router.back()}
      backLabel="CLOSE"
      contentContainerStyle={styles.content}
    >
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    paddingHorizontal: space(5),
  },
  title: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h2,
    color: palette.gold,
    letterSpacing: 3,
    marginBottom: space(4),
  },
  link: {
    paddingVertical: space(4),
  },
  linkText: {
    fontFamily: FONT.body,
    fontSize: FONT_SIZE.body,
    color: palette.steelBlue,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});
