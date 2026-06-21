import { StyleSheet } from 'react-native';

import { MonoText } from './StyledText';
import { Text, View } from './Themed';

export interface RulesSectionProps {
  /** Section heading rendered in the accent mono font. */
  title: string;
  /** Body copy explaining this part of the game. */
  body: string;
}

/**
 * A single titled section in the How to Play modal. The title renders in the
 * pixel mono font for arcade flavor, with body copy beneath it.
 */
export default function RulesSection({ title, body }: RulesSectionProps) {
  return (
    <View style={styles.section}>
      <View
        style={styles.titleContainer}
        darkColor="rgba(255,255,255,0.05)"
        lightColor="rgba(0,0,0,0.05)"
      >
        <MonoText style={styles.title}>{title}</MonoText>
      </View>

      <Text
        style={styles.body}
        lightColor="rgba(0,0,0,0.8)"
        darkColor="rgba(255,255,255,0.8)"
      >
        {body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginHorizontal: 24,
    marginVertical: 10,
    alignItems: 'center',
  },
  titleContainer: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 6,
  },
  title: {
    fontSize: 14,
    letterSpacing: 1,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
});
