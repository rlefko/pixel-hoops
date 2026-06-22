import { Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Pop } from './Pop';
import { palette, FONT, FONT_SIZE } from '@/theme';

/**
 * An arcade callout ("SWISH!", "REJECTED!", "AND-ONE!") in the pixel font that
 * punches in when it appears. Render keyed on the text so each new callout pops.
 */
interface CalloutProps {
  text: string;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

export function Callout({ text, color = palette.gold, style }: CalloutProps) {
  return (
    <Pop trigger={text} popOnMount style={style}>
      <Text style={[styles.text, { color }]}>{text}</Text>
    </Pop>
  );
}

const styles = StyleSheet.create({
  text: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.h3,
    textAlign: 'center',
  },
});
