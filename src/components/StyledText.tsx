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

/**
 * A single-line label that shrinks its font just enough to fit rather than
 * truncating with an ellipsis. Use for names that vary in length (long real NBA
 * names like "Nickeil Alexander-Walker") so they always read in full while the
 * row keeps a fixed height. Needs a bounded width (a flex or maxWidth parent).
 * `minScale` is the smallest fraction of the base font size it may shrink to;
 * lower it in tighter spaces, raise it where readability matters more than fit.
 */
export function FitText({
  minScale = 0.75,
  numberOfLines = 1,
  ...props
}: TextProps & { minScale?: number; numberOfLines?: number }) {
  return (
    <Text
      {...props}
      numberOfLines={numberOfLines}
      adjustsFontSizeToFit
      minimumFontScale={minScale}
    />
  );
}
