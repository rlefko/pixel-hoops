import { Text, StyleSheet, type StyleProp, type ViewStyle, type TextStyle } from 'react-native';
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
  /** Extra style for the text itself (e.g. a smaller size so long labels fit). */
  textStyle?: StyleProp<TextStyle>;
}

export function Callout({ text, color = palette.gold, style, textStyle }: CalloutProps) {
  return (
    <Pop trigger={text} popOnMount style={style}>
      <Text style={[styles.text, { color }, textStyle]}>{text}</Text>
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
