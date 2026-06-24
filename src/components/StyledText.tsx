import { Text, TextProps } from './Themed';
import { FONT } from '@/theme';

export { Text, TextProps };

export function MonoText(props: TextProps) {
  return <Text {...props} style={[props.style, { fontFamily: 'SpaceMono' }]} />;
}

/**
 * Chunky pixel font for scores, headers, and callouts. Press Start 2P has a
 * single weight, so do not also apply fontWeight: 'bold'.
 */
export function DisplayText(props: TextProps) {
  return <Text {...props} style={[props.style, { fontFamily: FONT.display }]} />;
}
