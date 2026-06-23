import { type ReactNode } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/StyledText';
import { palette, FONT, FONT_SIZE, space } from '@/theme';

/**
 * The one screen shell. Owns the dark background and turns real device safe-area
 * insets (notch, Dynamic Island, Android status bar and gesture bar) into
 * padding so no UI hides behind a cutout. Replaces the per-screen hardcoded
 * paddingTop guesses that over-padded small phones and under-padded big ones.
 *
 * Pass `onBack` to get a fixed top-left exit control (the app's nav lives at the
 * top-left, away from the bottom home indicator). Pass `scroll` for screens
 * whose body should scroll: the inset rides the content so it clears the cutouts
 * while the scroll track stays full-bleed dark.
 */

interface BaseScreenProps {
  children: ReactNode;
  /** Constant gap below the top inset so content keeps a breath. Default space(2). */
  topGap?: number;
  /** Constant gap above the bottom inset. Default space(2). */
  bottomGap?: number;
  /** Merged into the body container (the part that owns design padding). */
  style?: StyleProp<ViewStyle>;
  /** When set, renders a fixed top-left back/exit control. */
  onBack?: () => void;
  /** Label for the back control. Default 'BACK'. */
  backLabel?: string;
}

interface ViewScreenProps extends BaseScreenProps {
  scroll?: false;
}

interface ScrollScreenProps extends BaseScreenProps {
  scroll: true;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

type ScreenProps = ViewScreenProps | ScrollScreenProps;

export function Screen(props: ScreenProps) {
  const insets = useSafeAreaInsets();
  const {
    children,
    topGap = space(2),
    bottomGap = space(2),
    style,
    onBack,
    backLabel = 'BACK',
  } = props;

  const bottom = insets.bottom + bottomGap;
  // The fixed back bar supplies the breath below the notch; otherwise the body does.
  const bodyTop = onBack ? 0 : topGap;

  const body = props.scroll ? (
    <ScrollView
      style={[styles.fill, style]}
      contentContainerStyle={[
        { paddingTop: bodyTop, paddingBottom: bottom },
        props.contentContainerStyle,
      ]}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.fill, { paddingTop: bodyTop, paddingBottom: bottom }, style]}>
      {children}
    </View>
  );

  return (
    <View style={[styles.fill, { paddingTop: insets.top }]}>
      {onBack ? (
        <View style={styles.topBar}>
          <Pressable onPress={onBack} hitSlop={space(3)}>
            <Text style={styles.backText}>{`‹ ${backLabel}`}</Text>
          </Pressable>
        </View>
      ) : null}
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: palette.bgDeep },
  topBar: {
    paddingHorizontal: space(4),
    paddingTop: space(2),
    paddingBottom: space(1),
    alignItems: 'flex-start',
  },
  backText: {
    fontFamily: FONT.display,
    fontSize: FONT_SIZE.label,
    color: palette.gold,
    letterSpacing: 1,
  },
});
