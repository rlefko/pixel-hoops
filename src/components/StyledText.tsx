import { Text, TextProps } from './Themed';

export { Text, TextProps };

export function MonoText(props: TextProps) {
  return <Text {...props} style={[props.style, { fontFamily: 'SpaceMono' }]} />;
}
